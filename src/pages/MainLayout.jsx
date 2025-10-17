// src/layouts/MainLayout.jsx
import React, { useState, useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import { useShop } from "../context/ShopContext";
import MessageIcon from "./MessageIcon";
import MessagePopup from "./MessagePopup";
import { getDatabase, ref, onValue } from "firebase/database";

export default function MainLayout() {
  const { pendingCount, currentShop, setCurrentShop } = useShop();
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadShops, setUnreadShops] = useState([]);
  const [shopMap, setShopMap] = useState({});
  const [availableShops, setAvailableShops] = useState([]);

  const db = getDatabase();

  // ✅ Grouped shop definitions
  const SHOP_GROUPS = {
    honexpos2025_STPF: ["STHT", "STPF"],
    honexpos2025_DNG: ["DNGHT", "DNGPF"],
    honexpos2025_OS: ["OSHT", "OSPF"],
  };

  // ✅ Load all shop data
  useEffect(() => {
    const shopRef = ref(db, "users");
    return onValue(shopRef, (snap) => {
      if (!snap.exists()) return setShopMap({});
      const data = snap.val();
      const mapping = {};
      Object.entries(data).forEach(([_, s]) => {
        if (!s.username) return;
        mapping[s.username] = {
          username: s.username,
          shopName: s.shopName || s.username,
          password: s.password || "",
          shortName: s.shortName || "",
          branches: s.branches || s.branch || null,
          sharedGroup: s.sharedGroup || null,
        };
      });
      setShopMap(mapping);
    });
  }, [db]);

  // ✅ Available shops for switching
  useEffect(() => {
    if (!currentShop?.username) return setAvailableShops([]);
    const groupEntry = Object.values(SHOP_GROUPS).find((arr) =>
      arr.includes(currentShop.username)
    );
    if (!groupEntry) return setAvailableShops([]);
    const shops = groupEntry.map((uname) => shopMap[uname]).filter(Boolean);
    setAvailableShops(shops);
  }, [currentShop, shopMap]);

  // ✅ Track unread messages
  useEffect(() => {
    if (!currentShop?.username) {
      setUnreadCount(0);
      setUnreadShops([]);
      return;
    }
    const chatRef = ref(db, "chats");
    return onValue(chatRef, (snap) => {
      if (!snap.exists()) return setUnreadCount(0);
      const data = snap.val();
      let count = 0;
      const senders = new Set();
      Object.values(data).forEach((m) => {
        if (m.to === currentShop.username && !m.read) {
          count++;
          senders.add(m.from);
        }
      });
      setUnreadCount(count);
      setUnreadShops(Array.from(senders));
    });
  }, [db, currentShop]);

  // ✅ Shop switch
  const handleShopSwitch = (newUsername) => {
    if (!newUsername || !shopMap[newUsername]) return;
    setCurrentShop(shopMap[newUsername]);
  };

  // ✅ Purchase access limitation
  const PURCHASE_ALLOWED = ["STHT", "STPF", "DNGHT", "DNGPF"];

  return (
    <div className="app-layout">
      <nav className="main-nav">
        <Link to="/">POS</Link>
        <Link to="/report">Daily Sale Report</Link>
        <Link to="/inventory">Inventory</Link>
        <Link to="/transfer">Shop Transfer</Link>
        <Link to="/transfer/history">Transfer History</Link>
        <Link to="/salereturn">Sale Return</Link>
        <Link to="/salereturn/history">Sale Return History</Link>
        <Link to="/lowstock">Low Stock</Link>

        {/* ✅ Purchase only visible to allowed shops */}
        {PURCHASE_ALLOWED.includes(currentShop?.username) && (
          <Link to="/purchase">Purchase</Link>
        )}

        <Link to="/transfer/noti" className="menu noti-badge">
          🔔
          {pendingCount > 0 && <span className="noti-dot">{pendingCount}</span>}
        </Link>

        {/* ✅ Shop switcher */}
        {availableShops.length > 0 && (
          <select
            style={{
              marginLeft: "auto",
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontSize: 14,
            }}
            onChange={(e) => handleShopSwitch(e.target.value)}
            value={currentShop?.username || ""}
          >
            {availableShops.map((s) => (
              <option key={s.username} value={s.username}>
                {s.shopName}
              </option>
            ))}
          </select>
        )}
      </nav>

      <main className="main-content">
        <Outlet />
      </main>

      {/* ✅ Chat icon + popup */}
      <MessageIcon
        onClick={() => setChatOpen(!chatOpen)}
        unreadCount={unreadCount}
        unreadShops={unreadShops}
      />
      {chatOpen && <MessagePopup onClose={() => setChatOpen(false)} />}

      {/* ✅ Footer marquee */}
      <footer
        style={{
          background: "red",
          color: "white",
          padding: "6px 0",
          textAlign: "center",
          position: "fixed",
          bottom: 0,
          width: "100%",
          fontWeight: "bold",
          fontSize: "14px",
          overflow: "hidden",
          zIndex: 1000,
        }}
      >
        <marquee behavior="scroll" direction="left" scrollamount="6">
          ကျေးဇူးပါခင်ဗျ
        </marquee>
      </footer>
    </div>
  );
}
