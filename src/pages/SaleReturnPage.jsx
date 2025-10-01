import React, { useEffect, useState } from "react";
import { useShop } from "../context/ShopContext";
import {
  getNextReturnVoucherNo,
  saveReturn,
  getProductsFromDB,
  saveProductsToDB,
} from "../localdb";
import { db } from "../firebase";
import { ref, runTransaction } from "firebase/database";
import "./SaleReturnPage.css";

export default function SaleReturnPage() {
  const { currentShop } = useShop();

  const [voucherNo, setVoucherNo] = useState("SR-0001");
  const [inItems, setInItems] = useState([]);
  const [outItems, setOutItems] = useState([]);
  const [diffAmount, setDiffAmount] = useState(0);
  const [payment, setPayment] = useState("No");
  const [products, setProducts] = useState({});

  // Load products + voucher no
  useEffect(() => {
    if (!currentShop) return;
    (async () => {
      const next = await getNextReturnVoucherNo(currentShop.username);
      setVoucherNo(next);

      const prods = await getProductsFromDB(currentShop.username);
      setProducts(prods || {});
    })();
  }, [currentShop]);

  // Add row
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
    if (type === "in") setInItems([...inItems, row]);
    else setOutItems([...outItems, row]);
  };

  // Delete row + recalc
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

  // Recalculate total diff
  const recalcDiff = (inArr, outArr) => {
    const inTotal = inArr.reduce((s, i) => s + i.amount, 0);
    const outTotal = outArr.reduce((s, i) => s + i.amount, 0);
    setDiffAmount(inTotal - outTotal);
  };

  // Update row
 // ✅ Fix updateRow for barcode parsing
const updateRow = (type, idx, field, val) => {
  const arr = type === "in" ? [...inItems] : [...outItems];
  arr[idx][field] = val;

  // ✅ Qty check for OUT → must be >= 1
  if (type === "out" && field === "qty") {
    if (val <= 0) {
      alert("⚠ OUT Qty must be at least 1");
      arr[idx].qty = 1;
    }
  }

  // ✅ Handle barcode parsing (IN + OUT)
  if (field === "barcode" && val) {
    const input = val.trim();
    let code = "";
    let color = "";
    let size = "";
    let product = null;

    // 1️⃣ Hangten case → digit only & length >= 16
    if (/^[0-9-]+$/.test(input) && input.length >= 16) {
      code = input.substring(0, 16);
      product = products[code];
    } else {
      // 2️⃣ Prettyfit case
      const parts = input.split(" ");
      if (parts.length >= 3) {
        code = parts[0];
        size = parts[parts.length - 1];
        color = parts.slice(1, -1).join(" ");
      } else {
        const match = input.match(/^([A-Za-z0-9-]+)\s*([A-Za-z]+)\s*(\d+)$/);
        if (match) {
          code = match[1];
          color = match[2];
          size = match[3];
        }
      }
      product = products[code];
    }

    if (!product) {
      alert(`❌ Barcode ${input} not found in inventory`);
      arr[idx].price = 0;
    } else {
      arr[idx].barcode = code;
      arr[idx].price = product.price || 0;

      // ✅ Auto-fill color & size (OUT only)
      if (type === "out") {
        if (color && product.colors[color]) {
          arr[idx].color = color;
          if (size && product.colors[color].sizes[size]) {
            arr[idx].size = size;
          } else {
            arr[idx].size =
              Object.keys(product.colors[color].sizes || {})[0] || "";
          }
        } else {
          const firstColor = Object.keys(product.colors || {})[0] || "";
          arr[idx].color = firstColor;
          arr[idx].size =
            firstColor &&
            Object.keys(product.colors[firstColor].sizes || {})[0];
        }
      }
    }
  }

  // ✅ recalc amount
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



  // ✅ Real-time Inventory Update
  const updateInventory = async (type, items) => {
    let updatedProducts = { ...products };

    for (const it of items) {
      const code = it.barcode.trim();
      if (!updatedProducts[code]) {
        if (type === "out") {
          alert(`❌ ${code} not found in inventory`);
          return false;
        }
        updatedProducts[code] = { price: it.price || 0, colors: {} };
      }

      if (!updatedProducts[code].colors[it.color]) {
        if (type === "out") {
          alert(`❌ ${code} - Color ${it.color} not found`);
          return false;
        }
        updatedProducts[code].colors[it.color] = { sizes: {} };
      }

      if (!updatedProducts[code].colors[it.color].sizes[it.size]) {
        if (type === "out") {
          alert(`❌ ${code} - ${it.color} - Size ${it.size} not available`);
          return false;
        }
        updatedProducts[code].colors[it.color].sizes[it.size] = { pcs: 0 };
      }

      let currentStock =
        updatedProducts[code].colors[it.color].sizes[it.size].pcs || 0;

      if (type === "in") {
        updatedProducts[code].colors[it.color].sizes[it.size].pcs =
          currentStock + it.qty;
      } else {
        if (currentStock < it.qty) {
          alert(
            `❌ ${code} - ${it.color} - ${it.size} has only ${currentStock} pcs. Cannot OUT ${it.qty}.`
          );
          return false;
        }
        updatedProducts[code].colors[it.color].sizes[it.size].pcs =
          currentStock - it.qty;
      }

      // ✅ Firebase stock update
      try {
        const stockRef = ref(
          db,
          `shops/${currentShop.username}/products/${code}/colors/${it.color}/sizes/${it.size}/pcs`
        );
        await runTransaction(stockRef, (cur) => {
          if (type === "in") return (cur || 0) + it.qty;
          if ((cur || 0) < it.qty) {
            throw new Error("Not enough stock in Firebase");
          }
          return (cur || 0) - it.qty;
        });
      } catch (err) {
        console.error("❌ Firebase stock update failed:", err);
        alert("Firebase stock update failed: " + err.message);
        return false;
      }
    }

    await saveProductsToDB(currentShop.username, updatedProducts);
    setProducts(updatedProducts);
    return true;
  };

  // Submit
  const handleSubmit = async () => {
    const missingVocNo = inItems.some(
      (it) => !it.note || it.note.trim() === ""
    );
    if (missingVocNo) {
      alert("⚠ Voc No is required in all IN rows before submitting.");
      return;
    }

    const outOk = await updateInventory("out", outItems);
    if (!outOk) return;

    await updateInventory("in", inItems);

    const log = {
      voucherNo,
      date: new Date().toISOString(),
      inItems,
      outItems,
      diffAmount,
      payment,
      shop: currentShop.username,
    };

    await saveReturn(currentShop.username, log);

    alert(`✅ Sale Return Saved! Voucher: ${voucherNo}`);

    setInItems([]);
    setOutItems([]);
    setDiffAmount(0);
    setPayment("No");

    const next = await getNextReturnVoucherNo(currentShop.username);
    setVoucherNo(next);
  };

  // Render OUT selects
  const renderColorSelect = (it, idx, type) => (
    <select
      className="small"
      value={it.color}
      onChange={(e) => updateRow(type, idx, "color", e.target.value)}
    >
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

  // ====== UI ======
  return (
    <div className="sale-return">
      <h2>🔄 Sale Return</h2>

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
              <th>Voc No</th>
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
                <td>
                  <input
                    className="small"
                    value={it.color}
                    onChange={(e) =>
                      updateRow("in", idx, "color", e.target.value)
                    }
                  />
                </td>
                <td>
                  <input
                    className="small"
                    value={it.size}
                    onChange={(e) =>
                      updateRow("in", idx, "size", e.target.value)
                    }
                  />
                </td>
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
                  <input
                    type="number"
                    className="small no-spin"
                    value={it.price}
                    readOnly
                  />
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
                    className="small no-spin"
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
                    onChange={(e) =>
                      updateRow("in", idx, "note", e.target.value)
                    }
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
                  <input
                    type="number"
                    className="small no-spin"
                    value={it.price}
                    readOnly
                  />
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
                    className="small no-spin"
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
                  <button
                    className="del-btn"
                    onClick={() => deleteRow("out", idx)}
                  >
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
        <button type="submit">Submit</button>
      </form>
    </div>
  );
}
