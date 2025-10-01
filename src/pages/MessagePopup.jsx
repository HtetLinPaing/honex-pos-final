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

    // 🔹 Load shops list
    useEffect(() => {
        const shopRef = ref(db, "users");
        onValue(shopRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                const shopList = Object.keys(data).map((id) => ({ id, ...data[id] }));
                setShops(shopList);
            }
        });
    }, [db]);

    // 🔹 Listen to chats realtime
    useEffect(() => {
        if (!currentShop?.username || !targetShop) return;
        const chatRef = ref(db, "chats");
        return onValue(chatRef, (snap) => {
            if (snap.exists()) {
                const all = Object.entries(snap.val()).map(([id, m]) => ({ id, ...m }));
                const filtered = all.filter(
                    (m) =>
                        (m.from === currentShop.username && m.to === targetShop) ||
                        (m.to === currentShop.username && m.from === targetShop)
                );
                setMessages(filtered.sort((a, b) => a.timestamp - b.timestamp));

                // ✅ Mark messages as read
                filtered.forEach((m) => {
                    if (m.to === currentShop.username && !m.read) {
                        update(ref(db, `chats/${m.id}`), { read: true });
                    }
                });
            } else {
                setMessages([]);
            }
        });
    }, [db, currentShop.username, targetShop]);

    // 🔹 Send message
    const handleSend = () => {
        if (!input.trim() || !targetShop) return;
        const chatRef = ref(db, "chats");
        push(chatRef, {
            from: currentShop.username,
            fromName: currentShop.shopName, // ✅ Save shopName
            to: targetShop,
            message: input,
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
                }}
            >
                Shop Chat
                <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff" }}>
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
                    }}
                >
                    <option value="">-- Select Shop --</option>
                    {shops
                        .filter((s) => s.username !== currentShop.username)
                        .map((s) => (
                            <option key={s.id} value={s.username}>
                                {s.shopName}
                            </option>
                        ))}
                </select>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, padding: "10px", overflowY: "auto" }}>
                {messages.length === 0 ? (
                    <p style={{ color: "#888" }}>No messages yet...</p>
                ) : (
                    messages.map((m, i) => (
                        <p key={i}>
                            <b>{m.from === currentShop.username ? "Me" : m.fromName || m.from}:</b> {m.message}
                        </p>
                    ))
                )}
            </div>

            {/* Input */}
            <div style={{ display: "flex", padding: "20px" }}>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a message..."
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            handleSend();   // ✅ Enter → send
                        }
                    }}
                    style={{
                        flex: 1,
                        border: "0.5px solid #ccc",
                        borderRadius: "8px",
                        padding: "8px",
                    }}
                />
                <button
                    onClick={handleSend}
                    style={{
                        marginLeft: "8px",
                        background: "#3b82f6",
                        color: "#fff",
                        border: "none",
                        borderRadius: "4px",
                        padding: "4px 10px",
                    }}
                >
                    Send
                </button>
            </div>
        </div>
    );
}
