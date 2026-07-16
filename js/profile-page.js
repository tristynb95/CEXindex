import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, updateEmail, updateProfile } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, get, update as updateRecord } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { BUILTIN_ROLES } from './permissions.js';

const authGuard = document.getElementById('profileAuthGuard');
const page = document.getElementById('profilePage');
const form = document.getElementById('profileForm');
const firstNameInput = document.getElementById('profileFirstName');
const lastNameInput = document.getElementById('profileLastName');
const emailInput = document.getElementById('profileEmail');
const roleEl = document.getElementById('profileRole');
const identityName = document.getElementById('profileIdentityName');
const identityEmail = document.getElementById('profileIdentityEmail');
const picturePlaceholder = document.getElementById('profilePicturePlaceholder');
const messageEl = document.getElementById('profileMessage');
const saveBtn = document.getElementById('profileSaveBtn');
const signOutBtn = document.getElementById('profilePageSignOut');

let profileRecord = null;
let currentRoleName = 'Viewer';

function splitDisplayName(displayName) {
  var parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || '',
    lastName: parts.join(' ')
  };
}

function initials(firstName, lastName, fallback) {
  var value = [firstName, lastName].map(function(part) {
    return String(part || '').trim().charAt(0);
  }).join('').toUpperCase();
  return value || String(fallback || 'P').trim().charAt(0).toUpperCase() || 'P';
}

function setMessage(type, text) {
  messageEl.className = 'profile-message' + (type ? ' is-' + type : '');
  messageEl.textContent = text || '';
  messageEl.hidden = !text;
}

function renderProfile(user, record) {
  var fallbackName = splitDisplayName(user.displayName);
  var firstName = String(record.firstName || fallbackName.firstName || '').trim();
  var lastName = String(record.lastName || fallbackName.lastName || '').trim();
  var email = user.email || record.email || '';
  var fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Your profile';

  firstNameInput.value = firstName;
  lastNameInput.value = lastName;
  emailInput.value = email;
  identityName.textContent = fullName;
  identityEmail.textContent = email;
  picturePlaceholder.textContent = initials(firstName, lastName, fullName || email);
  roleEl.textContent = currentRoleName;
}

async function resolveRoleName(roleId) {
  if (BUILTIN_ROLES[roleId]) return BUILTIN_ROLES[roleId].name;
  try {
    var roleSnapshot = await get(ref(db, 'roles/' + roleId));
    if (roleSnapshot.exists() && roleSnapshot.val().name) return roleSnapshot.val().name;
  } catch (error) {
    console.warn('Could not load the assigned role name:', error);
  }
  return roleId || 'Viewer';
}

function friendlyError(error) {
  if (error && error.code === 'auth/requires-recent-login') {
    return 'For security, sign out and sign back in before changing your email address.';
  }
  if (error && error.code === 'auth/email-already-in-use') {
    return 'That email address is already linked to another account.';
  }
  if (error && error.code === 'auth/invalid-email') {
    return 'Enter a valid work email address.';
  }
  return error && error.message ? error.message : 'Your changes could not be saved. Please try again.';
}

onAuthStateChanged(auth, async function(user) {
  if (!user) {
    window.location.replace('index.html');
    return;
  }

  try {
    var userSnapshot = await get(ref(db, 'users/' + user.uid));
    var adminSnapshot = await get(ref(db, 'admins/' + user.uid));
    var isAdmin = adminSnapshot.exists() && adminSnapshot.val() === true;

    if (!userSnapshot.exists() && !isAdmin) {
      await signOut(auth);
      window.location.replace('index.html');
      return;
    }

    profileRecord = userSnapshot.exists()
      ? userSnapshot.val()
      : { firstName: '', lastName: '', email: user.email || '', role: 'admin' };
    var roleId = isAdmin ? 'admin' : (profileRecord.role || 'viewer');
    currentRoleName = await resolveRoleName(roleId);
    renderProfile(user, profileRecord);
    authGuard.style.display = 'none';
    page.hidden = false;
  } catch (error) {
    console.error('Could not load profile:', error);
    authGuard.innerHTML = '<div class="admin-page-guard__inner"><p class="login-card__form-eyebrow">Profile unavailable</p><h1 class="admin-page-guard__title">We could not load your details.</h1><p>Return to the dashboard and try again.</p><a class="btn" href="index.html">Back to dashboard</a></div>';
  }
});

form.addEventListener('submit', async function(event) {
  event.preventDefault();
  setMessage('', '');

  var user = auth.currentUser;
  if (!user || !profileRecord) return;

  var firstName = firstNameInput.value.trim();
  var lastName = lastNameInput.value.trim();
  var email = emailInput.value.trim();
  if (!firstName || !lastName || !email) {
    setMessage('error', 'Enter your first name, last name, and work email.');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  try {
    if (email.toLowerCase() !== String(user.email || '').toLowerCase()) {
      await updateEmail(user, email);
    }

    var displayName = firstName + ' ' + lastName;
    if (displayName !== user.displayName) {
      try {
        await updateProfile(user, { displayName: displayName });
      } catch (profileError) {
        console.warn('Could not mirror the name to Firebase Auth:', profileError);
      }
    }

    await updateRecord(ref(db, 'users/' + user.uid), {
      firstName: firstName,
      lastName: lastName,
      email: email,
      updatedAt: new Date().toISOString()
    });

    profileRecord = Object.assign({}, profileRecord, {
      firstName: firstName,
      lastName: lastName,
      email: email
    });
    renderProfile(user, profileRecord);
    setMessage('success', 'Your profile has been updated.');
  } catch (error) {
    console.error('Could not save profile:', error);
    setMessage('error', friendlyError(error));
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save changes';
  }
});

signOutBtn.addEventListener('click', async function() {
  await signOut(auth);
  window.location.href = 'index.html';
});
