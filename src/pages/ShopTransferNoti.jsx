// src/pages/ShopTransferNoti.jsx
import React, { useEffect, useState } from "react";
import {
  getDatabase,
  ref,
  onValue,
  update,
  runTransaction,
  get,
} from "firebase/database";
import * as XLSX from "xlsx";
import { useShop } from "../context/ShopContext";

export default function ShopTransferNoti() {
  const { currentShop } = useShop();
  const [logs, setLogs] = useState([]);
  const [shops, setShops] = useState({});
  const [selectedLog, setSelectedLog] = useState(null);
  const [editModal, setEditModal] = useState({ open: false, idx: null });
  const [editItem, setEditItem] = useState({
    color: "",
    size: "",
    qty: 1,
    code: "",
  });

  const [availableColors, setAvailableColors] = useState([]);
  const [availableSizes, setAvailableSizes] = useState([]);
  const [availableQty, setAvailableQty] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
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

      const count = filtered.filter(
        (log) => !log.seenBy?.[currentShop.username]
      ).length;
      setUnreadCount(count);
    });
  }, [currentShop]);

  // ✅ Seen
  const handleSeen = async (logId) => {
    if (!currentShop?.username) return;
    const db = getDatabase();
    await update(ref(db, `transferLogs/${logId}/seenBy`), {
      [currentShop.username]: true,
    });
    setUnreadCount((prev) => (prev > 0 ? prev - 1 : 0));
  };

  // ✅ Accept row
  const handleAccept = async (idx) => {
    if (!selectedLog) return;
    const db = getDatabase();
    const items = [...selectedLog.items];
    const item = items[idx];
    if (item.status && item.status !== "Pending") return;

    items[idx] = { ...item, status: "Accepted" };
    setSelectedLog((prev) => ({ ...prev, items }));

    await update(ref(db, `transferLogs/${selectedLog.id}`), {
      items,
      status: "Accepted",
    });

    const stockRef = ref(
      db,
      `shops/${selectedLog.to}/products/${item.code}/colors/${item.color}/sizes/${item.size}/pcs`
    );
    await runTransaction(stockRef, (cur) => (cur || 0) + item.qty);

    if (item.price) {
      const priceRef = ref(db, `shops/${selectedLog.to}/products/${item.code}`);
      await update(priceRef, { price: item.price });
    }
  };

  // ✅ Cancel row
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

  // ✅ Load available colors & sizes from inventory
  const loadInventory = async (code) => {
    const db = getDatabase();
    const snap = await get(
      ref(db, `shops/${currentShop.username}/products/${code}/colors`)
    );
    if (snap.exists()) {
      const colorsObj = snap.val();
      const colorKeys = Object.keys(colorsObj);
      setAvailableColors(colorKeys);
      return colorsObj;
    } else {
      setAvailableColors([]);
      setAvailableSizes([]);
      setAvailableQty(0);
      return {};
    }
  };

  // ✅ Open Edit Modal
  const openEditModal = async (it, idx) => {
    setEditItem(it);
    setEditModal({ open: true, idx });
    const colorsData = await loadInventory(it.code);

    // load sizes of current color
    if (colorsData[it.color]?.sizes) {
      setAvailableSizes(Object.keys(colorsData[it.color].sizes));
      const qty =
        colorsData[it.color].sizes[it.size]?.pcs > 0
          ? colorsData[it.color].sizes[it.size].pcs
          : 0;
      setAvailableQty(qty);
    }
  };

  // ✅ When color changes
  const handleColorChange = async (color, code) => {
    const db = getDatabase();
    setEditItem({ ...editItem, color, size: "", qty: 1 });
    const sizeSnap = await get(
      ref(
        db,
        `shops/${currentShop.username}/products/${code}/colors/${color}/sizes`
      )
    );
    if (sizeSnap.exists()) {
      setAvailableSizes(Object.keys(sizeSnap.val()));
    } else {
      setAvailableSizes([]);
    }
    setAvailableQty(0);
  };

  // ✅ When size changes
  const handleSizeChange = async (size, code, color) => {
    const db = getDatabase();
    setEditItem({ ...editItem, size, qty: 1 });
    const pcsSnap = await get(
      ref(
        db,
        `shops/${currentShop.username}/products/${code}/colors/${color}/sizes/${size}/pcs`
      )
    );
    if (pcsSnap.exists()) {
      setAvailableQty(pcsSnap.val());
    } else {
      setAvailableQty(0);
    }
  };

  // ✅ Save edit
  const handleEditSave = async () => {
    if (!selectedLog) return;

    if (editItem.qty > availableQty) {
      setErrorMsg(`⚠ Qty မလုံလောက်ပါ (stock: ${availableQty})`);
      return;
    }

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

  // ✅ Detail View
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
                          onClick={() => openEditModal(it, idx)}
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

        {/* ✅ Edit Modal */}
        {editModal.open && (
          <div className="modal-overlay">
            <div className="modal bg-white p-4 rounded shadow w-[300px]">
              <h3 className="text-lg font-bold mb-4">Edit Transfer Item</h3>

              {/* Color */}
              <label>Color:</label>
              <select
                value={editItem.color}
                onChange={(e) =>
                  handleColorChange(e.target.value, editItem.code)
                }
              >
                <option value="">Select color</option>
                {availableColors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Size */}
              <label>Size:</label>
              <select
                value={editItem.size}
                onChange={(e) =>
                  handleSizeChange(
                    e.target.value,
                    editItem.code,
                    editItem.color
                  )
                }
              >
                <option value="">Select size</option>
                {availableSizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* Qty */}
              <label>Qty (stock: {availableQty})</label>
              <input
                type="number"
                min="1"
                value={editItem.qty}
                onKeyDown={(e) => {
                  // ❌ Prevent minus or e/E character
                  if (e.key === "-" || e.key === "e" || e.key === "E") {
                    e.preventDefault();
                  }
                }}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  // ✅ Qty can't be less than 1
                  if (val < 1 || isNaN(val)) return;
                  setEditItem({ ...editItem, qty: val });
                }}
              />

              {errorMsg && (
                <div className="text-red-600 text-sm mt-2">{errorMsg}</div>
              )}

              <div className="flex gap-2 mt-3">
                <button
                  className="btn-cancel"
                  onClick={() => setEditModal({ open: false, idx: null })}
                >
                  Close
                </button>
                <button
                  className="btn-save"
                  onClick={handleEditSave}
                  disabled={!editItem.color || !editItem.size}
                >
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
                Voucher: <span className="text-blue-600">{log.voucherNo}</span>
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
