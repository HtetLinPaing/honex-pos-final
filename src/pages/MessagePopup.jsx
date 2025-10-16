import React, { useState, useEffect } from "react";
import { getDatabase, ref, onValue, push, update } from "firebase/database";
import { useShop } from "../context/ShopContext";

export default function MessagePopup({ onClose }) {
  const { currentShop } = useShop();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [targetShop, setTargetShop] = useState("");
  const [shops, setShops] = useState([]);

  const db = getDatabase();

  // 🔹 Load all shops (for dropdown)
  useEffect(() => {
    const shopRef = ref(db, "users");
    const unsubscribe = onValue(shopRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        // ✅ All shops visible (except current one)
        const shopList = Object.keys(data).map((id) => ({
          id,
          ...data[id],
        }));
        setShops(shopList);
      } else {
        setShops([]);
      }
    });
    return () => unsubscribe();
  }, [db]);

  // 🔹 Listen for messages between currentShop ↔ targetShop
  useEffect(() => {
    if (!currentShop?.username || !targetShop) return;

    const chatRef = ref(db, "chats");
    const unsubscribe = onValue(chatRef, (snap) => {
      if (!snap.exists()) {
        setMessages([]);
        return;
      }

      const all = Object.entries(snap.val()).map(([id, m]) => ({ id, ...m }));
      const filtered = all.filter(
        (m) =>
          (m.from === currentShop.username && m.to === targetShop) ||
          (m.to === currentShop.username && m.from === targetShop)
      );

      // Sort by timestamp ascending
      filtered.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(filtered);

      // ✅ Mark messages as read (incoming)
      filtered.forEach((m) => {
        if (m.to === currentShop.username && !m.read) {
          update(ref(db, `chats/${m.id}`), { read: true });
        }
      });
    });

    return () => unsubscribe();
  }, [db, currentShop?.username, targetShop]);

  // 🔹 Send message
  const handleSend = () => {
    if (!input.trim() || !targetShop) return;

    const chatRef = ref(db, "chats");
    push(chatRef, {
      from: currentShop.username,
      fromName: currentShop.shopName || currentShop.username,
      to: targetShop,
      message: input.trim(),
      timestamp: Date.now(),
      read: false,
    });
    setInput("");
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "80px",
        right: "20px",
        width: "400px",
        height: "520px",
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "8px",
        display: "flex",
        flexDirection: "column",
        zIndex: 9999,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px",
          background: "#3b82f6",
          color: "#fff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>💬 Shop Chat</span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#fff",
            fontSize: "18px",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {/* Shop Select */}
      <div style={{ padding: "8px" }}>
        <select
          value={targetShop}
          onChange={(e) => setTargetShop(e.target.value)}
          style={{
            width: "100%",
            padding: "6px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            fontSize: "14px",
          }}
        >
          <option value="">-- Select Shop to Chat --</option>
          {shops
            .filter((s) => s.username !== currentShop.username)
            .map((s) => (
              <option key={s.id} value={s.username}>
                {s.shopName || s.username}
              </option>
            ))}
        </select>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          padding: "10px",
          overflowY: "auto",
          background: "#f9fafb",
        }}
      >
        {messages.length === 0 ? (
          <p style={{ color: "#888", textAlign: "center", marginTop: "40px" }}>
            No messages yet...
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent:
                  m.from === currentShop.username ? "flex-end" : "flex-start",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  background:
                    m.from === currentShop.username ? "#3b82f6" : "#e5e7eb",
                  color: m.from === currentShop.username ? "#fff" : "#000",
                  padding: "8px 10px",
                  borderRadius: "12px",
                  maxWidth: "70%",
                  wordWrap: "break-word",
                }}
              >
                <b style={{ fontSize: "12px" }}>
                  {m.from === currentShop.username
                    ? "Me"
                    : m.fromName || m.from}
                </b>
                <div>{m.message}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input Box */}
      <div
        style={{
          display: "flex",
          padding: "10px",
          borderTop: "1px solid #ddd",
          background: "#fff",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          style={{
            flex: 1,
            border: "1px solid #ccc",
            borderRadius: "8px",
            padding: "8px",
            fontSize: "14px",
          }}
        />
        <button
          onClick={handleSend}
          style={{
            marginLeft: "8px",
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            padding: "8px 14px",
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
