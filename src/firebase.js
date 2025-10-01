import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBbupRQpkZmh2Aa3KYTSVWmnspGAH-1HhI",
  authDomain: "honexpos-2025.firebaseapp.com",
  databaseURL: "https://honexpos-2025-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "honexpos-2025",
  storageBucket: "honexpos-2025.firebasestorage.app",
  messagingSenderId: "654161392917",
  appId: "1:654161392917:web:39c5bf2f982170e0dd251c",
  measurementId: "G-ZWTWBV44WV"
};

// ✅ Firebase initialize
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

export { db, auth };
