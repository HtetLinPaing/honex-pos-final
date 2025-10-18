import React, { useEffect, useRef, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom"; // Fixing imports
import { Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { ref, set, push } from "firebase/database";
import { db } from "./firebase";
import localforage from "localforage";

import PurchasePage from "./pages/PurchasePage";
import { useShop } from "./context/ShopContext";
import { useToast } from "./context/ToastContext";
import MainLayout from "./pages/MainLayout";
import LoginPage from "./pages/LoginPage";
import DailySaleReport from "./pages/DailySaleReport";
import InventoryPage from "./pages/InventoryPage";
import ShopTransferPage from "./pages/ShopTransferPage";
import ShopTransferNoti from "./pages/ShopTransferNoti";
import ShopTransferHistory from "./pages/ShopTransferHistory";
import LowStockPage from "./pages/LowStockPage";
import SaleReturnPage from "./pages/SaleReturnPage";
import SaleReturnHistory from "./pages/SaleReturnHistory";
const BASE_URL =
  "https://honexpos-2025-default-rtdb.asia-southeast1.firebasedatabase.app";

import {
  getNextVoucherNo,
  previewVoucherNo,
  saveSale,
  getProductsFromDB,
  saveProductsToDB,
  syncProductsFromFirebase,
  syncSalesFromFirebase,
} from "./localdb";
import { checkMemberExists, sendOTP, verifyOTP } from "./memberBackup";

import "./index.css";

function POSAppInner() {
  const { currentShop } = useShop();
  const { addToast } = useToast();
  const inputRef = useRef(null);
  const scanTimeout = useRef(null);
  // 🏪 ➕ ADD ADDRESS STATE
  const [shopAddress, setShopAddress] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState(0);

  if (!currentShop) return <Navigate to="/login" replace />;

  // 🔽 Helper function for log
  const getShopLogo = (shopId) => {
    const hangtenShops = [
      "shop1",
      "shop2",
      "shop3",
      "shop4",
      "shop5",
      "STHT",
      "DNGHT",
      "OSHT",
    ];
    const prettyfitShops = ["STPF", "shop9", "shop10", "DNGPF", "OSPF"];

    if (hangtenShops.includes(shopId)) {
      return "./logo.png"; // ✅ relative path
    }
    if (prettyfitShops.includes(shopId)) {
      return "./prettyfit-logo.png"; // ✅ relative path
    }
    return "./logo.png"; // fallback
  };

  // STATES
  const [barcode, setBarcode] = useState("");
  const [items, setItems] = useState([]);
  const [voucherNo, setVoucherNo] = useState("GMP-000");
  const [couponCode, setCouponCode] = useState("");
  const [couponAmount, setCouponAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const BASE_URL = "https://realtime.honexpos.site";

  useEffect(() => {
    // Save items to localforage whenever `items` changes
    const saveItems = async () => {
      await localforage.setItem("posItems", items);
    };
    saveItems();
  }, [items]);

  useEffect(() => {
    const loadItems = async () => {
      const savedItems = await localforage.getItem("posItems");
      if (savedItems) {
        setItems(savedItems);
      }
    };
    loadItems();
  }, []);

  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [cashPaid, setCashPaid] = useState("");
  const [change, setChange] = useState(0);
  const [showDialog, setShowDialog] = useState(false);

  const [memberPhone, setMemberPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [memberVerified, setMemberVerified] = useState(false);
  const [memberExists, setMemberExists] = useState(null);
  const [confirmation, setConfirmation] = useState(null);

  if (!currentShop) {
    return <Navigate to="/login" replace />;
  }

  const total = items.reduce((s, i) => s + i.qty * i.price, 0);
  const discount = items.reduce((s, i) => {
    const base = i.qty * i.price;
    if (i.discountType === "%") return s + (base * i.discountValue) / 100;
    if (i.discountType === "Cashback") return s + i.discountValue;
    return s;
  }, 0);
  const afterDiscount = total - discount;
  const memberDiscount = memberVerified ? Math.round(afterDiscount * 0.1) : 0;

  // 👉 Coupon only applies if item has no discount type or discount value
  const couponApplicableTotal = items
    .filter((i) => !i.discountValue || i.discountValue === 0)
    .reduce((s, i) => s + i.qty * i.price, 0);

  const appliedCoupon = Math.min(couponAmount, couponApplicableTotal);
  const finalTotal = afterDiscount - memberDiscount - appliedCoupon;

  // Convert current date to dd/MM/yyyy format
  const formattedDate = new Date().toLocaleDateString("en-GB"); // dd/MM/yyyy format
  const formattedTime = new Date().toLocaleTimeString("en-GB", {
    hour12: false,
  }); // HH:mm:ss format
  const formattedDateTime = `${formattedDate} ${formattedTime}`; // Combine date and time

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "F4") {
        e.preventDefault(); // F4 key ကို မသုံးနိုင်အောင်ဆဲ

        if (items.length === 0) {
          addToast("⚠ Add items before saving", "warning");
          return;
        }

        setShowDialog(true); // Open payment dialog box on F4 press
      }

      if (e.key === "Enter") {
        if (e.repeat) return; // Prevent Enter key from repeating

        // Only proceed if the payment dialog is open
        if (showDialog && !submitting) {
          setTimeout(() => {
            if (items.length === 0) {
              addToast("⚠ Add items before saving", "warning");
              return;
            }
            handleConfirmPrint(); // Call Save and Print functionality
          }, 300); // Adjust delay if necessary
        }
      }
    };

    // Add event listener for keydown
    window.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener on component unmount
    return () => {
      window.removeEventListener("keydown", handleKeyDown); // Clean up event listener
    };
  }, [items, showDialog, submitting]); // Depend on items, dialog and submitting states

  // ===================== SYNC =====================

  useEffect(() => {
    if (!currentShop?.username) return;

    const offlineHandler = () =>
      addToast("⚠ Offline, using local DB", "warning");

    const doSync = async () => {
      if (!navigator.onLine) return; // Skip sync if offline
      try {
        const previewNo = await previewVoucherNo(currentShop.username);
        setVoucherNo(previewNo);

        // Sync products from Firebase
        const productSync = await syncProductsFromFirebase(
          currentShop.username
        );
        if (productSync.success) addToast(productSync.message, "success");

        // Sync Sales
        const salesKey = `${currentShop.username}_sales`;
        const localSales = (await localforage.getItem(salesKey)) || [];

        // Flag to prevent multiple syncs
        const syncedSalesKey = `${currentShop.username}_sales_synced`;
        const isSynced = await localforage.getItem(syncedSalesKey);

        if (!isSynced) {
          // Only sync local sales if not already synced
          for (const sale of localSales) {
            const saleRef = push(
              ref(db, `shops/${currentShop.username}/sales`)
            );
            await set(saleRef, sale);
          }
          await localforage.setItem(syncedSalesKey, true); // Mark as synced
          addToast("✅ Local sales synced to Firebase", "success");
        }

        // Ensure local sales are saved back
        await localforage.setItem(salesKey, localSales);

        // Sync Returns
        const returnKey = `${currentShop.username}_returns`;
        const localReturns = (await localforage.getItem(returnKey)) || [];
        for (const ret of localReturns) {
          const returnRef = push(
            ref(db, `shops/${currentShop.username}/returns`)
          );
          await set(returnRef, ret);
        }
        await localforage.setItem(returnKey, localReturns);
        addToast("✅ Local returns synced to Firebase", "success");
      } catch (err) {
        // Handle errors without showing toast
        console.error("Sync error:", err);
        // Optionally log errors somewhere (e.g., to an external service)
      }
    };

    if (navigator.onLine) doSync(); // Trigger sync on initial load if online

    // Event listeners for online/offline changes
    window.addEventListener("online", doSync);
    window.addEventListener("offline", offlineHandler);

    // Cleanup event listeners on unmount
    return () => {
      window.removeEventListener("online", doSync);
      window.removeEventListener("offline", offlineHandler);
    };
  }, [currentShop]);

  // ===================== BARCODE =====================

 // ✅ Auto detect barcode without pressing Enter
useEffect(() => {
  const detectBarcode = async () => {
    const val = barcode.trim();
    if (!val) return;

    const products = await getProductsFromDB(currentShop.username);
    // inventory မှာ code တူတာရှိရင်သာ auto scan
    if (Object.keys(products || {}).some((key) => val.startsWith(key))) {
      handleScan(val);
    }
  };

  detectBarcode();
}, [barcode]);


  const handleScan = async (rawCode) => {
    if (!rawCode) return;
    const input = rawCode.trim();
    const products = await getProductsFromDB(currentShop.username);

    let code = "";
    let color = "";
    let size = "";

    // ✅ Support both Hangten & Prettyfit format
    if (/^(exp-)?[0-9-]+$/.test(input.toLowerCase())) {
      // --------------------
      // 🟢 Hangten format (e.g. exp-10410-131-001-01)
      // --------------------
      const cleanInput = input.replace(/^exp-/i, "");
      const parts = cleanInput.split("-");
      if (parts.length >= 4) {
        code = `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;
      } else if (parts.length >= 3) {
        code = `${parts[0]}-${parts[1]}-${parts[2]}`;
      } else {
        code = cleanInput;
      }

      const product = products?.[code];
      if (!product) {
        addToast(`❌ Product not found in inventory: ${code}`, "error");
        setBarcode("");
        return;
      }

      const colors = Object.keys(product.colors || {});
      const defaultColor = colors[0] || "";
      const sizes = product.colors?.[defaultColor]?.sizes || {};
      const availableSizes = Object.keys(sizes);
      const defaultSize = availableSizes[0] || "";

      if (!defaultColor || !defaultSize) {
        addToast(`❌ Product missing color/size data: ${code}`, "warning");
        setBarcode("");
        return;
      }

      // ✅ Build new item
      const stockQty = sizes[defaultSize]?.pcs || 0;
      const newItem = {
        code,
        colors,
        color: defaultColor,
        size: defaultSize,
        availableSizes,
        qty: 1,
        price: product.price || 0,
        discountType: "%",
        discountValue: 0,
        stock: product.colors,
        uiStock: Math.max(0, stockQty - 1),
        finalAmount: product.price || 0,
        note: "",
      };

      setItems((prev) => [...prev, newItem]);
      setBarcode("");
      inputRef.current?.focus();
      return;
    }

    // --------------------
    // 🟣 Prettyfit format (e.g. 10362-131-045-67 / CODE COLOR SIZE)
    // --------------------
    const parts = input.split(" ");
    if (parts.length >= 3) {
      code = parts[0];
      size = parts[parts.length - 1];
      color = parts.slice(1, -1).join(" ");
    } else {
      code = input;
    }

    const product = products?.[code];
    if (!product) {
      addToast(`❌ Product not found in inventory: ${code}`, "error");
      setBarcode("");
      return;
    }

    const colors = Object.keys(product.colors || {});
    if (colors.length === 0) {
      addToast(`❌ No color data for: ${code}`, "error");
      setBarcode("");
      return;
    }

    const matchedColor =
      colors.find(
        (c) =>
          c.toLowerCase().replace(/\s+/g, "") ===
          (color || "").toLowerCase().replace(/\s+/g, "")
      ) || colors[0];

    const sizesObj = product.colors?.[matchedColor]?.sizes || {};
    if (Object.keys(sizesObj).length === 0) {
      addToast(`❌ No sizes for color: ${matchedColor}`, "error");
      setBarcode("");
      return;
    }

    const matchedSize =
      Object.keys(sizesObj).find((s) => s === size) || Object.keys(sizesObj)[0];

    const stockQty = sizesObj[matchedSize]?.pcs || 0;

    // ✅ Only add item if product exists and has stock record
    const newItem = {
      code,
      colors,
      color: matchedColor,
      size: matchedSize,
      availableSizes: Object.keys(sizesObj),
      qty: 1,
      price: product.price || 0,
      discountType: "%",
      discountValue: 0,
      stock: product.colors,
      uiStock: Math.max(0, stockQty - 1),
      finalAmount: product.price || 0,
      note: "",
    };

    setItems((prev) => [...prev, newItem]);
    setBarcode("");
    inputRef.current?.focus();
  };

  // ===================== ITEM CHANGE =====================
  const handleChangeItem = (index, field, value) => {
    const arr = [...items];
    const it = arr[index];
    if (!it) return;

    if (field === "color") {
      it.color = value;
      const sizes = it.stock[value]?.sizes || {};
      it.availableSizes = Object.keys(sizes);
      if (!it.availableSizes.includes(it.size)) {
        it.size = it.availableSizes[0] || "";
      }
    } else if (field === "size") {
      it.size = value;
    } else if (field === "qty") {
      it.qty = Number(value) || 1;
    } else if (field === "discountType") {
      it.discountType = value;
    } else if (field === "discountValue") {
      it.discountValue = Number(value) || 0; // NaN ဖြစ်ရင် 0 သတ်မှတ်
    } else if (field === "note") {
      it.note = value; // ✅ Add this line
    }

    // ✅ stock တွက်ချက်တာ
    const sizes = it.stock[it.color]?.sizes || {};
    const originalStock = sizes[it.size]?.pcs || 0;
    const totalDeduct = arr
      .filter(
        (x) => x.code === it.code && x.color === it.color && x.size === it.size
      )
      .reduce((s, x) => s + x.qty, 0);
    it.uiStock = Math.max(0, originalStock - totalDeduct);

    // ✅ discount တွက်ချက်တာ
    const base = it.qty * it.price;
    let disc = 0;
    if (it.discountType === "%") {
      disc = (base * it.discountValue) / 100;
    } else if (it.discountType === "Cashback") {
      disc = it.discountValue;
    }
    it.finalAmount = base - disc;

    arr[index] = it;
    setItems(arr);
  };

  const handleDelete = (idx) => setItems((p) => p.filter((_, i) => i !== idx));

  // ===================== MEMBER =====================
  const handleSendOTP = async () => {
    if (!memberPhone) return addToast("Enter phone (+959...)", "warning");
    const exists = await checkMemberExists(memberPhone);
    setMemberExists(exists);
    try {
      const conf = await sendOTP(memberPhone);
      setConfirmation(conf);
      addToast("OTP Sent!", "success");
    } catch (e) {
      addToast("Failed to send OTP: " + (e.message || e), "error");
    }
  };
  const handleVerifyOTP = async () => {
    if (!otp) return addToast("Enter OTP", "warning");
    try {
      await verifyOTP(confirmation, otp);
      setMemberVerified(true);
      addToast("Member verified! 10% discount applied.", "success");
    } catch (e) {
      addToast("Wrong OTP", "error");
    }
  };

  // ===================== SAVE & PRINT =====================
  const handleConfirmPrint = async () => {
    if (submitting) return; // Prevent multiple submissions
    setSubmitting(true); // Start submitting to prevent double submissions

    // Ensure there are items in the cart before proceeding
    if (items.length === 0) {
      addToast("⚠ Add items before saving", "warning");
      setSubmitting(false); // Reset the submitting state
      return; // Stop function execution if no items are present
    }

    try {
      // Get the next voucher number
      const nextVoucherNo = await getNextVoucherNo(currentShop.username);
      setVoucherNo(nextVoucherNo);

      // Get current date and time formatted as dd/MM/yyyy and HH:mm:ss
      const now = new Date();
      const formattedDate = now.toLocaleDateString("en-GB"); // dd/MM/yyyy
      const formattedTime = now.toLocaleTimeString("en-GB", { hour12: false }); // HH:mm:ss

      // Build the sale object
      const sale = {
        voucherNo: nextVoucherNo,
        dateTime: now.toISOString(),
        dateOnly: formattedDate,
        paymentMethod,
        items,
        total,
        discount,
        memberDiscount,
        finalTotal,
        cashPaid: Number(cashPaid) || 0,
        change: Number(change) || 0,
        memberPhone: memberVerified ? memberPhone : null,
        shop: currentShop?.username || "unknown",
        couponCode,
        couponAmount,
        address: shopAddress,
        deliveryCharge,
      };

      // Save the sale to local and Firebase
      await saveSale(currentShop.username, sale);
      addToast("Sale saved!", "success");
      window.dispatchEvent(new Event("sales-updated"));

      // Stock update logic (avoid deleting stock)
      const products = await getProductsFromDB(currentShop.username);
      items.forEach((it) => {
        if (products[it.code]?.colors[it.color]?.sizes[it.size]) {
          const stock = products[it.code]?.colors[it.color]?.sizes[it.size];
          if (stock) {
            stock.pcs = Math.max(0, stock.pcs - it.qty);
          }
          if (products[it.code].colors[it.color].sizes[it.size].pcs < 0) {
            products[it.code].colors[it.color].sizes[it.size].pcs = 0;
          }
        }
      });

      // Save updated products to local DB
      await saveProductsToDB(currentShop.username, products);

      // PRINT receipt window
      const content = document.querySelector(".receipt")?.outerHTML || "";
      const win = window.open("", "_blank", "width=300,height=600");
      win.document.write(`
      <html>
        <head>
          <style>
            @page { size: 80mm auto; margin:0; }
            body { font-family:Arial,sans-serif; font-size:12px; width:80mm; margin:0; padding:0; }
            table{width:100%; border-collapse:collapse; font-size:12px;}
            th,td{padding:2px 0;}
            td:last-child,th:last-child{text-align:right;}
            .line{border-top:1px dashed #000;margin:4px 0;}
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
      win.document.close();
      setTimeout(() => {
        win.print();
        win.close();
      }, 500);

      // Mall API Data (Send data before reset)
      const mallSale = {
        PosSales: [
          {
            PropertyCode: "JC",
            POSInterfaceCode: "JC-POS-00000198",
            ReceiptDate: formattedDate,
            ReceiptTime: formattedTime,
            ReceiptNo: nextVoucherNo,
            NoOfItems: items.length,
            SalesCurrency: "MMK",
            TotalSalesAmtB4Tax: total,
            TotalSalesAmtAfterTax: finalTotal,
            SalesTaxRate: 5,
            ServiceChargeAmt: 0,
            PaymentAmt: finalTotal,
            PaymentCurrency: "MMK",
            PaymentMethod: paymentMethod,
            SalesType: "Sales",
            SalesDiscountAmt: discount + memberDiscount + couponAmount,
          },
        ],
      };

      // Mall API call (optional / safe)
      try {
        const res = await fetch("http://localhost:3001/sendSale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mallSale),
        });

        if (!res.ok) throw new Error(`Mall API HTTP ${res.status}`);
        const data = await res.json();
        console.log("Mall API Response:", data);
        addToast("Mall API: " + (data.returnStatus || "SENT"), "info");
      } catch (err) {
        // Log the error for debugging but avoid interrupting the POS flow
        console.warn("Mall API Error (ignored):", err.message);
        addToast("Mall API unavailable (testing only)", "warning");
      }

      // RESET form and prepare the next voucher number for UI
      const previewNo = await previewVoucherNo(currentShop.username);
      setVoucherNo(nextVoucherNo);
      setItems([]); // Clear items after printing
      setCashPaid("");
      setChange(0);
      setCouponAmount(0);
      setCouponCode("");
      setMemberVerified(false);
      setShowDialog(false);
    } catch (err) {
      addToast("Failed to save sale: " + (err.message || err), "error");
    } finally {
      setSubmitting(false); // End submitting process
    }
  };

  const getShopBrandName = (shopId, shopName = "") => {
    const name = shopName.toLowerCase();

    // ✅ auto detect by shopName keyword
    if (name.includes("prettyfit")) return "PRETTYFIT MYANMAR";
    if (name.includes("hangten") || name.includes("hang ten"))
      return "HANGTEN MYANMAR";

    // ✅ fallback by shop ID
    const hangtenShops = [
      "shop1",
      "shop2",
      "shop3",
      "shop4",
      "shop5",
      "STHT",
      "DNGHT",
      "shop14",
    ];
    const prettyfitShops = ["STPF", "shop9", "shop10", "DNGPF", "shop15"];

    if (hangtenShops.includes(shopId)) return "HANGTEN MYANMAR";
    if (prettyfitShops.includes(shopId)) return "PRETTYFIT MYANMAR";

    return "MY SHOP";
  };

  return (
    <div className="container">
      <div className="grid">
        {/* LEFT */}
        <div>
          <div className="card header">
            <div className="title">
              <h2>
                {getShopBrandName(currentShop.username, currentShop.shopName)}
              </h2>

              <p>
                Shop Location - {currentShop.shopName || currentShop.username}
              </p>
              <p style={{ color: "#6b7280" }}>Role - {currentShop.role}</p>
              <p style={{ color: "#6b7280" }}>
                Date - {formattedDate} | Time - {formattedTime} | Voucher -{" "}
                {voucherNo}
              </p>
            </div>
          </div>

          {/* BARCODE */}
          <div className="card" style={{ marginTop: 12 }}>
            <div className="barcode-row">
              <input
                ref={inputRef}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or Enter Barcode"
              />
            </div>

            {/* MEMBER */}
            <div style={{ marginTop: 16 }}>
              <div className="member-row">
                <div className="input-with-btn">
                  <input
                    value={memberPhone}
                    onChange={(e) => setMemberPhone(e.target.value)}
                    placeholder="Phone (+95...)"
                  />
                  <button className="btn-send" onClick={handleSendOTP}>
                    Send
                  </button>
                </div>
                <div className="input-with-btn">
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="OTP"
                  />
                  <div id="recaptcha-container"></div>
                  <button className="btn-verify" onClick={handleVerifyOTP}>
                    Verify
                  </button>
                </div>
              </div>
              {memberExists === false && (
                <div className="msg warning">⚠ Member not found</div>
              )}
              {memberVerified && <div className="msg success">✅ Verified</div>}
            </div>

            {/* POS TABLE */}
            <table className="pos-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Color</th>
                  <th>Size</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>DiscountType</th>
                  <th>DiscountValue</th>
                  <th>FinalAmount</th>
                  <th>Note</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan="11" style={{ padding: 18, color: "#6b7280" }}>
                      No items
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => (
                    <tr
                      key={`${it.code}-${it.color}-${it.size}-${idx}`}
                      style={{ borderBottom: "1px dashed #eee" }}
                    >
                      <td>{it.code}</td>
                      <td>
                        <select
                          value={it.color}
                          onChange={(e) =>
                            handleChangeItem(idx, "color", e.target.value)
                          }
                        >
                          {it.colors.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={it.size || ""}
                          onChange={(e) =>
                            handleChangeItem(idx, "size", e.target.value)
                          }
                        >
                          <option value="">Select</option>
                          {it.availableSizes.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          value={it.qty}
                          onChange={(e) =>
                            handleChangeItem(idx, "qty", e.target.value)
                          }
                          style={{ width: 70 }}
                        />
                        <div style={{ color: "#ef4444", fontSize: 12 }}>
                          Stock: {it.uiStock}
                        </div>
                      </td>
                      <td>{it.price}</td>
                      <td>
                        <select
                          value={it.discountType}
                          onChange={(e) =>
                            handleChangeItem(
                              idx,
                              "discountType",
                              e.target.value
                            )
                          }
                        >
                          <option value="%">%</option>
                          <option value="Cashback">Cashback</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={it.discountValue}
                          onChange={(e) =>
                            handleChangeItem(
                              idx,
                              "discountValue",
                              Number(e.target.value)
                            )
                          }
                          style={{ width: 80 }}
                        />
                      </td>
                      <td>{it.finalAmount}</td>
                      <td>
                        <input
                          type="text"
                          placeholder="Note"
                          value={it.note || ""}
                          onChange={(e) =>
                            handleChangeItem(idx, "note", e.target.value)
                          }
                          style={{ width: 100 }}
                        />
                      </td>

                      <td>
                        <motion.button
                          onClick={() => handleDelete(idx)}
                          whileTap={{ scale: 0.8, rotate: -15 }}
                          whileHover={{ scale: 1.1 }}
                          style={{
                            background: "#ef4444",
                            color: "#fff",
                            border: "none",
                            padding: "6px 10px",
                            borderRadius: 8,
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={18} />
                        </motion.button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* PAYMENT */}
            {/* DELIVERY CHARGE */}
            <div style={{ marginTop: 12 }}>
              <label>Delivery Charge:</label>
              <input
                type="number"
                value={deliveryCharge}
                onChange={(e) => setDeliveryCharge(Number(e.target.value) || 0)}
                style={{
                  marginLeft: 8,
                  width: 120,
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  padding: "4px 6px",
                }}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label>Payment: </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ marginLeft: 8 }}
              >
                <option>Cash</option>
                <option>KPay</option>
                <option>Wave</option>
                <option>Visa</option>
                <option>MMQR</option>
              </select>
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <div className="coupon-container">
                <input
                  placeholder="Coupon Code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                />
                <input
                  placeholder="Coupon Amount"
                  type="number"
                  value={couponAmount || ""} // input ထဲ NaN မပေါ်အောင်
                  onChange={(e) => {
                    const val = e.target.value;
                    setCouponAmount(val === "" ? 0 : Number(val));
                  }}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                background: "linear-gradient(to right, #f9fafb, #f3f4f6)",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "12px 16px",
                boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
                transition: "all 0.3s ease",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontWeight: 600,
                  fontSize: 14,
                  color: "#374151",
                  marginBottom: 6,
                }}
              >
                🏠 Shop Address
              </label>
              <input
                type="text"
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder="Enter your shop address..."
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 14,
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  outline: "none",
                  background: "#fff",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
                onBlur={(e) => (e.target.style.borderColor = "#d1d5db")}
              />
            </div>
            <div className="summary" style={{ marginTop: 8 }}>
              <p>
                Total: <b>{total.toLocaleString()} Ks</b>
              </p>

              <p>Discount: {discount.toLocaleString()} Ks</p>

              <p style={{ color: memberVerified ? "#059669" : "#6b7280" }}>
                Member Discount:{" "}
                {memberVerified
                  ? `${memberDiscount.toLocaleString()} Ks (10%)`
                  : 0}
              </p>

              <p>Coupon: {couponAmount} Ks</p>

              {/* Delivery charge */}
              <p>Delivery Charge: {deliveryCharge.toLocaleString()} Ks</p>

              {/* Final + Grand total */}

              <p style={{ fontWeight: "bold", color: "#2563eb" }}>
                Grand Total: {(finalTotal + deliveryCharge).toLocaleString()} Ks
              </p>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginTop: 12,
              }}
            >
              <button className="print" onClick={() => setShowDialog(true)}>
                Print
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PREVIEW */}
        <div>
          <div className="card print-preview">
            <div className="preview-title">Print Preview</div>
            <div className="receipt">
              <div style={{ textAlign: "center", marginBottom: 8 }}>
                <img
                  src={getShopLogo(currentShop.username)}
                  alt="Shop Logo"
                  style={{ height: 30, objectFit: "contain" }}
                />
              </div>
              <div style={{ textAlign: "center", marginBottom: 8 }}>
                <div>{currentShop.shopName}</div>
                <div style={{ color: "#6b7280" }}>{currentShop.phone}</div>
              </div>
              <div style={{ borderTop: "1px solid #eee", paddingTop: 8 }}>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div>{voucherNo}</div>
                  <div>{formattedDate}</div>
                </div>
                <div
                  style={{ textAlign: "right", fontSize: 12, color: "#6b7280" }}
                >
                  {formattedTime}
                </div>
                <div>Member: {memberVerified ? memberPhone : "-"}</div>
                <div>Coupon: {couponCode || "-"} </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ textAlign: "start" }}>Code</th>
                      <th style={{ textAlign: "center" }}>Color</th>
                      <th style={{ textAlign: "center" }}>Size</th>
                      <th style={{ textAlign: "center" }}>Qty</th>
                      <th style={{ textAlign: "center" }}>Price</th>
                      <th style={{ textAlign: "center" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px dashed #eee" }}>
                        <td style={{ textAlign: "center" }}>{it.code}</td>
                        <td style={{ textAlign: "center" }}>{it.color}</td>
                        <td style={{ textAlign: "center" }}>{it.size}</td>
                        <td style={{ textAlign: "center" }}>{it.qty}</td>
                        <td style={{ textAlign: "center" }}>
                          {it.price.toLocaleString()}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {it.finalAmount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                style={{
                  marginTop: 12,
                  borderTop: "1px solid #eee",
                  paddingTop: 8,
                }}
              >
                {/* ✅ Replace this part */}
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                    marginTop: 6,
                  }}
                >
                  <tbody>
                    <tr>
                      <td style={{ textAlign: "left" }}>
                        <strong>Total</strong>
                      </td>
                      <td></td>
                      <td></td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ fontWeight: "600" }}>
                          {items.reduce((sum, i) => sum + i.qty, 0)} pcs
                        </span>
                      </td>
                      <td></td>
                      <td style={{ textAlign: "right", fontWeight: "600" }}>
                        {total.toLocaleString()} Ks
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* ✅ Below part keep the same */}
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div>Discount</div>
                  <div>{discount.toLocaleString()}</div>
                </div>

                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div>Member Discount</div>
                  <div>
                    {memberVerified ? memberDiscount.toLocaleString() : 0}
                  </div>
                </div>

                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div>Coupon</div>
                  <div>{couponAmount}</div>
                </div>

                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div>Delivery Charge</div>
                  <div>{deliveryCharge.toLocaleString()}</div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 700,
                  }}
                >
                  <div>Grand Total</div>
                  <div>{(finalTotal + deliveryCharge).toLocaleString()}</div>
                </div>

                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div>Payment</div>
                  <div>{paymentMethod}</div>
                </div>

                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div>Change</div>
                  <div>{change.toLocaleString()}</div>
                </div>
              </div>

              {/* PRINT PREVIEW FOOTER */}
              {/* PRINT PREVIEW FOOTER */}
              <div
                style={{
                  marginTop: 12,
                  borderTop: "1px solid #eee",
                  paddingTop: 8,
                  textAlign: "center",
                }}
              >
                {shopAddress && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#000",
                      marginBottom: 4,
                      fontFamily: "Arial, sans-serif",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    🏠 {shopAddress}
                  </div>
                )}
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  Thank You For Shopping With Us 💖
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PAYMENT DIALOG */}
      {showDialog && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Payment</h3>

            {/* ✅ Grand Total includes Delivery Charge */}
            <div>
              <label>Grand Amount</label>
              <input
                type="number"
                value={finalTotal + deliveryCharge}
                readOnly
              />
            </div>

            {/* ✅ Cash Paid */}
            <div>
              <label>Cash Paid</label>
              <input
                type="number"
                value={cashPaid}
                onChange={(e) => {
                  const val = e.target.value;
                  setCashPaid(val);
                  // ✅ subtract delivery charge also
                  setChange((Number(val) || 0) - (finalTotal + deliveryCharge));
                }}
              />
            </div>

            {/* ✅ Change */}
            <div>
              <label>Change</label>
              <input type="number" value={change} readOnly />
            </div>

            {/* ✅ Buttons */}
            <div className="modal-actions">
              <button onClick={() => setShowDialog(false)}>Cancel</button>
              <button
                className="save-btn"
                onClick={handleConfirmPrint} // This triggers Save & Print
                disabled={submitting}
              >
                {submitting ? <span className="loader"></span> : "Save & Print"}
              </button>
            </div>
          </div>
        </div>
      )}

      {submitting && (
        <div className="loading-overlay">
          <div className="loading-box">
            <span className="loader"></span>
            <p>Saving... Please wait</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ROUTES
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<MainLayout />}>
          <Route path="/" element={<POSAppInner />} />
          <Route path="/report" element={<DailySaleReport />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/transfer" element={<ShopTransferPage />} />
          <Route path="/transfer/noti" element={<ShopTransferNoti />} />
          <Route path="/transfer/history" element={<ShopTransferHistory />} />
          <Route path="/lowstock" element={<LowStockPage />} />
          <Route path="/salereturn" element={<SaleReturnPage />} />
          <Route path="/salereturn/history" element={<SaleReturnHistory />} />
          <Route path="/purchase" element={<PurchasePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </HashRouter>
  );
}
