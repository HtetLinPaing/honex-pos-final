import { db } from "./firebase";
import { ref, push } from "firebase/database";
import { getAllOfflineSales, removeSale } from "./localdb";
import { useToast } from "./ToastContext";

// Sync offline sales → Firebase
export async function syncSalesOnline(addToast) {
  try {
    const offlineSales = await getAllOfflineSales();

    if (!offlineSales.length) {
      addToast("✅ No offline sales to sync", "info");
      return;
    }

    for (const { key, sale } of offlineSales) {
      try {
        await push(ref(db, "sales"), sale);
        await removeSale(key);
        addToast(`☁️ Synced sale: ${sale.voucherNo}`, "success");
      } catch (err) {
        console.error("❌ Failed to sync sale:", err);
        addToast(`❌ Failed to sync ${sale.voucherNo}`, "error");
      }
    }
  } catch (error) {
    console.error("❌ Sync error:", error);
    addToast("❌ Sync process failed", "error");
  }
}

// Auto run when online
export function setupAutoSync(addToast) {
  window.addEventListener("online", () => {
    addToast("🌐 Back online → syncing...", "info");
    syncSalesOnline(addToast);
  });
}
