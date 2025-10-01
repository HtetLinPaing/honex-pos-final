import { useEffect, useState } from "react";
import { db } from "../firebase";
import { ref, onValue } from "firebase/database";
import { getProductsFromDB, saveProductsToDB } from "../localdb";
import { Link } from "react-router-dom";
import { useShop } from "../context/ShopContext";
import "../index.css";

function InventoryPage() {
  const { currentShop, pendingCount } = useShop();

  const [products, setProducts] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // 🌐 Track internet status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 🔄 Fetch Inventory
  useEffect(() => {
    if (!currentShop) return;

    if (isOnline) {
      // ✅ ONLINE → Firebase Live Data
      const inventoryRef = ref(db, `shops/${currentShop.username}/products`);

      const unsubscribe = onValue(inventoryRef, async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          let rows = [];

          // flatten structure: code → colors → sizes
          Object.entries(data).forEach(([code, product]) => {
            Object.entries(product.colors || {}).forEach(([color, cData]) => {
              Object.entries(cData.sizes || {}).forEach(([size, sData]) => {
                rows.push({
                  code,
                  color,
                  size,
                  qty: sData.pcs || 0,
                  price: product.price || 0,
                });
              });
            });
          });

          setProducts(rows);
          // 💾 Save to localDB for offline usage
          await saveProductsToDB(currentShop.username, data);
        } else {
          setProducts([]);
        }
      });

      return () => unsubscribe();
    } else {
      // 📴 OFFLINE → Load from localDB
      (async () => {
        const localData = await getProductsFromDB(currentShop.username);
        if (localData) {
          let rows = [];
          Object.entries(localData).forEach(([code, product]) => {
            Object.entries(product.colors || {}).forEach(([color, cData]) => {
              Object.entries(cData.sizes || {}).forEach(([size, sData]) => {
                rows.push({
                  code,
                  color,
                  size,
                  qty: sData.pcs || 0,
                  price: product.price || 0,
                });
              });
            });
          });
          setProducts(rows);
        } else {
          setProducts([]);
        }
      })();
    }
  }, [currentShop, isOnline]);

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">
       <p>
  📦 Inventory — {currentShop?.shopName || "No Shop"}
</p>

        {!isOnline && <span className="text-red-500">(Offline Mode)</span>}
      </h1>

      <div className="table-container">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Color</th>
              <th>Size</th>
              <th>Qty</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", padding: "12px" }}>
                  No products found
                </td>
              </tr>
            ) : (
              products.map((p, idx) => (
                <tr key={idx}>
                  <td>{p.code}</td>
                  <td>{p.color}</td>
                  <td>{p.size}</td>
                  <td className={p.qty === 0 ? "qty-zero" : "qty-positive"}>
                    {p.qty}
                  </td>
                  <td className="price">{p.price.toLocaleString()} Ks</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      

    </div>
  );
}

export default InventoryPage;
