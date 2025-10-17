// src/pages/LoginPage.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useShop } from "../context/ShopContext";
import "./LoginPage.css";

const BASE_URL = "https://honexpos-2025-default-rtdb.asia-southeast1.firebasedatabase.app";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { setCurrentShop } = useShop();
  const navigate = useNavigate();

  // ✅ Helper to read data from proxy (with fallback search)
  const readUser = async (user) => {
    // 1️⃣ Try direct path (e.g., /users/OSPF.json)
    const mainRes = await fetch(`${BASE_URL}/users/${user}.json`);
    if (mainRes.ok) {
      const mainData = await mainRes.json();
      if (mainData && mainData.username) return mainData;
    }

    // 2️⃣ Try lowercase
    const lowerRes = await fetch(`${BASE_URL}/users/${user.toLowerCase()}.json`);
    if (lowerRes.ok) {
      const lowerData = await lowerRes.json();
      if (lowerData && lowerData.username) return lowerData;
    }

    // 3️⃣ Fallback → search all users to match username field
    const allRes = await fetch(`${BASE_URL}/users.json`);
    if (allRes.ok) {
      const allUsers = await allRes.json();
      for (const key in allUsers) {
        const u = allUsers[key];
        if (u.username?.toLowerCase() === user.toLowerCase()) {
          return u;
        }
      }
    }

    throw new Error("User not found");
  };

  const handleLogin = async () => {
    setError("");

    if (!username || !password) {
      setError("⚠ Username နဲ့ Password ထည့်ပါ");
      return;
    }

    setLoading(true);
    try {
      const data = await readUser(username);

      if (!data || !data.username) {
        setError("❌ ဒီ Shop မရှိပါ");
        setLoading(false);
        return;
      }

      // ✅ username + password တိုက်စစ်
      if (
        data.username.toLowerCase() === username.toLowerCase() &&
        data.password === password
      ) {
        setCurrentShop({
          username: data.username,
          role: data.role,
          shopName: data.shopName || data.username,
          shortName: data.shortName || "",
          phone: data.phone || "",
        });

        navigate("/"); // Dashboard သို့ သွား
      } else {
        setError("❌ Username သို့မဟုတ် Password မှားနေသည်");
      }
    } catch (err) {
      console.error("Login error:", err);
      if (err.message.includes("User not found")) {
        setError("❌ ဒီ Shop မရှိပါ");
      } else {
        setError("❌ Server Error / Network Error");
      }
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
          placeholder="Shop username (ဥပမာ: GMP)"
          value={username}
          onChange={(e) => setUsername(e.target.value.trim())}
          disabled={loading}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />

        <button onClick={handleLogin} disabled={loading}>
          {loading ? "🔄 Logging in..." : "Login"}
        </button>
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
}
