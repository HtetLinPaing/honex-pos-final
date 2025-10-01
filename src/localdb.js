// localdb.js
import localforage from "localforage";
import { db } from "./firebase";
import { ref, push, set, get, runTransaction } from "firebase/database";

localforage.config({ name: "pos-system" });

/* ================================
  SETTINGS
================================ */
export async function getSettings(shopId) {
  const key = `${shopId}_settings`;
  const settings = (await localforage.getItem(key)) || {
    lastVoucherNo: "",
    lastVoucherDate: "",
    lastVoucherSeq: 0,
  };
  return settings;
}

/* ================================
  Helpers
================================ */
function formatDateKey(date = new Date()) {
  // voucher counter အတွက် သာသုံးမယ် (no slash)
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}${month}${year}`; // e.g. 28092025
}

function getPrefixForShop(shopId) {
  const prefixes = {
    shop1: "GMP",
    shop2: "JS",
    shop3: "MT",
    shop4: "JC",
    shop5: "MDY",
    shop6: "OS",
    shop7: "ST",
    shop8: "STPF",
    shop9: "JCPF",
    shop10: "MDYPF",
    shop11: "OSPF",
  };
  return prefixes[shopId] || "GEN";
}

/* ================================
  VOUCHER GENERATION (atomic online)
================================ */
export async function getNextVoucherNo(shopId) {
  const dateStr = formatDateKey(); // ✅ ddMMyyyy အတွက် date string
  const prefix = getPrefixForShop(shopId);
  const counterKey = `${shopId}_voucherCounter_global`; // ✅ global counter key

  if (navigator.onLine) {
    try {
      const counterRef = ref(db, `shops/${shopId}/voucherCounters/global`);
      const result = await runTransaction(counterRef, (current) => (current || 0) + 1);

      if (result && result.snapshot) {
        const seq = result.snapshot.val() || 0;
        await localforage.setItem(counterKey, seq);

        const paddedSeq = String(seq).padStart(4, "0");
        return `${prefix}-${dateStr}-${paddedSeq}`;
      }
    } catch (err) {
      console.warn("⚠ Firebase transaction failed, fallback local", err);
    }
  }

  // fallback local
  let seq = (await localforage.getItem(counterKey)) || 0;
  seq += 1;
  await localforage.setItem(counterKey, seq);

  const paddedSeq = String(seq).padStart(4, "0");
  return `${prefix}-${dateStr}-${paddedSeq}`;
}


/* ================================
  VOUCHER PREVIEW (no increment)
================================ */
export async function previewVoucherNo(shopId) {
  const dateStr = formatDateKey(); // ✅ same format
  const prefix = getPrefixForShop(shopId);

  const counterKey = `${shopId}_voucherCounter_global`; // ✅ global key
  let seq = (await localforage.getItem(counterKey)) || 0;

  const paddedSeq = String(seq + 1).padStart(4, "0");
  return `${prefix}-${dateStr}-${paddedSeq}`;
}



/* ================================
  SAVE SALE + STOCK UPDATE
================================ */

export async function saveSale(shopId, sale) {
  const salesKey = `${shopId}_sales`;

  // 1. Save to localforage
  const localSales = (await localforage.getItem(salesKey)) || [];

  localSales.push(sale);
  await localforage.setItem(salesKey, localSales);

  // 2. Update stock locally
  const productKey = `${shopId}_products`;
  const localProducts = (await localforage.getItem(productKey)) || {};

  // Local stock update
  for (const item of sale.items) {
    if (localProducts[item.code]?.colors?.[item.color]?.sizes?.[item.size]) {
      localProducts[item.code].colors[item.color].sizes[item.size].pcs -= item.qty;
      if (localProducts[item.code].colors[item.color].sizes[item.size].pcs < 0) {
        localProducts[item.code].colors[item.color].sizes[item.size].pcs = 0;
      }
    }
  }

  // Save updated products locally
  await localforage.setItem(productKey, localProducts);

  // 3. Update stock in Firebase
  if (navigator.onLine) {
    try {
      // Update stock in Firebase using runTransaction
      for (const item of sale.items) {
        const stockRef = ref(
          db,
          `shops/${shopId}/products/${item.code}/colors/${item.color}/sizes/${item.size}/pcs`
        );
        await runTransaction(stockRef, (currentStock) => {
          return (currentStock || 0) - item.qty;  // Update stock in Firebase
        });
      }

      // Push the sale to Firebase after stock is updated
      const saleRef = push(ref(db, `shops/${shopId}/sales`));
      await set(saleRef, sale);
    } catch (err) {
      console.error("❌ Firebase ထဲမှာ sale နဲ့ stock ကို update လုပ်ရာမှာ ပြဿနာရှိတယ်:", err);
    }
  }
}

/* ================================
  SYNC LOCAL SALES TO FIREBASE
================================ */
export async function syncLocalSalesToFirebase(shopId) {
  const salesKey = `${shopId}_sales`;
  const localSales = (await localforage.getItem(salesKey)) || [];

  for (const sale of localSales) {
    try {
      // Firebase မှာ sale ကို push လုပ်ပါ
      const saleRef = push(ref(db, `shops/${shopId}/sales`));
      await set(saleRef, sale);

      // Firebase မှာ inventory ကို update လုပ်ပါ (atomic)
      for (const item of sale.items) {
        const stockRef = ref(
          db,
          `shops/${shopId}/products/${item.code}/colors/${item.color}/sizes/${item.size}/pcs`
        );
        await runTransaction(stockRef, (currentStock) => (currentStock || 0) - item.qty);
      }

      // Sync လုပ်ပြီး sales ကို localforage ထဲကနေဖယ်ရှားပါ
      const updatedLocal = (await localforage.getItem(salesKey)) || [];
      const filtered = updatedLocal.filter((s) => s.voucherNo !== sale.voucherNo);
      await localforage.setItem(salesKey, filtered);
    } catch (err) {
      console.error("❌ Firebase ထဲသို့ sale sync လုပ်ရာမှာ ပြဿနာ:", err);
    }
  }
}


/* ================================
  SALE RETURN
================================ */
export async function getNextReturnVoucherNo(shopId) {
  const key = `${shopId}_returns`;
  const returns = (await localforage.getItem(key)) || [];
  if (returns.length === 0) return "SR-0001";
  const last = returns[returns.length - 1].voucherNo || "SR-0000";
  const lastSeq = parseInt(last.split("-")[1], 10) || 0;
  const nextSeq = String(lastSeq + 1).padStart(4, "0");
  return `SR-${nextSeq}`;
}

export async function saveReturn(shopId, returnData) {
  const key = `${shopId}_returns`;
  const returns = (await localforage.getItem(key)) || [];
  returns.push(returnData);
  await localforage.setItem(key, returns);

  if (navigator.onLine) {
    try {
      const newRef = push(ref(db, `shops/${shopId}/returns`));
      await set(newRef, { ...returnData, shop: shopId });
    } catch (err) {
      console.error("❌ Failed to save return online:", err);
    }
  }
}

export async function getReturnsFromDB(shopId) {
  const key = `${shopId}_returns`;
  const localReturns = (await localforage.getItem(key)) || [];
  if (localReturns.length > 0) return localReturns;

  if (navigator.onLine) {
    const returnsRef = ref(db, `shops/${shopId}/returns`);
    const snapshot = await get(returnsRef);
    if (snapshot.exists()) {
      const data = Object.values(snapshot.val());
      await localforage.setItem(key, data);
      return data;
    }
  }
  return [];
}

/* ================================
  PRODUCTS
================================ */
export async function getProductsFromDB(shopId) {
  const key = `${shopId}_products`;
  const localProducts = (await localforage.getItem(key)) || {};

  if (navigator.onLine) {
    try {
      const productsRef = ref(db, `shops/${shopId}/products`);
      const snapshot = await get(productsRef);
      if (snapshot.exists()) {
        const firebaseProducts = snapshot.val();

        // Merge local offline updates with firebase data
        for (const code in localProducts) {
          if (!firebaseProducts[code]) {
            firebaseProducts[code] = localProducts[code];
          } else {
            for (const color in localProducts[code].colors) {
              if (!firebaseProducts[code].colors[color]) {
                firebaseProducts[code].colors[color] = localProducts[code].colors[color];
              } else {
                for (const size in localProducts[code].colors[color].sizes) {
                  const localQty = localProducts[code].colors[color].sizes[size].pcs || 0;
                  firebaseProducts[code].colors[color].sizes[size].pcs = localQty;
                }
              }
            }
          }
        }

        await localforage.setItem(key, firebaseProducts);
        return firebaseProducts;
      }
    } catch (err) {
      console.error("❌ Failed to fetch products from Firebase:", err);
    }
  }

  return localProducts;
}

export async function saveProductsToDB(shopId, products) {
  try {
    await localforage.setItem(`${shopId}_products`, products);
  } catch (err) {
    console.error("❌ Failed to save products to localDB:", err);
  }
}

/* ================================
  SYNC PRODUCTS FROM FIREBASE
================================ */
export async function syncProductsFromFirebase(shopId) {
  if (!navigator.onLine) {
    return { success: false, message: "⚠ Offline mode: products not synced" };
  }
  try {
    const productsRef = ref(db, `shops/${shopId}/products`);
    const snapshot = await get(productsRef);
    if (snapshot.exists()) {
      const products = snapshot.val();
      const localProducts = (await localforage.getItem(`${shopId}_products`)) || {};

      // Merge local offline changes
      for (const code in localProducts) {
        if (!products[code]) products[code] = localProducts[code];
      }

      await localforage.setItem(`${shopId}_products`, products);
      return { success: true, message: "✅ Products synced from Firebase" };
    }
    return { success: false, message: "⚠ No products found in Firebase" };
  } catch (err) {
    return { success: false, message: "❌ Failed to sync products" };
  }
}

/* ================================
  SYNC SALES FROM FIREBASE
================================ */
export async function syncSalesFromFirebase(shopId) {
  if (!navigator.onLine) {
    return { success: false, message: "⚠ Offline mode: sales not synced" };
  }

  try {
    const salesRef = ref(db, `shops/${shopId}/sales`);
    const snapshot = await get(salesRef);
    if (snapshot.exists()) {
      const sales = Object.values(snapshot.val());
      const localSales = (await localforage.getItem(`${shopId}_sales`)) || [];

      // Only keep unsynced local sales
      const mergedSales = [
        ...sales,
        ...localSales.filter((ls) => !sales.some((s) => s.voucherNo === ls.voucherNo)),
      ];

      await localforage.setItem(`${shopId}_sales`, mergedSales);
      return { success: true, message: "✅ Sales synced from Firebase" };
    }

    return { success: false, message: "⚠ No sales found in Firebase" };
  } catch (err) {
    return { success: false, message: "❌ Failed to sync sales" };
  }
}
