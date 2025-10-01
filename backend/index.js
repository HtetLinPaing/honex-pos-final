const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config({ path: __dirname + "/.env" });  // Load environment variables from .env

const app = express();
app.use(cors());  // Enable CORS for cross-origin requests
app.use(express.json());  // Parse incoming JSON requests

// POST endpoint to send sales data to the Mall API
app.post("/sendSale", async (req, res) => {
  // Destructure environment variables from the .env file
  const {
    CLIENT_ID,
    CLIENT_SECRET,
    PROPERTY_CODE,
    POS_INTERFACE_CODE,
    API_URL,
  } = process.env;

  // 🟢 Debug log: Log API configuration
  console.log("Loaded Mall API config:", {
    CLIENT_ID,
    CLIENT_SECRET,
    PROPERTY_CODE,
    POS_INTERFACE_CODE,
    API_URL,
  });

  // Generate batch code based on the current date and time (ISO format)
  const now = new Date();
  const batchCode = now.toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);  // Format: 20250926084922

  // Prepare the payload to send to the Mall API
  const payload = {
    AppCode: "POS-01",  // Application code (adjust as necessary)
    PropertyCode: PROPERTY_CODE,
    ClientID: CLIENT_ID,
    ClientSecret: CLIENT_SECRET,
    POSInterfaceCode: POS_INTERFACE_CODE,
    BatchCode: batchCode,
    PosSales: req.body.PosSales,  // Expecting PosSales in the request body
  };

  try {
    // 🔑 Step 1: Get an access token from the Mall API
    const tokenRes = await axios.post(
      "http://121.54.164.99:8282/connect/token",  // Mall API Token URL
      new URLSearchParams({
        grant_type: "client_credentials",  // OAuth2.0 client credentials grant
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },  // Content type for OAuth2 token request
        timeout: 10000,  // Timeout after 10 seconds if no response
      }
    );

    // Extract the access token
    const token = tokenRes.data.access_token;
    console.log("✅ Received Token:", token);

    // 🟢 Step 2: Use the access token to call the Mall API for sales data import
    const mallRes = await axios.post(API_URL, payload, {
      headers: {
        "Content-Type": "application/json",  // Set content type as JSON
        Authorization: `Bearer ${token}`,  // Use the Bearer token for authorization
      },
      timeout: 30000,  // Timeout after 30 seconds if no response
    });

    // Log the response from the Mall API
    console.log("Mall API Response:", mallRes.data);

    // Send the Mall API response back to the client
    res.json(mallRes.data);
  } catch (err) {
    // Log error message if any occurs during the request
    console.error("❌ Mall API Error:", err.message);

    // If the error has a response, log the response data
    if (err.response) {
      console.error("Mall API Response Data:", err.response.data);
    }

    // Send error response back to the client
    res.status(500).json({
      error: err.response?.data || err.message || "Unknown error",  // Return appropriate error message
    });
  }
});

// Start the server on the specified port (default: 3001)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Mall API proxy running on port ${PORT}`);
});
