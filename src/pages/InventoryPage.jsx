import { useEffect, useState } from "react";
import { db } from "../firebase";
import { ref, onValue } from "firebase/database";
import { getProductsFromDB, saveProductsToDB } from "../localdb";
import { useShop } from "../context/ShopContext";
import "../index.css";

function InventoryPage() {
  const { currentShop } = useShop();

  const [products, setProducts] = useState([]);
  const [filtered, setFiltered] = useState([]); // ✅ filtered list
  const [searchTerm, setSearchTerm] = useState(""); // ✅ search input
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

    const processData = (data) => {
      const rows = [];
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
      setFiltered(rows); // initialize filtered list
    };

    if (isOnline) {
      const inventoryRef = ref(db, `shops/${currentShop.username}/products`);
      const unsubscribe = onValue(inventoryRef, async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          processData(data);
          await saveProductsToDB(currentShop.username, data);
        } else {
          setProducts([]);
          setFiltered([]);
        }
      });
      return () => unsubscribe();
    } else {
      (async () => {
        const localData = await getProductsFromDB(currentShop.username);
        if (localData) {
          processData(localData);
        } else {
          setProducts([]);
          setFiltered([]);
        }
      })();
    }
  }, [currentShop, isOnline]);

  // 🔍 Search Filter Logic
  useEffect(() => {
    const lower = searchTerm.toLowerCase();
    const filteredList = products.filter(
      (p) =>
        p.code.toLowerCase().includes(lower) ||
        p.color.toLowerCase().includes(lower) ||
        p.size.toLowerCase().includes(lower) ||
        String(p.price).includes(lower)
    );
    setFiltered(filteredList);
  }, [searchTerm, products]);

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold">
          📦 Inventory — {currentShop?.shopName || "No Shop"}
          {!isOnline && (
            <span className="text-red-500 ml-3">(Offline Mode)</span>
          )}
        </h1>

        {/* ✅ Search Bar */}
        <input
          type="text"
          placeholder="🔍 Search item..."
          className="search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* ✅ Total Qty */}
      {filtered.length > 0 && (
        <div className="total-box mb-4 flex flex-wrap gap-4">
          {/* ✅ Total Qty */}
          <div className="flex-1 bg-white p-4 rounded shadow text-center">
            <div className="label text-gray-600 font-semibold">Total Qty</div>
            <div className="number text-2xl font-bold text-blue-600">
              {filtered.reduce((sum, p) => sum + (p.qty || 0), 0)}
            </div>
          </div>

          {/* ✅ Total Unique Codes */}
          <div className="flex-1 bg-white p-4 rounded shadow text-center">
            <div className="label text-gray-600 font-semibold">Total Codes</div>
            <div className="number text-2xl font-bold text-green-600">
              {new Set(filtered.map((p) => p.code.trim())).size}
            </div>
          </div>
        </div>
      )}

      {/* ✅ Inventory Table */}
      <div className="table-container overflow-x-auto bg-white shadow rounded-md">
        <table className="inventory-table w-full">
          <thead className="bg-gray-200 text-gray-700">
            <tr>
              <th>Code</th>
              <th>Color</th>
              <th>Size</th>
              <th>Qty</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-4 text-gray-500">
                  No products found
                </td>
              </tr>
            ) : (
              filtered.map((p, idx) => (
                <tr key={idx} className="hover:bg-gray-100">
                  <td>{p.code}</td>
                  <td>{p.color}</td>
                  <td>{p.size}</td>
                  <td
                    className={p.qty === 0 ? "text-red-500" : "text-green-700"}
                  >
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
