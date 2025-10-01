// src/main.jsx
// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { ToastProvider } from "./context/ToastContext";   // Import ToastContext
import { ShopProvider } from "./context/ShopContext";     // Import ShopContext

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ShopProvider>          {/* ✅ Wrap App with ShopContext */}
      <ToastProvider>       {/* ✅ Wrap App with ToastContext */}
        <App />
      </ToastProvider>
    </ShopProvider>
  </React.StrictMode>
);
