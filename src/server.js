// server.js (Proxy)
import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const FIREBASE_URL =
  "https://pos-system-5158a-default-rtdb.firebaseio.com";

// ✅ Get Products
app.get("/api/products", async (req, res) => {
  const r = await fetch(`${FIREBASE_URL}/products.json`);
  const data = await r.json();
  res.json(data);
});

// ✅ Save Sale
app.post("/api/sales", async (req, res) => {
  const sale = req.body;
  const r = await fetch(`${FIREBASE_URL}/sales.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sale),
  });
  const data = await r.json();
  res.json(data);
});

app.listen(5000, () => console.log("🚀 Proxy running on http://localhost:5000"));
