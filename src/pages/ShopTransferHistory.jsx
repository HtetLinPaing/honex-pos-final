// src/pages/ShopTransferHistory.jsx
import React, { useEffect, useState } from "react";
import { getDatabase, ref, get } from "firebase/database";
import { useShop } from "../context/ShopContext";

export default function ShopTransferHistory() {
  const { currentShop } = useShop();
  const [logs, setLogs] = useState([]);
  const [shops, setShops] = useState({});
  const [activeTab, setActiveTab] = useState("in"); // ✅ In/Out tab

  // 🔄 Load Shops Info
  useEffect(() => {
    const db = getDatabase();
    get(ref(db, "users")).then((snapshot) => {
      if (snapshot.exists()) setShops(snapshot.val());
    });
  }, []);

  // 🔄 Load Transfer Logs
  useEffect(() => {
    const db = getDatabase();
    get(ref(db, "transferLogs")).then((snapshot) => {
      if (snapshot.exists()) {
        const rows = Object.entries(snapshot.val() || {}).map(([id, log]) => ({
          id,
          ...log,
          items: log.items || [],
        }));
        setLogs(rows.reverse());
      } else {
        setLogs([]);
      }
    });
  }, []);

  // ✅ In/Out ခွဲ
  const inLogs = logs.filter((log) => log.to === currentShop?.username);
  const outLogs = logs.filter((log) => log.from === currentShop?.username);

  // ✅ Render Table (no actions, no suite)
  const renderTable = (list) => (
    <table className="transfer-table w-full border mb-6">
      <thead>
        <tr className="bg-gray-100">
          <th>Voucher</th>
          <th>Date/Time</th>
          <th>From</th>
          <th>To</th>
          <th>Code</th>
          <th>Color</th>
          <th>Size</th>
          <th>Qty</th>
          
        </tr>
      </thead>
      <tbody>
        {list.length === 0 ? (
          <tr>
            <td colSpan="9" className="text-center p-4">
              No history
            </td>
          </tr>
        ) : (
          list.map((log) =>
            (log.items || []).map((item, idx) => (
              <tr key={`${log.id}-${idx}`}>
                <td>{log.voucherNo}</td>
                <td>{new Date(log.date).toLocaleString()}</td>
                <td>{shops[log.from]?.shopName || log.from}</td>
                <td>{shops[log.to]?.shopName || log.to}</td>
                <td>{item.code}</td>
                <td>{item.color}</td>
                <td>{item.size}</td>
                <td>{item.qty}</td>
            
              </tr>
            ))
          )
        )}
      </tbody>
    </table>
  );

  return (
    <div className="transfer-wrapper p-4">
      <h2 className="text-xl font-bold mb-4">📜 Transfer History</h2>

      {/* ✅ Tab Switch */}
      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setActiveTab("in")}
          className={`tab-btn ${activeTab === "in" ? "active" : ""}`}
        >
          IN (Received)
        </button>
        <button
          onClick={() => setActiveTab("out")}
          className={`tab-btn ${activeTab === "out" ? "active" : ""}`}
        >
          OUT (Sent)
        </button>
      </div>

      {/* ✅ Table Show */}
      {activeTab === "in" ? renderTable(inLogs) : renderTable(outLogs)}
    </div>
  );
}
