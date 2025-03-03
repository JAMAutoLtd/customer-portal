import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// ✅ Remove direct `getAnalytics` import
// import { getAnalytics } from "firebase/analytics"; ❌ REMOVE THIS LINE

const firebaseConfig = {
  apiKey: "AIzaSyBVfxoHVst_cJc8kPuk5qd22wDFgOk9eI0",
  authDomain: "customer-portal-f1bf8.firebaseapp.com",
  projectId: "customer-portal-f1bf8",
  storageBucket: "customer-portal-f1bf8.firebasestorage.app",
  messagingSenderId: "460546169013",
  appId: "1:460546169013:web:a2a4c19ff85a1c7c3446fc",
  measurementId: "G-K19W2B64FE"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// ✅ Fix: Only initialize Analytics in the browser
if (typeof window !== "undefined") {
  import("firebase/analytics").then(({ getAnalytics }) => {
    getAnalytics(app);
  });
}
