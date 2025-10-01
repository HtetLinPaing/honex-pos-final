// src/pages/ShopTransferPage.jsx
import React, { useState, useEffect } from "react";
import { getDatabase, ref, get, update, push } from "firebase/database";
import { getProductsFromDB } from "../localdb";
import { useShop } from "../context/ShopContext";

export default function ShopTransferPage() {
  const { currentShop } = useShop();

  const [barcode, setBarcode] = useState("");
  const [products, setProducts] = useState({});
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [qty, setQty] = useState(1);
  const [items, setItems] = useState([]);
  const [shops, setShops] = useState({});
  const [targetShop, setTargetShop] = useState("");
  const [voucherNo, setVoucherNo] = useState("");

  // 🔄 UI states for loading
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  // Restore from localStorage
  useEffect(() => {
    const savedItems = localStorage.getItem("transfer_items");
    const savedVoucher = localStorage.getItem("transfer_voucher");
    const savedTargetShop = localStorage.getItem("transfer_target");

    if (savedItems) setItems(JSON.parse(savedItems));
    if (savedVoucher) setVoucherNo(savedVoucher);
    if (savedTargetShop) setTargetShop(savedTargetShop);
  }, []);

  // Load shops
  useEffect(() => {
    const db = getDatabase();
    const shopRef = ref(db, "users");
    get(shopRef).then((snapshot) => {
      if (snapshot.exists()) {
        setShops(snapshot.val());
      }
    });
  }, []);

  // Load products
  useEffect(() => {
    if (!currentShop) return;
    (async () => {
      const data = await getProductsFromDB(currentShop.username);
      setProducts(data || {});
    })();
  }, [currentShop]);

  // Barcode submit
  const handleBarcodeSubmit = () => {
    if (!barcode) return;

    const input = barcode.trim();
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
        // e.g. "3347H Brown 36"
        code = parts[0];
        size = parts[parts.length - 1];
        color = parts.slice(1, -1).join(" ");
      } else {
        // e.g. "3347H Brown36" or "R-2234 Red36"
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
      alert("❌ Product not found");
      setBarcode("");
      return;
    }

    setSelectedProduct(product);
    setSelectedColor(color || "");
    setSelectedSize(size || "");
    setQty(1);
    setBarcode(code);
  };

  // Add item
  const handleAddItem = () => {
    if (!selectedProduct || !selectedColor || !selectedSize) return;

    const stock =
      selectedProduct.colors[selectedColor].sizes[selectedSize].pcs || 0;
    if (qty > stock) {
      alert("⚠ Not enough stock");
      return;
    }

    const cleanCode = barcode.trim().substring(0, 16);

    const newItem = {
      code: cleanCode,
      color: selectedColor,
      size: selectedSize,
      qty,
      price: selectedProduct.price || 0,
    };

    const updatedItems = [...items, newItem];
    setItems(updatedItems);
    localStorage.setItem("transfer_items", JSON.stringify(updatedItems));

    setBarcode("");
    setSelectedProduct(null);
    setSelectedColor("");
    setSelectedSize("");
    setQty(1);
  };

  // Delete row
  const handleDelete = (idx) => {
    const updated = items.filter((_, i) => i !== idx);
    setItems(updated);
    localStorage.setItem("transfer_items", JSON.stringify(updated));
  };

  // ✅ Transfer Now
  const handleTransferNow = async () => {
    if (!currentShop || !targetShop) {
      alert("⚠ Please select target shop");
      return;
    }
    if (items.length === 0) {
      alert("⚠ No items to transfer");
      return;
    }
    if (!voucherNo) {
      alert("⚠ Please enter voucher number");
      return;
    }

    setLoading(true);
    setStatusMsg("🚚 Transferring...");

    const db = getDatabase();
    const updates = {};

    const log = {
      from: currentShop.username,
      fromName: currentShop.shopName,
      to: targetShop,
      toName: shops[targetShop]?.shopName || targetShop,
      items,
      date: new Date().toISOString(),
      status: "Pending",
      voucherNo: voucherNo,
    };

    items.forEach((it) => {
      const fromPath = `shops/${currentShop.username}/products/${it.code}/colors/${it.color}/sizes/${it.size}/pcs`;
      updates[fromPath] =
        (products[it.code]?.colors?.[it.color]?.sizes?.[it.size]?.pcs || 0) -
        it.qty;
    });

    try {
      await update(ref(db), updates);
      const logsRef = ref(db, "transferLogs");
      await push(logsRef, log);

      setStatusMsg(`✅ Transfer success! Voucher: ${voucherNo}`);
      setItems([]);
      setVoucherNo("");
      localStorage.removeItem("transfer_items");
      localStorage.removeItem("transfer_voucher");
      localStorage.removeItem("transfer_target");
    } catch (err) {
      console.error(err);
      setStatusMsg("❌ Transfer failed");
    } finally {
      setLoading(false);
    }
  };

  // Keyboard shortcut Ctrl+S → handleTransferNow
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleTransferNow();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const totalQty = items.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="transfer-wrapper p-4 relative">
      {/* Loading / Status Box */}
      {loading || statusMsg ? (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-md text-center">
            <p>{statusMsg}</p>
          </div>
        </div>
      ) : null}

      {/* Top bar */}
      <div className="top-bar flex gap-2 mb-4 items-center">
        <select className="select-box" disabled>
          <option value={currentShop?.username}>
            {currentShop?.shopName || currentShop?.username} (
            {currentShop?.shortName})
          </option>
        </select>
        <span>→</span>

        <select
          className="select-box"
          value={targetShop}
          onChange={(e) => {
            setTargetShop(e.target.value);
            localStorage.setItem("transfer_target", e.target.value);
          }}
        >
          <option value="">To Shop</option>
          {Object.entries(shops).map(([key, shop]) => {
            if (shop.username === currentShop?.username) return null;
            return (
              <option key={key} value={shop.username}>
                {shop.shopName} ({shop.shortName})
              </option>
            );
          })}
        </select>
      </div>

      {/* Voucher Input */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Enter Voucher No"
          value={voucherNo}
          onChange={(e) => {
            setVoucherNo(e.target.value);
            localStorage.setItem("transfer_voucher", e.target.value);
          }}
          className="select-box"
        />
      </div>

      {/* Inputs */}
      <div className="input-row flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Barcode Scan"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleBarcodeSubmit()}
        />
        <select
          value={selectedColor}
          onChange={(e) => {
            setSelectedColor(e.target.value);
            setSelectedSize("");
          }}
          disabled={!selectedProduct}
        >
          <option value="">Color</option>
          {selectedProduct &&
            Object.keys(selectedProduct.colors || {}).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>
        <select
          value={selectedSize}
          onChange={(e) => setSelectedSize(e.target.value)}
          disabled={!selectedColor}
        >
          <option value="">Size</option>
          {selectedColor &&
            Object.entries(
              selectedProduct.colors[selectedColor].sizes || {}
            ).map(([sz, data]) => (
              <option key={sz} value={sz} disabled={data.pcs <= 0}>
                {sz} ({data.pcs})
              </option>
            ))}
        </select>
        <input
          type="number"
          min="1"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          disabled={!selectedSize}
        />
        <button className="btn-submit" onClick={handleAddItem}>
          Add
        </button>
      </div>

      {/* Table */}
      <table className="transfer-table w-full border mb-4">
        <thead>
          <tr className="bg-gray-100">
            <th>Sr</th>
            <th>Code</th>
            <th>Color</th>
            <th>Size</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan="7" className="text-center p-4">
                No items
              </td>
            </tr>
          ) : (
            items.map((it, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{it.code}</td>
                <td>{it.color}</td>
                <td>{it.size}</td>
                <td>{it.qty}</td>
                <td>{it.price}</td>
                <td>
                  <button
                    className="btn-delete"
                    onClick={() => handleDelete(idx)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Total */}
      <div className="total-row mb-4">
        Total Qty: <b>{totalQty}</b>
      </div>

      {/* Transfer Button */}
      <button
        className="btn-transfer w-full mb-6"
        onClick={handleTransferNow}
      >
        🚚 Transfer Now
      </button>
    </div>
  );
}
