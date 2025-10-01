import React from "react";
import { MessageCircle } from "lucide-react";

export default function MessageIcon({ onClick, unreadCount, unreadShops }) {
  return (
    <div style={{ position: "fixed", bottom: "20px", right: "20px", zIndex: 9999 }}>
      {/* Tooltip for unread shops */}
      {unreadCount > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: "100px",
            right: "10px",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: "10px",
            padding: "10px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            fontSize: "13px",
          }}
        >
          <b>New Message from:</b>
          <ul style={{ margin: 0, paddingLeft: "18px" }}>
            {unreadShops.map((s, i) => (
              <li key={i}>{s}</li> // ✅ shopName ပေါ်မယ်
            ))}
          </ul>
        </div>
      )}

      {/* Floating Icon */}
      <div
        onClick={onClick}
        style={{
          cursor: "pointer",
          background: "#3b82f6",
          padding: "30px",
          borderRadius: "50%",
          boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          position: "relative",
        }}
      >
        <MessageCircle size={26} color="#fff" />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              background: "red",
              color: "#fff",
              borderRadius: "50%",
              fontSize: "12px",
              padding: "2px 6px",
            }}
          >
            {unreadCount}
          </span>
        )}
      </div>
    </div>
  );
}
