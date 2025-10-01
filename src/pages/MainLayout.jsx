import React, { useState, useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import { useShop } from "../context/ShopContext";
import MessageIcon from "./MessageIcon";
import MessagePopup from "./MessagePopup";
import { getDatabase, ref, onValue } from "firebase/database";

export default function MainLayout() {
  const { pendingCount, currentShop } = useShop();
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadShops, setUnreadShops] = useState([]);
  const [shopMap, setShopMap] = useState({}); // username → shopName map

  const db = getDatabase();

  // 🔹 Load shops once
  useEffect(() => {
    const shopRef = ref(db, "users");
    return onValue(shopRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const mapping = {};
        Object.values(data).forEach((s) => {
          mapping[s.username] = s.shopName; // ✅ username to shopName
        });
        setShopMap(mapping);
      }
    });
  }, [db]);

  // 🔹 Listen for unread messages
  useEffect(() => {
    if (!currentShop?.username) return;
    const chatRef = ref(db, "chats");
    return onValue(chatRef, (snap) => {
      if (!snap.exists()) {
        setUnreadCount(0);
        setUnreadShops([]);
        return;
      }
      let count = 0;
      let senders = new Set();
      const data = snap.val();
      Object.values(data).forEach((msg) => {
        if (msg.to === currentShop.username && !msg.read) {
          count++;
          senders.add(shopMap[msg.from] || msg.from); // ✅ show shopName if available
        }
      });
      setUnreadCount(count);
      setUnreadShops(Array.from(senders));
    });
  }, [db, currentShop, shopMap]);

  return (
    <div className="app-layout">
      {/* 🌐 Global Navbar */}
      <nav className="main-nav">
        <Link to="/">POS</Link>
        <Link to="/report">Daily Sale report</Link>
        <Link to="/inventory">Inventory</Link>
        <Link to="/transfer">Shop to Shop Transfer</Link>
        <Link to="/transfer/history">Transfer History</Link>
        <Link to="/salereturn">Sale Return</Link>
        <Link to="/salereturn/history">Sale Return History</Link>
        <Link to="/lowstock">Low Stock</Link>
        <Link to="/transfer/noti" className="menu noti-badge">
          🔔 {pendingCount > 0 && <span className="noti-dot">{pendingCount}</span>}
        </Link>
      </nav>

      {/* 📄 Page Content */}
      <main className="main-content">
        <Outlet />
      </main>

      {/* 💬 Floating Message Icon */}
      <MessageIcon
        onClick={() => setChatOpen(!chatOpen)}
        unreadCount={unreadCount}
        unreadShops={unreadShops}
      />

      {/* 💬 Popup Chat Box */}
      {chatOpen && <MessagePopup onClose={() => setChatOpen(false)} />}

      {/* 🔻 Footer Promo Bar */}
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
          🎉 Promo: 1.2.2025 to 1.3.2025 — Buy 1 Get 20% OFF all items 🎉
        </marquee>
      </footer>
    </div>
  );
}
