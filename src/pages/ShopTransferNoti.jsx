// src/pages/ShopTransferNoti.jsx
import React, { useEffect, useState } from "react";
import {
  getDatabase,
  ref,
  onValue,
  update,
  runTransaction,
} from "firebase/database";
import * as XLSX from "xlsx";
import { useShop } from "../context/ShopContext";

export default function ShopTransferNoti() {
  const { currentShop } = useShop();
  const [logs, setLogs] = useState([]);
  const [shops, setShops] = useState({});
  const [selectedLog, setSelectedLog] = useState(null);

  const [editModal, setEditModal] = useState({ open: false, idx: null });
  const [editItem, setEditItem] = useState({ color: "", size: "", qty: 1 });

  const [unreadCount, setUnreadCount] = useState(0);

  // 🔄 Load shops info realtime
  useEffect(() => {
    const db = getDatabase();
    return onValue(ref(db, "users"), (snapshot) => {
      if (snapshot.exists()) setShops(snapshot.val());
    });
  }, []);

  // 🔄 Load transfer logs realtime
  useEffect(() => {
    if (!currentShop?.username) return;
    const db = getDatabase();
    return onValue(ref(db, "transferLogs"), (snapshot) => {
      if (!snapshot.exists()) {
        setLogs([]);
        setUnreadCount(0);
        return;
      }
      const arr = Object.entries(snapshot.val()).map(([id, log]) => ({
        id,
        ...log,
      }));
      const filtered = arr.filter(
        (log) =>
          log.to === currentShop.username || log.from === currentShop.username
      );
      setLogs(filtered.reverse());

      // ✅ unread count calc
      const count = filtered.filter(
        (log) => !log.seenBy?.[currentShop.username]
      ).length;
      setUnreadCount(count);
    });
  }, [currentShop]);

  // ✅ Seen (voucher open လိုက်တာနဲ့ unread clear)
  const handleSeen = async (logId) => {
    if (!currentShop?.username) return;
    const db = getDatabase();
    await update(ref(db, `transferLogs/${logId}/seenBy`), {
      [currentShop.username]: true,
    });
    setUnreadCount((prev) => (prev > 0 ? prev - 1 : 0));
  };

  // ✅ Accept row → Receiver stock +qty + price + update root status
  const handleAccept = async (idx) => {
    if (!selectedLog) return;
    const db = getDatabase();
    const items = [...selectedLog.items];
    const item = items[idx];
    if (item.status && item.status !== "Pending") return;

    items[idx] = { ...item, status: "Accepted" };
    setSelectedLog((prev) => ({ ...prev, items }));

    // Firebase update (log + root status)
    await update(ref(db, `transferLogs/${selectedLog.id}`), {
      items,
      status: "Accepted",
    });

    // qty update
    const stockRef = ref(
      db,
      `shops/${selectedLog.to}/products/${item.code}/colors/${item.color}/sizes/${item.size}/pcs`
    );
    await runTransaction(stockRef, (cur) => (cur || 0) + item.qty);

    // price update
    if (item.price) {
      const priceRef = ref(
        db,
        `shops/${selectedLog.to}/products/${item.code}`
      );
      await update(priceRef, { price: item.price });
    }
  };

  // ✅ Cancel row → Sender stock +qty + update root status
  const handleCancel = async (idx) => {
    if (!selectedLog) return;
    const db = getDatabase();
    const items = [...selectedLog.items];
    const item = items[idx];
    if (item.status && item.status !== "Pending") return;

    items[idx] = { ...item, status: "Cancelled" };
    setSelectedLog((prev) => ({ ...prev, items }));

    await update(ref(db, `transferLogs/${selectedLog.id}`), {
      items,
      status: "Cancelled",
    });

    const stockRef = ref(
      db,
      `shops/${selectedLog.from}/products/${item.code}/colors/${item.color}/sizes/${item.size}/pcs`
    );
    await runTransaction(stockRef, (cur) => (cur || 0) + item.qty);
  };

  // ✅ Save edit (Sender only → qty, color, size)
  const handleEditSave = async () => {
    if (!selectedLog) return;
    const db = getDatabase();
    const items = [...selectedLog.items];
    items[editModal.idx] = {
      ...items[editModal.idx],
      color: editItem.color,
      size: editItem.size,
      qty: editItem.qty,
      price: items[editModal.idx].price || 0,
    };
    setSelectedLog((prev) => ({ ...prev, items }));
    await update(ref(db, `transferLogs/${selectedLog.id}`), { items });
    setEditModal({ open: false, idx: null });
  };

  // ✅ Totals
  const calcTotals = (items) => {
    const all = items.reduce((s, it) => s + it.qty, 0);
    const accepted = items
      .filter((it) => it.status === "Accepted")
      .reduce((s, it) => s + it.qty, 0);
    const cancelled = items
      .filter((it) => it.status === "Cancelled")
      .reduce((s, it) => s + it.qty, 0);
    return { all, accepted, cancelled };
  };

  // ✅ Export Excel
  const handleExport = () => {
    if (!selectedLog) return;
    const ws = XLSX.utils.json_to_sheet(
      selectedLog.items.map((it, idx) => ({
        Sr: idx + 1,
        Code: it.code,
        Color: it.color,
        Size: it.size,
        Qty: it.qty,
        Price: it.price || 0,
        Status: it.status || "Pending",
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transfer Detail");
    XLSX.writeFile(wb, `Voucher-${selectedLog.voucherNo}.xlsx`);
  };

  // 👉 Detail View
  if (selectedLog) {
    const totals = calcTotals(selectedLog.items);
    return (
      <div className="fullscreen-detail p-4">
        <h2 className="text-xl font-bold mb-4">
          Voucher {selectedLog.voucherNo} - Detail
        </h2>
        <p>
          From: <b>{shops[selectedLog.from]?.shopName || selectedLog.from}</b> →
          To: <b>{shops[selectedLog.to]?.shopName || selectedLog.to}</b>
        </p>
        <p>Date: {new Date(selectedLog.date).toLocaleString()}</p>

        <table className="noti-table mt-4">
          <thead>
            <tr>
              <th>Sr</th>
              <th>Code</th>
              <th>Color</th>
              <th>Size</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {selectedLog.items.map((it, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{it.code}</td>
                <td>{it.color}</td>
                <td>{it.size}</td>
                <td>{it.qty}</td>
                <td>{(it.price || 0).toLocaleString()} Ks</td>
                <td>{it.status || "Pending"}</td>
                <td>
                  {selectedLog.from === currentShop.username ? (
                    !it.status || it.status === "Pending" ? (
                      <>
                        <button
                          className="btn-edit"
                          onClick={() => {
                            setEditItem(it);
                            setEditModal({ open: true, idx });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-cancel"
                          onClick={() => handleCancel(idx)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <span className="text-gray-500">✔ Done</span>
                    )
                  ) : selectedLog.to === currentShop.username ? (
                    !it.status || it.status === "Pending" ? (
                      <>
                        <button
                          className="btn-accept"
                          onClick={() => handleAccept(idx)}
                        >
                          Accept
                        </button>
                        <button
                          className="btn-cancel"
                          onClick={() => handleCancel(idx)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : it.status === "Accepted" ? (
                      <span className="text-green-600 font-semibold">
                        ✔ Accepted
                      </span>
                    ) : (
                      <span className="text-red-600 font-semibold">
                        ✘ Cancelled
                      </span>
                    )
                  ) : null}
                </td>
              </tr>
            ))}

            <tr className="font-bold">
              <td colSpan="5" align="right">
                All Qty
              </td>
              <td>{totals.all}</td>
              <td colSpan="2"></td>
            </tr>
            <tr className="font-bold">
              <td colSpan="5" align="right">
                Accepted Qty
              </td>
              <td>{totals.accepted}</td>
              <td colSpan="2"></td>
            </tr>
            <tr className="font-bold">
              <td colSpan="5" align="right">
                Cancelled Qty
              </td>
              <td>{totals.cancelled}</td>
              <td colSpan="2"></td>
            </tr>
          </tbody>
        </table>

        <div className="flex gap-3 mt-4">
          <button className="btn btn-back" onClick={() => setSelectedLog(null)}>
            ⬅ Back
          </button>
          <button className="btn btn-export" onClick={handleExport}>
            ⬇ Export Excel
          </button>
        </div>

        {editModal.open && (
          <div className="modal-overlay">
            <div className="modal bg-white p-4 rounded shadow">
              <h3 className="text-lg font-bold mb-4">Edit Transfer Item</h3>
              <input
                type="text"
                value={editItem.color}
                placeholder="Color"
                onChange={(e) =>
                  setEditItem({ ...editItem, color: e.target.value })
                }
              />
              <input
                type="text"
                value={editItem.size}
                placeholder="Size"
                onChange={(e) =>
                  setEditItem({ ...editItem, size: e.target.value })
                }
              />
              <input
                type="number"
                value={editItem.qty}
                min="1"
                onChange={(e) =>
                  setEditItem({ ...editItem, qty: Number(e.target.value) })
                }
              />
              <div className="flex gap-2 mt-3">
                <button
                  className="btn-cancel"
                  onClick={() => setEditModal({ open: false, idx: null })}
                >
                  Close
                </button>
                <button className="btn-save" onClick={handleEditSave}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 👉 List View
  return (
    <div className="noti-wrapper p-4">
      <h2 className="text-xl font-bold mb-4">
        🔔 Notifications{" "}
        {unreadCount > 0 && (
          <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
            {unreadCount}
          </span>
        )}
      </h2>
      {logs.length === 0 ? (
        <div className="text-gray-500 text-center p-6 border rounded bg-white">
          ✅ No notifications
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`noti-card p-4 border rounded bg-white shadow-sm cursor-pointer hover:shadow-md ${
                !log.seenBy?.[currentShop.username]
                  ? "border-blue-500"
                  : "border-gray-200"
              }`}
              onClick={() => {
                handleSeen(log.id);
                setSelectedLog(log);
              }}
            >
              <p className="font-semibold">
                Voucher:{" "}
                <span className="text-blue-600">{log.voucherNo}</span>
              </p>
              <p className="text-sm text-gray-500">
                From: <b>{shops[log.from]?.shopName || log.from}</b> → To:{" "}
                <b>{shops[log.to]?.shopName || log.to}</b>
              </p>
              <div className="text-xs text-gray-400 mt-2">
                {new Date(log.date).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
