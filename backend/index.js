// backend/index.js
// CommonJS style (package.json.type = "commonjs")
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const admin = require("firebase-admin");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/**
 * Initialize firebase-admin once.
 * Supports:
 *  - FIREBASE_SERVICE_ACCOUNT: base64-encoded JSON OR raw JSON string
 *  - GOOGLE_APPLICATION_CREDENTIALS: path to service account json (local)
 * Also requires FIREBASE_DATABASE_URL env var.
 */
function initFirebase() {
  if (admin.apps.length) return; // already initialized

  const dbUrl = process.env.FIREBASE_DATABASE_URL;
  if (!dbUrl) {
    console.warn("FIREBASE_DATABASE_URL not set. RTDB operations will fail without it.");
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";

  if (raw) {
    let sa;
    try {
      // If base64 encoded, decode; otherwise try parse as JSON text
      if (!raw.trim().startsWith("{")) {
        sa = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
      } else {
        sa = JSON.parse(raw);
      }
    } catch (err) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", err.message);
      throw err;
    }

    admin.initializeApp({
      credential: admin.credential.cert(sa),
      databaseURL: dbUrl,
    });
    console.log("Firebase admin initialized from FIREBASE_SERVICE_ACCOUNT.");
    return;
  }

  // If GOOGLE_APPLICATION_CREDENTIALS exists (local), use applicationDefault
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      databaseURL: dbUrl,
    });
    console.log("Firebase admin initialized from GOOGLE_APPLICATION_CREDENTIALS.");
    return;
  }

  // If neither provided, try to initialize with no credential (will fail for admin ops)
  try {
    admin.initializeApp({ databaseURL: dbUrl });
    console.log("Firebase admin initialized with default credentials (may be limited).");
  } catch (err) {
    console.warn("Firebase admin not fully initialized:", err.message);
  }
}

/* ---------- Health check ---------- */
app.get("/api/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

/* ---------- Login (custom, uses RTDB) ----------
   POST /api/login
   Body: { username, password }
   NOTE: This compares plaintext passwords stored in RTDB.
         For production, migrate to hashed passwords and compare server-side (bcrypt).
*/
app.post("/api/login", async (req, res) => {
  try {
    initFirebase();
    const db = admin.database();
    const { username, password } = req.body || {};

    if (!username || !password) return res.status(400).json({ error: "Missing username or password" });

    const snap = await db.ref(`users/${username}`).once("value");
    if (!snap.exists()) return res.status(404).json({ error: "User not found" });

    const user = snap.val();
    if (user.password !== password) return res.status(401).json({ error: "Invalid credentials" });

    // remove sensitive fields
    const safeUser = {
      username: user.username,
      role: user.role,
      shopName: user.shopName || user.username,
      shortName: user.shortName || "",
      phone: user.phone || "",
    };

    return res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

/* ---------- Save Sale to RTDB ----------
   POST /api/saveSale
   Body: sale object (anything)
*/
app.post("/api/saveSale", async (req, res) => {
  try {
    initFirebase();
    const db = admin.database();
    const sale = req.body || {};
    const ref = db.ref("sales").push();
    await ref.set({ ...sale, createdAt: Date.now() });
    return res.json({ success: true, id: ref.key });
  } catch (err) {
    console.error("saveSale error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

/* ---------- Get Sales ----------
   GET /api/sales?limit=50
*/
app.get("/api/sales", async (req, res) => {
  try {
    initFirebase();
    const db = admin.database();
    const limit = parseInt(req.query.limit || "50", 10);
    const snap = await db.ref("sales").orderByChild("createdAt").limitToLast(limit).once("value");
    return res.json(snap.val() || {});
  } catch (err) {
    console.error("getSales error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

/* ---------- Mall API Proxy: sendSale ----------
   POST /api/sendSale
   Body: { PosSales: [...] } (same payload shape as previously)
   Environment variables required:
     - MALL_CLIENT_ID
     - MALL_CLIENT_SECRET
     - MALL_PROPERTY_CODE
     - MALL_POS_INTERFACE_CODE
     - MALL_API_URL
     - optional MALL_TOKEN_URL (default: http://121.54.164.99:8282/connect/token)
*/
app.post("/api/sendSale", async (req, res) => {
  try {
    const {
      MALL_CLIENT_ID,
      MALL_CLIENT_SECRET,
      MALL_PROPERTY_CODE,
      MALL_POS_INTERFACE_CODE,
      MALL_API_URL,
      MALL_TOKEN_URL,
    } = process.env;

    if (!MALL_CLIENT_ID || !MALL_CLIENT_SECRET || !MALL_PROPERTY_CODE || !MALL_POS_INTERFACE_CODE || !MALL_API_URL) {
      return res.status(500).json({ error: "Mall API configuration is missing in environment variables" });
    }

    const tokenUrl = MALL_TOKEN_URL || "http://121.54.164.99:8282/connect/token";
    const now = new Date();
    const batchCode = now.toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);

    const payload = {
      AppCode: "POS-01",
      PropertyCode: MALL_PROPERTY_CODE,
      ClientID: MALL_CLIENT_ID,
      ClientSecret: MALL_CLIENT_SECRET,
      POSInterfaceCode: MALL_POS_INTERFACE_CODE,
      BatchCode: batchCode,
      PosSales: req.body.PosSales || [],
    };

    // 1) Obtain token
    const tokenRes = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: MALL_CLIENT_ID,
        client_secret: MALL_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
    );

    const token = tokenRes.data?.access_token;
    if (!token) throw new Error("No access token from Mall API");

    // 2) Send payload
    const mallRes = await axios.post(MALL_API_URL, payload, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      timeout: 30000,
    });

    return res.json(mallRes.data);
  } catch (err) {
    console.error("sendSale error:", (err.response && err.response.data) || err.message || err);
    return res.status(err.response?.status || 500).json({ error: err.response?.data || err.message || "Server error" });
  }
});

/* ---------- Default catch-all for sanity ---------- */
app.use((req, res) => res.status(404).json({ error: "Not found" }));

/* ---------- Local run ---------- */
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Backend listening: http://localhost:${PORT}`);
  });
}

module.exports = app;
