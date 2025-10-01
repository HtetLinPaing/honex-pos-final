import React, { useEffect, useState } from "react";
import { getProductsFromDB } from "../localdb"; // DB functions
import { useShop } from "../context/ShopContext";
import { Link } from "react-router-dom";

export default function LowStockPage() {
  const { currentShop, pendingCount } = useShop();

  const [lowStock, setLowStock] = useState([]);
  const LOW_STOCK_LIMIT = 1; // ✅ threshold (နည်းနည်းချင်းပြချင်တဲ့ stock qty)

  useEffect(() => {
    const fetchLowStock = async () => {
      if (!currentShop) return;

      const data = await getProductsFromDB(currentShop.username);
      const rows = [];

      if (data) {
        Object.entries(data).forEach(([code, product]) => {
          Object.entries(product.colors || {}).forEach(([color, colorData]) => {
            Object.entries(colorData.sizes || {}).forEach(([size, sizeData]) => {
              if ((sizeData.pcs || 0) <= LOW_STOCK_LIMIT) {
                rows.push({
                  code,
                  color,
                  size,
                  qty: sizeData.pcs || 0,
                  price: sizeData.price || product.price || 0,
                });
              }
            });
          });
        });
      }

      setLowStock(rows);
    };

    fetchLowStock();
  }, [currentShop]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h2 className="text-xl font-bold mb-6">⚠️ Low Stock Items</h2>

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
            {lowStock.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center p-4 text-gray-500">
                  🎉 All items have enough stock
                </td>
              </tr>
            ) : (
              lowStock.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.code}</td>
                  <td>{item.color}</td>
                  <td>{item.size}</td>
                  <td className="text-red-600 font-bold">{item.qty}</td>
                  <td>{item.price.toLocaleString()} Ks</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
