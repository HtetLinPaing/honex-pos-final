const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// POST endpoint to send sales data to the Mall API
app.post("/sendSale", async (req, res) => {
  const {
    CLIENT_ID,
    CLIENT_SECRET,
    PROPERTY_CODE,
    POS_INTERFACE_CODE,
    API_URL,
  } = process.env;

  // Debug: log API configuration
  console.log("Loaded Mall API config:", {
    CLIENT_ID,
    CLIENT_SECRET,
    PROPERTY_CODE,
    POS_INTERFACE_CODE,
    API_URL,
  });

  const now = new Date();
  const batchCode = now.toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);

  const payload = {
    AppCode: "POS-01",  // Application code, might need adjustment
    PropertyCode: PROPERTY_CODE,
    ClientID: CLIENT_ID,
    ClientSecret: CLIENT_SECRET,
    POSInterfaceCode: POS_INTERFACE_CODE,
    BatchCode: batchCode,
    PosSales: req.body.PosSales, // Expecting PosSales in the request body
  };

  try {
    // Step 1: Get access token
    const tokenRes = await axios.post(
      "http://121.54.164.99:8282/connect/token", // Token URL
      new URLSearchParams({
        grant_type: "client_credentials", // OAuth2.0 client credentials grant
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, // Required for OAuth2 token request
        timeout: 10000, // Timeout after 10 seconds if no response
      }
    );

    const token = tokenRes.data.access_token;  // Extract the access token
    console.log("✅ Received Token:", token);

    // Step 2: Call importpossales API with the Bearer token
    const mallRes = await axios.post(API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,  // Add token in Authorization header
      },
      timeout: 30000, // Timeout after 30 seconds if no response
    });

    console.log("Mall API Response:", mallRes.data);
    res.json(mallRes.data);  // Send Mall API response to the client
  } catch (err) {
    console.error("❌ Mall API Error:", err.message);
    if (err.response) {
      console.error("Mall API Response Data:", err.response.data);
    }
    res.status(500).json({ error: err.response?.data || err.message || "Unknown error" }); // Error response
  }
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Mall API proxy running on port ${PORT}`);
});
