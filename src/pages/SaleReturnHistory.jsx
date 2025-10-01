import React, { useEffect, useState } from "react";
import { useShop } from "../context/ShopContext";
import { getReturnsFromDB } from "../localdb";

import "./SaleReturnHistory.css";

export default function SaleReturnHistory() {
  const { currentShop } = useShop();
  const [history, setHistory] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");

  // Load history
  useEffect(() => {
    if (!currentShop) return;
    (async () => {
      const logs = await getReturnsFromDB(currentShop.username);
      const sorted = logs.reverse(); // latest first
      setHistory(sorted);
      setFiltered(sorted);
    })();
  }, [currentShop]);

  // Filtering
  useEffect(() => {
    let data = [...history];

    if (search.trim()) {
      data = data.filter((h) =>
        h.voucherNo.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (date) {
      data = data.filter((h) =>
        h.date.startsWith(date) // "2025-09-15" ISO date match
      );
    }

    setFiltered(data);
  }, [search, date, history]);

  return (
    <div className="sale-return-history">
      <h2>📜 Sale Return History</h2>

      {/* 🔍 Filters */}
      <div className="filters">
        <input
          type="text"
          placeholder="Search Voucher No..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p>No return records found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Voucher No</th>
              <th>Date</th>
              <th>IN Items</th>
              <th>OUT Items</th>
              <th>Different Amount</th>
              <th>Payment</th>
              <th>Note</th> {/* ✅ New column */}
            </tr>
          </thead>
          <tbody>
            {filtered.map((h, idx) => (
              <tr key={idx}>
                <td>{h.voucherNo}</td>
                <td>{new Date(h.date).toLocaleString()}</td>
                <td>
                  {h.inItems.map((i, ii) => (
                    <div key={ii}>
                      {i.barcode} ({i.color}/{i.size}) ×{i.qty} → {i.amount}
                    </div>
                  ))}
                </td>
                <td>
                  {h.outItems.map((i, ii) => (
                    <div key={ii}>
                      {i.barcode} ({i.color}/{i.size}) ×{i.qty} → {i.amount}
                    </div>
                  ))}
                </td>
                <td>{h.diffAmount}</td>
                <td>{h.payment}</td>
                <td>
                  {/* ✅ Show notes for both IN / OUT */}
                  {h.inItems.map((i, ii) => (
                    <div key={`in-${ii}`}>{i.note || "-"}</div>
                  ))}
                  {h.outItems.map((i, ii) => (
                    <div key={`out-${ii}`}>{i.note || "-"}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
