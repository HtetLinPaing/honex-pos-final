import { auth, db } from "./firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { ref, get } from "firebase/database";

let recaptcha;

// reCAPTCHA init
export function initRecaptcha() {
  if (!recaptcha) {
    recaptcha = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible",
    });
  }
  return recaptcha;
}

// OTP ပို့
export async function sendOTP(phone) {
  const verifier = initRecaptcha();
  return await signInWithPhoneNumber(auth, phone, verifier);
}

// OTP verify
export async function verifyOTP(confirmation, otp) {
  return await confirmation.confirm(otp);
}

// Member ရှိမရှိ စစ် (optional)
export async function checkMemberExists(phone) {
  try {
    const snapshot = await get(ref(db, `members/${phone}`));
    return snapshot.exists();
  } catch (err) {
    console.error("checkMemberExists error:", err);
    return false;
  }
}
