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

  const readUser = async (user) => {
    // Try a few lookups
    const tryFetch = async (path) => {
      const res = await fetch(path);
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    };

    let data = await tryFetch(`${BASE_URL}/users/${user}.json`);
    if (data && data.username) return data;

    data = await tryFetch(`${BASE_URL}/users/${user.toLowerCase()}.json`);
    if (data && data.username) return data;

    // fallback: fetch all and search username field
    const all = await tryFetch(`${BASE_URL}/users.json`);
    if (all) {
      for (const key in all) {
        const u = all[key];
        if (u.username?.toLowerCase() === user.toLowerCase()) return u;
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

      // username + password check
      if (
        data.username.toLowerCase() === username.toLowerCase() &&
        data.password === password
      ) {
        // IMPORTANT: We include password in stored object so dropdown switch works
        const shopObj = {
          username: data.username,
          role: data.role || "staff",
          shopName: data.shopName || data.username,
          shortName: data.shortName || "",
          phone: data.phone || "",
          password: data.password, // store password to allow dropdown switch without re-login
          branches: data.branches || data.branch || null, // keep branch info
          sharedGroup: data.sharedGroup || null,
        };

        setCurrentShop(shopObj);
        // navigate to main
        navigate("/");
      } else {
        setError("❌ Username သို့မဟုတ် Password မှားနေသည်");
      }
    } catch (err) {
      console.error("Login error:", err);
      if (err.message.includes("User not found")) setError("❌ ဒီ Shop မရှိပါ");
      else setError("❌ Server / Network Error");
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
          placeholder="Shop username"
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
