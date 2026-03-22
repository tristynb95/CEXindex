import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

window.GAILS_Firebase = {
  saveData: async function(records, months) {
    if (!auth.currentUser) return;
    try {
      await set(ref(db, 'dashboardData'), { records, months });
      console.log('Firebase DB: Saved successfully.');
    } catch(e) {
      console.error('Firebase DB: Save failed.', e);
    }
  }
};

const loginScreen = document.getElementById('loginScreen');
const headerEl = document.querySelector('.header');
const containerEl = document.querySelector('.container');
const loginBtn = document.getElementById('loginBtn');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

// Initial state
headerEl.style.display = 'none';
containerEl.style.display = 'none';

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Check if user is an admin in the database
    const adminRef = ref(db, `admins/${user.uid}`);
    try {
      const snapshot = await get(adminRef);
      if (snapshot.exists() && snapshot.val() === true) {
        showApp(true);
        // Try loading from Firebase
        try {
          const dbSnap = await get(ref(db, 'dashboardData'));
          const statusEl = document.getElementById('uploadStatus');
          if (dbSnap.exists()) {
            const data = dbSnap.val();
            const tryInit = setInterval(() => {
               if (window.GAILS_initDashboard) {
                 clearInterval(tryInit);
                 window.GAILS_initDashboard(data.records || [], data.months || []);
                 if (statusEl) {
                   statusEl.textContent = 'Loaded data securely from Firebase Database';
                   statusEl.className = 'status success';
                 }
               }
            }, 100);
          }
        } catch(e) {
          console.error("Failed to load Firebase data:", e);
        }
      } else {
        loginError.textContent = "You don't have admin privileges to view this dashboard.";
        loginError.style.display = 'block';
        await signOut(auth);
        showApp(false);
      }
    } catch (e) {
       console.error("DB error", e);
       loginError.textContent = "Database connection error or permission denied. Check configuration and rules.";
       loginError.style.display = 'block';
       await signOut(auth);
       showApp(false);
    }
  } else {
    showApp(false);
  }
});

function showApp(show) {
  if (show) {
    loginScreen.style.display = 'none';
    headerEl.style.display = 'flex'; // originally its flex on the inside
    containerEl.style.display = 'block';
  } else {
    loginScreen.style.display = 'flex';
    headerEl.style.display = 'none';
    containerEl.style.display = 'none';
  }
}

loginBtn.addEventListener('click', async () => {
  loginError.style.display = 'none';
  const email = emailInput.value;
  const password = passwordInput.value;
  
  // Note: For "Tristenb", Firebase requires an email format, so they will use tristenb@example.com
  if (!email || !password) {
    loginError.textContent = 'Please enter email and password.';
    loginError.style.display = 'block';
    return;
  }
  
  const loginText = loginBtn.textContent;
  loginBtn.textContent = 'Logging in...';
  loginBtn.disabled = true;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // Success is handled by onAuthStateChanged
  } catch (error) {
    loginError.textContent = error.message;
    loginError.style.display = 'block';
  } finally {
    loginBtn.textContent = loginText;
    loginBtn.disabled = false;
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
  });
}
