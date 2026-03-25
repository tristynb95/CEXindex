import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-analytics.js";

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyBlE8ubmctz8k5o8qPB8K56ZxE4y8Hr4Yc",
  authDomain: "cexindex.firebaseapp.com",
  databaseURL: "https://cexindex-default-rtdb.firebaseio.com",
  projectId: "cexindex",
  storageBucket: "cexindex.firebasestorage.app",
  messagingSenderId: "514119021168",
  appId: "1:514119021168:web:512e985f9905f429983ab5",
  measurementId: "G-89MW36PHWN"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

// Analytics is best-effort — it throws in private browsing, in-app browsers
// (WKWebView on iOS), and environments where Safari's ITP blocks indexedDB.
// Wrapping it prevents a module-level crash that would silently break auth.
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn('Firebase Analytics unavailable:', e.message);
}
export { analytics };
