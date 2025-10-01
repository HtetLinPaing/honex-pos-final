// src/pages/LoginPage.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { ref, get } from "firebase/database";
import { useShop } from "../context/ShopContext";
import "./LoginPage.css"; // ✅ CSS

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { setCurrentShop } = useShop();
  const navigate = useNavigate();

  const handleLogin = async () => {
    setError("");

    if (!username || !password) {
      setError("⚠ Username နဲ့ Password ထည့်ပါ");
      return;
    }

    setLoading(true);
    try {
      // username = key name (shop1, shop8 ...etc)
      const snap = await get(ref(db, `users/${username}`));

      if (!snap.exists()) {
        setError("❌ ဒီ Shop မရှိပါ");
        setLoading(false);
        return;
      }

      const userData = snap.val();

      // ✅ username + password တိုက်စစ်
      if (userData.username === username && userData.password === password) {
        setCurrentShop({
          username: userData.username,
          role: userData.role,
          shopName: userData.shopName || userData.username,
          shortName: userData.shortName || "",
          phone: userData.phone || "",
        });

        navigate("/"); // Dashboard သို့ သွား
      } else {
        setError("❌ Username သို့မဟုတ် Password မှားနေသည်");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("❌ Error ဖြစ်သွားသည်");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Shop Login</h2>

        {error && <div className="error-box">{error}</div>}

        <input
          type="text"
          placeholder="Shop username (ဥပမာ: shop1)"
          value={username}
          onChange={(e) => setUsername(e.target.value.trim())}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleLogin();
            }
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleLogin();
            }
          }}
        />

        <button onClick={handleLogin} disabled={loading}>
          {loading ? "🔄 Logging in..." : "Login"}
        </button>
      </div>

      {/* ✅ Overlay Loading Spinner */}
      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
}
