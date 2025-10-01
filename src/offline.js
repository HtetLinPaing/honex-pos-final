import localforage from "localforage";
import { db } from "./firebase";
import { ref, push } from "firebase/database";

localforage.config({
  name: "pos-system"
});

// ✅ Save to local DB (IndexedDB)
export async function saveSaleOffline(saleData) {
  const id = Date.now().toString();
  await localforage.setItem(id, saleData);
  console.log("💾 Saved offline:", saleData);
}

// ✅ Sync when online
export async function syncSalesOnline() {
  const keys = await localforage.keys();
  for (const key of keys) {
    const saleData = await localforage.getItem(key);
    if (saleData) {
      await push(ref(db, "sales/"), saleData);
      await localforage.removeItem(key);
      console.log("☁️ Synced:", saleData);
    }
  }
}

// ✅ Detect online
window.addEventListener("online", () => {
  console.log("🌐 Back online → syncing...");
  syncSalesOnline();
});
