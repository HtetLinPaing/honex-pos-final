// src/context/ShopContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { getDatabase, ref, onValue } from "firebase/database";

const ShopContext = createContext();

export function ShopProvider({ children }) {
  const [currentShop, setCurrentShop] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  // ✅ Firebase listener → Pending transfer count
  useEffect(() => {
    if (!currentShop?.username) return;
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
  // log ထဲက items တစ်ခုချင်းစီ စစ်
  (log.items || []).forEach((item) => {
    if ((!item.status || item.status === "Pending") &&
        (log.to === currentShop.username || log.from === currentShop.username)) {
      count++;
    }
  });
});
setPendingCount(count);

    });

    return () => unsubscribe();
  }, [currentShop]);

  return (
    <ShopContext.Provider
      value={{
        currentShop,
        setCurrentShop,
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
