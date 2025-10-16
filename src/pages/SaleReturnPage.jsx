import React, { useEffect, useState } from "react";
import { useShop } from "../context/ShopContext";
import {
  getNextReturnVoucherNo,
  saveReturn,
  getProductsFromDB,
  saveProductsToDB,
} from "../localdb";
import { db } from "../firebase";
import { ref, runTransaction, get, set } from "firebase/database";
import "./SaleReturnPage.css";

export default function SaleReturnPage() {
  const { currentShop } = useShop();

  const [voucherNo, setVoucherNo] = useState("SR-0001");
  const [inItems, setInItems] = useState([]);
  const [outItems, setOutItems] = useState([]);
  const [diffAmount, setDiffAmount] = useState(0);
  const [payment, setPayment] = useState("No");
  const [products, setProducts] = useState({});
  const [loading, setLoading] = useState(false);

  // 🟢 Load products + voucher no
  useEffect(() => {
    if (!currentShop) return;
    (async () => {
      const next = await getNextReturnVoucherNo(currentShop.username);
      setVoucherNo(next);
      const prods = await getProductsFromDB(currentShop.username);
      setProducts(prods || {});
    })();
  }, [currentShop]);

  // ➕ Add row
  const addRow = (type) => {
    const row = {
      barcode: "",
      color: "",
      size: "",
      qty: 1,
      price: 0,
      discountType: "%",
      discountValue: 0,
      note: "",
      amount: 0,
    };
    if (type === "in") setInItems((prev) => [...prev, row]);
    else setOutItems((prev) => [...prev, row]);
  };

  // ❌ Delete row
  const deleteRow = (type, idx) => {
    if (type === "in") {
      const arr = inItems.filter((_, i) => i !== idx);
      setInItems(arr);
      recalcDiff(arr, outItems);
    } else {
      const arr = outItems.filter((_, i) => i !== idx);
      setOutItems(arr);
      recalcDiff(inItems, arr);
    }
  };

  // 🧮 Calculate total difference
  const recalcDiff = (inArr, outArr) => {
    const inTotal = inArr.reduce((s, i) => s + i.amount, 0);
    const outTotal = outArr.reduce((s, i) => s + i.amount, 0);
    setDiffAmount(inTotal - outTotal);
  };

  // ✏️ Update row data
  const updateRow = (type, idx, field, val) => {
    const arr = type === "in" ? [...inItems] : [...outItems];
    arr[idx][field] = val;

    if (field === "barcode" && val) {
      const code = val.trim();
      arr[idx].barcode = code;

      if (products[code]) {
        arr[idx].price = products[code].price || 0;
        arr[idx].color = "";
        arr[idx].size = "";
      } else {
        alert(`❌ Barcode ${code} not found in inventory`);
        arr[idx].price = 0;
      }
    }

    if (field === "color") {
      const code = arr[idx].barcode;
      const color = val;
      if (products[code] && products[code].colors[color]) {
        const firstSize =
          Object.keys(products[code].colors[color].sizes || {})[0] || "";
        arr[idx].size = firstSize;
      }
    }

    const base = arr[idx].qty * arr[idx].price;
    if (arr[idx].discountType === "%")
      arr[idx].amount = base - (base * (arr[idx].discountValue || 0)) / 100;
    else arr[idx].amount = base - (arr[idx].discountValue || 0);

    if (type === "in") {
      setInItems(arr);
      recalcDiff(arr, outItems);
    } else {
      setOutItems(arr);
      recalcDiff(inItems, arr);
    }
  };

  // 🔄 Update inventory (safe + Firebase + Local)
  const updateInventory = async (type, items) => {
    let updatedProducts = { ...products };

    for (const it of items) {
      const code = it.barcode.trim();
      const color = it.color;
      const size = it.size;
      const qty = Number(it.qty || 0);
      if (!code || !color || !size || qty <= 0) continue;

      const stockRef = ref(
        db,
        `shops/${currentShop.username}/products/${code}/colors/${color}/sizes/${size}/pcs`
      );

      try {
        // 🟩 Ensure Firebase node exists
        const snap = await get(stockRef);
        if (!snap.exists()) {
          await set(stockRef, 0);
        }

        // 🟩 Safe transaction
        const result = await runTransaction(stockRef, (cur) => {
          const currentStock = Number(cur);
          const safeStock = isNaN(currentStock) ? 0 : currentStock;

          if (type === "in") {
            return safeStock + qty;
          } else {
            if (safeStock < qty) {
              throw new Error(
                `❌ Not enough stock for ${code} - ${color} - ${size} (have ${safeStock}, need ${qty})`
              );
            }
            return safeStock - qty;
          }
        });

        const newStock = result.snapshot.val();

        if (!updatedProducts[code])
          updatedProducts[code] = { price: it.price || 0, colors: {} };
        if (!updatedProducts[code].colors[color])
          updatedProducts[code].colors[color] = { sizes: {} };
        if (!updatedProducts[code].colors[color].sizes[size])
          updatedProducts[code].colors[color].sizes[size] = { pcs: 0 };

        updatedProducts[code].colors[color].sizes[size].pcs = newStock;
      } catch (err) {
        console.error("❌ Stock update failed:", err);
        alert(err.message);
        return false;
      }
    }

    await saveProductsToDB(currentShop.username, updatedProducts);
    setProducts(updatedProducts);
    return true;
  };

  // 💾 Submit
  const handleSubmit = async () => {
    try {
      setLoading(true);
      const outOk = await updateInventory("out", outItems);
      if (!outOk) return;

      await new Promise((r) => setTimeout(r, 300));

      const inOk = await updateInventory("in", inItems);
      if (!inOk) return;

      const log = {
        voucherNo,
        date: new Date().toISOString(),
        inItems,
        outItems,
        diffAmount,
        payment,
        shop: currentShop.username,
        note:
          [...inItems, ...outItems]
            .map((i) => i.note)
            .filter(Boolean)
            .join(" | ") || "",
      };

      await saveReturn(currentShop.username, log);
      alert(`✅ Sale Return Saved! Voucher: ${voucherNo}`);

      // reset
      setInItems([]);
      setOutItems([]);
      setDiffAmount(0);
      setPayment("No");

      const next = await getNextReturnVoucherNo(currentShop.username);
      setVoucherNo(next);
    } catch (err) {
      alert("❌ Something went wrong: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Select render helpers
  const renderColorSelect = (it, idx, type) => (
    <select
      className="small"
      value={it.color}
      onChange={(e) => updateRow(type, idx, "color", e.target.value)}
    >
      <option value="">Select</option>
      {products[it.barcode] &&
        Object.keys(products[it.barcode].colors || {}).map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
    </select>
  );

  const renderSizeSelect = (it, idx, type) => (
    <select
      className="small"
      value={it.size}
      onChange={(e) => updateRow(type, idx, "size", e.target.value)}
    >
      <option value="">Select</option>
      {products[it.barcode] &&
        products[it.barcode].colors[it.color] &&
        Object.keys(products[it.barcode].colors[it.color].sizes || {}).map(
          (s) => (
            <option key={s} value={s}>
              {s}
            </option>
          )
        )}
    </select>
  );

  return (
    <div className="sale-return">
      <h2>🔄 Sale Return</h2>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Processing... Please wait</p>
        </div>
      )}

      <div className="mb-4">
        <label>Voucher No: </label>
        <input value={voucherNo} readOnly />
      </div>

      {/* IN Section */}
      <div className="mb-4">
        <h3>IN (Customer Return)</h3>
        <button className="add-btn" onClick={() => addRow("in")}>
          + Add IN
        </button>
        <table>
          <thead>
            <tr>
              <th>Barcode</th>
              <th>Color</th>
              <th>Size</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Discount</th>
              <th>Amount</th>
              <th>Note</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {inItems.map((it, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    className="barcode"
                    value={it.barcode}
                    onChange={(e) =>
                      updateRow("in", idx, "barcode", e.target.value)
                    }
                  />
                </td>
                <td>{renderColorSelect(it, idx, "in")}</td>
                <td>{renderSizeSelect(it, idx, "in")}</td>
                <td>
                  <input
                    type="number"
                    className="small no-spin"
                    value={it.qty}
                    onChange={(e) =>
                      updateRow("in", idx, "qty", Number(e.target.value))
                    }
                  />
                </td>
                <td>
                  <input type="number" className="small" value={it.price} readOnly />
                </td>
                <td>
                  <select
                    className="small"
                    value={it.discountType}
                    onChange={(e) =>
                      updateRow("in", idx, "discountType", e.target.value)
                    }
                  >
                    <option value="%">%</option>
                    <option value="Cashback">Cashback</option>
                  </select>
                  <input
                    type="number"
                    className="small"
                    value={it.discountValue}
                    onChange={(e) =>
                      updateRow("in", idx, "discountValue", Number(e.target.value))
                    }
                  />
                </td>
                <td>{it.amount}</td>
                <td>
                  <input
                    className="small"
                    value={it.note}
                    onChange={(e) => updateRow("in", idx, "note", e.target.value)}
                  />
                </td>
                <td>
                  <button className="del-btn" onClick={() => deleteRow("in", idx)}>
                    ✖
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* OUT Section */}
      <div className="mb-4">
        <h3>OUT (Exchange Item)</h3>
        <button className="add-btn" onClick={() => addRow("out")}>
          + Add OUT
        </button>
        <table>
          <thead>
            <tr>
              <th>Barcode</th>
              <th>Color</th>
              <th>Size</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Discount</th>
              <th>Amount</th>
              <th>Note</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {outItems.map((it, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    className="barcode"
                    value={it.barcode}
                    onChange={(e) =>
                      updateRow("out", idx, "barcode", e.target.value)
                    }
                  />
                </td>
                <td>{renderColorSelect(it, idx, "out")}</td>
                <td>{renderSizeSelect(it, idx, "out")}</td>
                <td>
                  <input
                    type="number"
                    className="small no-spin"
                    value={it.qty}
                    onChange={(e) =>
                      updateRow("out", idx, "qty", Number(e.target.value))
                    }
                  />
                </td>
                <td>
                  <input type="number" className="small" value={it.price} readOnly />
                </td>
                <td>
                  <select
                    className="small"
                    value={it.discountType}
                    onChange={(e) =>
                      updateRow("out", idx, "discountType", e.target.value)
                    }
                  >
                    <option value="%">%</option>
                    <option value="Cashback">Cashback</option>
                  </select>
                  <input
                    type="number"
                    className="small"
                    value={it.discountValue}
                    onChange={(e) =>
                      updateRow("out", idx, "discountValue", Number(e.target.value))
                    }
                  />
                </td>
                <td>{it.amount}</td>
                <td>
                  <input
                    className="small"
                    value={it.note}
                    onChange={(e) => updateRow("out", idx, "note", e.target.value)}
                  />
                </td>
                <td>
                  <button className="del-btn" onClick={() => deleteRow("out", idx)}>
                    ✖
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="summary">
        <p>
          <b>Different Amount:</b> {diffAmount}
        </p>
        <div>
          <label>Payment: </label>
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option>No</option>
            <option>Cash</option>
            <option>Kpay</option>
            <option>Wave</option>
            <option>Visa</option>
            <option>MMQR</option>
          </select>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Submit"}
        </button>
      </form>
    </div>
  );
}
