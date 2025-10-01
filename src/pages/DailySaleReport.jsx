import React, { useEffect, useState } from "react";
import localforage from "localforage";
import { useShop } from "../context/ShopContext";

// Helper function to calculate amounts
function calculateAmounts(item, isMember) {
  const qty = Number(item?.qty || 0);
  const price = Number(item?.price || 0);
  const base = qty * price;

  let discountAmt = 0;
  if (item?.discountType === "%") {
    discountAmt = (base * (Number(item.discountValue) || 0)) / 100;
  } else if (item?.discountType === "Cashback") {
    discountAmt = Number(item.discountValue) || 0;
  }

  const afterDiscount = base - discountAmt;
  let memberDiscount = isMember ? afterDiscount * 0.1 : 0;

  const couponAmt = Number(item?.couponAmount || 0);
  const finalAmount = afterDiscount - memberDiscount - couponAmt;

  return { base, discountAmt, memberDiscount, couponAmt, finalAmount };
}

// ✅ yyyy-MM-dd → dd/MM/yyyy
function toDMY(ymdStr) {
  if (!ymdStr) return "";
  const [y, m, d] = ymdStr.split("-");
  return `${d}/${m}/${y}`;
}

// ✅ format Date object → dd/MM/yy
function formatDateDMY(dateObj) {
  const d = String(dateObj.getDate()).padStart(2, "0");
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const y = String(dateObj.getFullYear()).slice(-2);
  return `${d}/${m}/${y}`;
}

export default function DailySaleReport() {
  const { currentShop } = useShop();
  const today = new Date().toISOString().split("T")[0]; // yyyy-MM-dd

  // state ကို yyyy-MM-dd အနေနဲ့ သိမ်း
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [sales, setSales] = useState([]);

  // 🟢 Filter လိုက်ပြီး ရလာတဲ့အမှန် Sale Date Range
  const [saleRange, setSaleRange] = useState({ from: null, to: null });

  useEffect(() => {
    const fetchSales = async () => {
      if (!currentShop) return;

      const key = `${currentShop.username}_sales`;
      const allSales = (await localforage.getItem(key)) || [];

      const filteredSales = allSales.filter((s) => {
        if (!s?.dateTime) return false;

        const saleDate = new Date(s.dateTime);
        const startObj = new Date(`${startDate}T00:00:00`);
        const endObj = new Date(`${endDate}T23:59:59`);

        return saleDate >= startObj && saleDate <= endObj;
      });

      if (filteredSales.length === 0) {
        setSales([]);
        setSaleRange({ from: null, to: null });
        return;
      }

      // 🟢 Sale Date Range ကို ထုတ်ယူ
      const dates = filteredSales.map((s) => new Date(s.dateTime));
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));

      setSaleRange({
        from: formatDateDMY(minDate),
        to: formatDateDMY(maxDate),
      });

      setSales(filteredSales);
      await localforage.setItem(`${key}_cache`, filteredSales);
    };

    fetchSales();
    const onSalesUpdate = () => fetchSales();
    window.addEventListener("sales-updated", onSalesUpdate);
    return () => window.removeEventListener("sales-updated", onSalesUpdate);
  }, [startDate, endDate, currentShop]);

  // Group sales by voucher number
  const grouped = {};
  sales.forEach((s) => {
    if (!s?.voucherNo) return;
    if (!grouped[s.voucherNo]) grouped[s.voucherNo] = [];

    s.items.forEach((it) => {
      grouped[s.voucherNo].push({
        ...it,
        vrNo: s.voucherNo,
        payment: s.paymentMethod || "-",
        couponCode: s.couponCode || "-",
        couponAmount: s.couponAmount || 0,
        date: s.dateTime ? formatDateDMY(new Date(s.dateTime)) : "-",
        time: s.dateTime ? new Date(s.dateTime).toTimeString().split(" ")[0] : "-",
        memberPhone: s.memberPhone,
      });
    });
  });

  // Calculate overall total
  let overall = 0;
  Object.values(grouped).forEach((items) => {
    items.forEach((it) => {
      const { finalAmount } = calculateAmounts(it, !!it.memberPhone);
      overall += finalAmount;
    });
  });

  return (
    <div className="report-container p-4">
      <h2 className="mb-3 font-bold text-lg">
        📑 Sale Report (
        {saleRange.from && saleRange.to
          ? `${saleRange.from} → ${saleRange.to}`
          : `${toDMY(startDate)} → ${toDMY(endDate)}`}
        ) — {currentShop?.shopName || "No Shop"}
      </h2>

      {/* Date Filter (real date input + UI dd/MM/yyyy) */}
      <div className="date-filter flex gap-4 mb-4">
        <div>
          <label>Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          
        </div>
        <div>
          <label>End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          
        </div>
      </div>

      <table className="report-table w-full border">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Sr</th>
            <th>Member Phone</th>
            <th>Code</th>
            <th>Color</th>
            <th>Size</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Discount</th>
            <th>Member Discount</th>
            <th>Coupon Amount</th>
            <th>Amount</th>
            <th>Coupon Code</th>
            <th>VR No</th>
            <th>Payment</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(grouped).length === 0 && (
            <tr>
              <td colSpan="16" className="p-4 text-center text-gray-500">
                No sales found
              </td>
            </tr>
          )}

          {Object.keys(grouped).map((vrNo) => {
            let vrTotal = 0;
            return (
              <React.Fragment key={vrNo}>
                {grouped[vrNo].map((item, i) => {
                  const { finalAmount } = calculateAmounts(item, !!item.memberPhone);
                  vrTotal += finalAmount;
                  return (
                    <tr key={i}>
                      <td>{item.date}</td>
                      <td>{item.time}</td>
                      <td>{i + 1}</td>
                      <td>{item.memberPhone || "-"}</td>
                      <td>{item.code || "-"}</td>
                      <td>{item.color || "-"}</td>
                      <td>{item.size || "-"}</td>
                      <td>{item.qty ?? 0}</td>
                      <td>{(item.price ?? 0).toLocaleString()} Ks</td>
                      <td>
                        {item.discountType === "%"
                          ? `${item.discountValue ?? 0}%`
                          : item.discountType === "Cashback"
                          ? `${(item.discountValue ?? 0).toLocaleString()} Ks`
                          : "0"}
                      </td>
                      <td>{item.memberPhone ? "10%" : "-"}</td>
                      <td>{item.couponAmount ? `-${item.couponAmount}` : "-"}</td>
                      <td className="font-semibold">
                        {(finalAmount ?? 0).toLocaleString()} Ks
                      </td>
                      <td>{item.couponCode || "-"}</td>
                      <td>{item.vrNo || vrNo}</td>
                      <td>{item.payment || "-"}</td>
                    </tr>
                  );
                })}
                <tr className="bg-gray-50 font-bold">
                  <td colSpan="16" className="text-right p-2">
                    Voucher Total ({vrNo}): {vrTotal.toLocaleString()} Ks
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan="15" className="text-right font-bold">
              OVERALL TOTAL:
            </td>
            <td className="font-bold">{overall.toLocaleString()} Ks</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
