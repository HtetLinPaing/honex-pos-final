import React, { useEffect, useState } from "react";
import localforage from "localforage";
import { useShop } from "../context/ShopContext";

// 🧮 Helper: calculate each item amount (excluding coupon)
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
  const memberDiscount = isMember ? afterDiscount * 0.1 : 0;
  const finalAmount = afterDiscount - memberDiscount;

  return { base, discountAmt, memberDiscount, finalAmount };
}

// 🔢 yyyy-MM-dd → dd/MM/yyyy
function toDMY(ymdStr) {
  if (!ymdStr) return "";
  const [y, m, d] = ymdStr.split("-");
  return `${d}/${m}/${y}`;
}

// 🗓️ Format Date → dd/MM/yy
function formatDateDMY(dateObj) {
  const d = String(dateObj.getDate()).padStart(2, "0");
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const y = String(dateObj.getFullYear()).slice(-2);
  return `${d}/${m}/${y}`;
}

export default function DailySaleReport() {
  const { currentShop } = useShop();
  const today = new Date().toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [sales, setSales] = useState([]);
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

      const dates = filteredSales.map((s) => new Date(s.dateTime));
      setSaleRange({
        from: formatDateDMY(new Date(Math.min(...dates))),
        to: formatDateDMY(new Date(Math.max(...dates))),
      });

      setSales(filteredSales);
      await localforage.setItem(`${key}_cache`, filteredSales);
    };

    fetchSales();
    const onSalesUpdate = () => fetchSales();
    window.addEventListener("sales-updated", onSalesUpdate);
    return () => window.removeEventListener("sales-updated", onSalesUpdate);
  }, [startDate, endDate, currentShop]);

  // 🧾 Group by voucher number
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
        address: s.address || "-",
        deliveryCharge: s.deliveryCharge || 0,
        date: s.dateTime ? formatDateDMY(new Date(s.dateTime)) : "-",
        time: s.dateTime
          ? new Date(s.dateTime).toTimeString().split(" ")[0]
          : "-",
        memberPhone: s.memberPhone,
      });
    });
  });

  let overall = 0;

  return (
    <div className="report-container p-4">
      <h2 className="mb-3 font-bold text-lg">
        📑 Sale Report (
        {saleRange.from && saleRange.to
          ? `${saleRange.from} → ${saleRange.to}`
          : `${toDMY(startDate)} → ${toDMY(endDate)}`}
        ) — {currentShop?.shopName || "No Shop"}
      </h2>

      {/* 🔍 Date Filter */}
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

      <table className="report-table w-full border text-sm">
        <thead className="bg-gray-100">
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
            <th></th>
            <th>Amount</th>
            <th></th>
            <th>VR No</th>
            <th>Payment</th>
            <th>Note</th>
          </tr>
        </thead>

        <tbody>
          {Object.keys(grouped).length === 0 && (
            <tr>
              <td colSpan="17" className="p-4 text-center text-gray-500">
                No sales found
              </td>
            </tr>
          )}

          {Object.keys(grouped).map((vrNo) => {
            const voucherItems = grouped[vrNo];
            const firstItem = voucherItems[0];
            const couponAmt = Number(firstItem?.couponAmount || 0);
            const couponCode = firstItem?.couponCode || "-";
            const address = firstItem?.address || "-";
            const deliveryCharge = Number(firstItem?.deliveryCharge || 0);

            let vrTotal = 0;
            voucherItems.forEach((item) => {
              const { finalAmount } = calculateAmounts(
                item,
                !!item.memberPhone
              );
              vrTotal += finalAmount;
            });

            vrTotal -= couponAmt;
            vrTotal += deliveryCharge; // ✅ add delivery charge
            overall += vrTotal;

            return (
              <React.Fragment key={vrNo}>
                {voucherItems.map((item, i) => {
                  const { finalAmount } = calculateAmounts(
                    item,
                    !!item.memberPhone
                  );
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
                          : "-"}
                      </td>
                      <td>{item.memberPhone ? "10%" : "-"}</td>
                      <td></td>
                      <td>{finalAmount.toLocaleString()} Ks</td>
                      <td></td>
                      <td>{item.vrNo || vrNo}</td>
                      <td>{item.payment || "-"}</td>
                      <td>{item.note || "-"}</td>
                    </tr>
                  );
                })}

                {/* 🧾 Coupon Info */}
                {couponAmt > 0 && (
                  <tr className="text-sm italic text-gray-600">
                    <td colSpan="17" className="text-right pr-4">
                      Coupon Code - {couponCode} | Coupon Amt -{" "}
                      {couponAmt.toLocaleString()} Ks
                    </td>
                  </tr>
                )}

                {/* 🚚 Delivery & Address */}
                <tr className="text-sm text-gray-700">
                  <td colSpan="17" className="pl-4 py-1">
                    <strong>🚚 Delivery Charge:</strong>{" "}
                    {deliveryCharge
                      ? deliveryCharge.toLocaleString() + " Ks"
                      : "0 Ks"}{" "}
                    {" | "}
                    <strong>🏠 Address:</strong> {address}
                  </td>
                </tr>

                {/* Voucher Total */}
                <tr className="bg-gray-50 font-bold">
                  <td colSpan="17" className="text-right p-2">
                    Voucher Total ({vrNo}): {vrTotal.toLocaleString()} Ks
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>

        <tfoot className="bg-gray-100 font-bold">
          <tr>
            <td colSpan="16" className="text-right">
              OVERALL TOTAL:
            </td>
            <td>{overall.toLocaleString()} Ks</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
