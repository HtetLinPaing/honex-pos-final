// src/initShops.js
import { db } from "./firebase";
import { ref, set } from "firebase/database";

/* ================================
   SHOPS DATA (Inventory + Sales)
================================ */
const initialShops = {
  shop1: { inventory: {}, sales: {} },
  shop2: { inventory: {}, sales: {} },
  shop3: { inventory: {}, sales: {} },
  shop4: { inventory: {}, sales: {} },
  shop5: { inventory: {}, sales: {} },
  shop6: { inventory: {}, sales: {} },
  shop7: { inventory: {}, sales: {} },
};

/* ================================
   USERS DATA (Login Credentials)
================================ */
const initialUsers = {
  shop1: { username: "shop1", password: "shop1", role: "admin", shopName: "Shop 1" },
  shop2: { username: "shop2", password: "shop2", role: "admin", shopName: "Shop 2" },
  shop3: { username: "shop3", password: "shop3", role: "staff", shopName: "Shop 3" },
  shop4: { username: "shop4", password: "shop4", role: "admin", shopName: "Shop 4" },
  shop5: { username: "shop5", password: "shop5", role: "admin", shopName: "Shop 5" },
  shop6: { username: "shop6", password: "shop6", role: "admin", shopName: "Shop 6" },
  shop7: { username: "shop7", password: "shop7", role: "admin", shopName: "Shop 7" },
};

/* ================================
   Initialize Shops
================================ */
export async function initShops() {
  await set(ref(db, "shops"), initialShops);
  console.log("✅ 7 shops created in Firebase RTDB");
}

/* ================================
   Initialize Users
================================ */
export async function initUsers() {
  await set(ref(db, "users"), initialUsers);
  console.log("✅ Users (shop1–shop7) initialized in Firebase");
}

/* ================================
   Initialize Both (Shops + Users)
================================ */
export async function initAll() {
  await set(ref(db, "shops"), initialShops);
  await set(ref(db, "users"), initialUsers);
  console.log("✅ Shops + Users initialized in Firebase RTDB");
}
