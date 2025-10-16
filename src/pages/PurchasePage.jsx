import React, { useEffect, useRef, useState } from "react";
import { ref, set, get, runTransaction, onValue } from "firebase/database";
import { db } from "../firebase";
import localforage from "localforage";
import { useShop } from "../context/ShopContext";
import { useToast } from "../context/ToastContext";
import "./PurchasePage.css";

localforage.config({ name: "pos-system" });

export default function PurchasePage() {
  const { currentShop } = useShop();
  const { addToast } = useToast();

  const [tab, setTab] = useState("entry");
  const [autoInvoice, setAutoInvoice] = useState("P-000");
  const [manualInvoice, setManualInvoice] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("");
  const [sizeInput, setSizeInput] = useState("");
  const [price, setPrice] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const codeRef = useRef();

  // --- history ---
  const [invoices, setInvoices] = useState({});
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [loadingHist, setLoadingHist] = useState(false);

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  // ✅ Auto invoice preview + history load
  useEffect(() => {
    if (!currentShop?.username) return;

    previewNextPurchaseNo(currentShop.username).then(setAutoInvoice);

    const purchasesRef = ref(db, `shops/${currentShop.username}/purchases`);
    setLoadingHist(true);
    const unsub = onValue(
      purchasesRef,
      (snap) => {
        setLoadingHist(false);
        setInvoices(snap.exists() ? snap.val() : {});
      },
      (err) => {
        console.error(err);
        setLoadingHist(false);
      }
    );
    return () => unsub();
  }, [currentShop]);

  // ================= HELPER ===================
  async function generateNextInvoice(shopId) {
    const seqRef = ref(db, `purchaseCounters/${shopId}/seq`);
    await runTransaction(seqRef, (cur) => (cur || 0) + 1);
    const snap = await get(seqRef);
    const seq = snap.val() || 1;
    return `P-${String(seq).padStart(3, "0")}`;
  }

  async function previewNextPurchaseNo(shopId) {
    const snap = await get(ref(db, `purchaseCounters/${shopId}/seq`));
    const seq = (snap.exists() ? snap.val() : 0) + 1;
    return `P-${String(seq).padStart(3, "0")}`;
  }

  // ================= ENTRY ===================
  const handleAdd = () => {
    if (!currentShop?.username) return addToast("No shop selected", "warning");
    if (!code) return addToast("Enter Code", "warning");
    if (!color) return addToast("Enter Color", "warning");
    if (!sizeInput) return addToast("Enter Size(s)", "warning");

    const sizes = sizeInput
      .split(/[\s,;]+/)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);

    const newRows = [...rows];
    sizes.forEach((s) => {
      const exists = newRows.find(
        (r) => r.code === code && r.color === color && r.size === s
      );
      if (!exists) {
        newRows.push({
          code,
          color,
          size: s,
          qty: 0, // manual fill
          price: Number(price) || 0,
          invoiceManual: manualInvoice,
        });
      }
    });

    setRows(newRows);
    setCode("");
    setColor("");
    setSizeInput("");
    setPrice("");
    codeRef.current?.focus();
  };

  const handleQtyChange = (i, val) => {
    const arr = [...rows];
    arr[i].qty = Number(val);
    setRows(arr);
  };

  const handleRemoveRow = (i) => setRows(rows.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!currentShop?.username) return addToast("No shop selected", "warning");
    if (rows.length === 0) return addToast("No items", "warning");
    if (rows.some((r) => !r.qty || r.qty <= 0))
      return addToast("Please fill Qty for all items", "warning");

    setLoading(true);
    try {
      const invoiceNo = await generateNextInvoice(currentShop.username);
      const now = new Date().toISOString();

      const items = {};
      rows.forEach((r, i) => {
        items[i] = {
          code: r.code,
          color: r.color,
          size: r.size,
          qty: r.qty,
          price: r.price,
        };
      });

      const record = {
        invoiceNo,
        manualInvoice,
        dateTime: now,
        shop: currentShop.username,
        items,
      };

      await set(
        ref(db, `shops/${currentShop.username}/purchases/${invoiceNo}`),
        record
      );

      // ✅ update stock in Firebase
      for (const r of rows) {
        const stockRef = ref(
          db,
          `shops/${currentShop.username}/products/${r.code}/colors/${r.color}/sizes/${r.size}/pcs`
        );
        await runTransaction(stockRef, (cur) => (cur || 0) + r.qty);
      }

      addToast(`✅ Saved ${invoiceNo}`, "success");

      // reset
      setRows([]);
      setManualInvoice("");
      setAutoInvoice(await previewNextPurchaseNo(currentShop.username));
      setTab("history"); // ✅ switch to history after save
    } catch (err) {
      console.error(err);
      addToast("❌ Save failed: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // ================= HISTORY ===================
  const withinRange = (iso) => {
    if (!iso) return true;
    const d = new Date(iso);
    const from = filterFrom ? new Date(filterFrom) : null;
    const to = filterTo ? new Date(filterTo + "T23:59:59") : null;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const sortedInvoices = Object.entries(invoices).sort(
    (a, b) => new Date(b[1].dateTime) - new Date(a[1].dateTime)
  );

  return (
    <div className="purchase-page">
      <div className="tab-header">
        <button
          className={tab === "entry" ? "active" : ""}
          onClick={() => setTab("entry")}
        >
          🛒 Purchase
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          📜 Purchase History
        </button>
      </div>

      {/* ========== ENTRY ========== */}
      {tab === "entry" && (
        <div className="entry-section">
          <div className="purchase-top">
            <div className="field">
              <label>Invoice (Auto)</label>
              <input value={autoInvoice} readOnly />
            </div>
            <div className="field">
              <label>Invoice (Manual)</label>
              <input
                value={manualInvoice}
                onChange={(e) => setManualInvoice(e.target.value)}
                placeholder="Manual invoice no"
              />
            </div>
          </div>

          <div className="form-row">
            <input
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code / Barcode"
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Color"
            />
            <input
              value={sizeInput}
              onChange={(e) => setSizeInput(e.target.value)}
              placeholder="Sizes (e.g. S M L XL)"
            />
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price"
            />
            <button className="btn-add" onClick={handleAdd}>
              ➕ Add
            </button>
          </div>

          <div className="items-table-wrapper">
            <table className="items-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Color</th>
                  <th>Size</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Invoice</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan="7" align="center">
                      No items added
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.code}</td>
                      <td>{r.color}</td>
                      <td>{r.size}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={r.qty}
                          onChange={(e) => handleQtyChange(i, e.target.value)}
                          style={{ width: "60px", textAlign: "center" }}
                        />
                      </td>
                      <td>{r.price}</td>
                      <td>{r.invoiceManual}</td>
                      <td>
                        <button
                          className="btn-remove"
                          onClick={() => handleRemoveRow(i)}
                        >
                          ✖
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="purchase-actions">
            <button
              className="btn-save"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? "Saving..." : "💾 Save"}
            </button>
          </div>
        </div>
      )}

      {/* ========== HISTORY ========== */}
      {tab === "history" && (
        <div className="history-section">
          <div className="history-filters">
            <label>
              From
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </label>
          </div>

          {loadingHist && <div>Loading...</div>}

          {sortedInvoices.filter(([k, v]) => withinRange(v.dateTime)).length ===
          0 ? (
            <div>No Purchases Found</div>
          ) : (
            sortedInvoices
              .filter(([k, v]) => withinRange(v.dateTime))
              .map(([invNo, rec]) => (
                <div key={invNo} className="invoice-card">
                  <div className="invoice-header">
                    <strong>{invNo}</strong> — {rec.manualInvoice || "-"}{" "}
                    <span>
                      {new Date(rec.dateTime).toLocaleString("en-GB")}
                    </span>
                  </div>
                  <table className="items-table">
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
                      {rec.items &&
                        Object.values(rec.items).map((it, i) => (
                          <tr key={i}>
                            <td>{it.code}</td>
                            <td>{it.color}</td>
                            <td>{it.size}</td>
                            <td>{it.qty}</td>
                            <td>{it.price}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
