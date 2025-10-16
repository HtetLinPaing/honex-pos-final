// src/context/ShopContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { getDatabase, ref, onValue } from "firebase/database";

const ShopContext = createContext();

export function ShopProvider({ children }) {
  const [currentShop, setCurrentShopState] = useState(null); // internal state
  const [branch, setBranch] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  // load saved shop from localStorage (if any)
  useEffect(() => {
    const saved = localStorage.getItem("currentShop");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCurrentShopState(parsed);
      } catch (e) {
        console.error("Invalid saved shop data:", e);
      }
    }
  }, []);

  // whenever currentShop changes, persist to localStorage
  useEffect(() => {
    if (currentShop) {
      localStorage.setItem("currentShop", JSON.stringify(currentShop));
    } else {
      localStorage.removeItem("currentShop");
    }
  }, [currentShop]);

  // firebase listener for transferLogs to calculate pendingCount
  useEffect(() => {
    if (!currentShop?.username) {
      setPendingCount(0);
      return;
    }

    const db = getDatabase();
    const logsRef = ref(db, "transferLogs");

    const unsubscribe = onValue(logsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setPendingCount(0);
        return;
      }

      const logs = snapshot.val();
      let count = 0;

      Object.values(logs).forEach((log) => {
        (log.items || []).forEach((item) => {
          const isPending = !item.status || item.status === "Pending";
          const isMyShop =
            log.to === currentShop.username || log.from === currentShop.username;

          if (isPending && isMyShop) count++;
        });
      });

      setPendingCount(count);
    });

    return () => unsubscribe();
  }, [currentShop]);

  // when currentShop changes, auto-init branch if available
  useEffect(() => {
    if (!currentShop?.branches) {
      setBranch(null);
      return;
    }

    const branches =
      Array.isArray(currentShop.branches)
        ? currentShop.branches
        : Object.keys(currentShop.branches || {});

    setBranch(branches[0] || null);
  }, [currentShop]);

  // wrapper to set current shop (keeps password or other cached fields)
  const setCurrentShop = (shopObj) => {
    // accept either a full shop object or null to logout
    setCurrentShopState(shopObj);
    // localStorage persistence handled by effect above
  };

  return (
    <ShopContext.Provider
      value={{
        currentShop,
        setCurrentShop,
        branch,
        setBranch,
        pendingCount,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  return useContext(ShopContext);
}
