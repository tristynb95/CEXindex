import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, updateProfile, verifyBeforeUpdateEmail } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, get, update as updateRecord, remove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { BUILTIN_ROLES } from './permissions.js';

const EMAIL_CHANGE_WINDOW_MS = 15 * 60 * 1000;

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
const pendingEmailEl = document.getElementById('profileEmailPending');
const pendingEmailAddress = document.getElementById('profilePendingEmail');
const pendingCountdown = document.getElementById('profilePendingCountdown');
const cancelEmailChangeBtn = document.getElementById('profileCancelEmailChange');

let profileRecord = null;
let currentRoleName = 'Viewer';
let pendingEmailRequest = null;
let pendingTimer = null;
let serverTimeOffset = 0;

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

function createRequestId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID().replace(/-/g, '');
  }
  var bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes).map(function(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
}

async function hashEmail(email) {
  var normalized = String(email || '').trim().toLowerCase();
  var bytes = new TextEncoder().encode(normalized);
  var digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(function(byte) {
    return byte.toString(16).padStart(2, '0');
  }).join('');
}

function setMessage(type, text) {
  messageEl.className = 'profile-message' + (type ? ' is-' + type : '');
  messageEl.textContent = text || '';
  messageEl.hidden = !text;
}

function formatCountdown(milliseconds) {
  var totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  var minutes = Math.floor(totalSeconds / 60);
  var seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function stopPendingTimer() {
  if (pendingTimer) {
    clearInterval(pendingTimer);
    pendingTimer = null;
  }
}

function renderPendingEmail() {
  if (!pendingEmailRequest) {
    pendingEmailEl.hidden = true;
    stopPendingTimer();
    return;
  }

  var remaining = Number(pendingEmailRequest.expiresAt || 0) - (Date.now() + serverTimeOffset);
  pendingEmailEl.hidden = false;
  pendingEmailAddress.textContent = pendingEmailRequest.newEmail || '';
  pendingCountdown.textContent = formatCountdown(remaining);

  if (remaining <= 0) {
    cancelPendingEmailChange(true);
    return;
  }

  if (!pendingTimer) {
    pendingTimer = setInterval(renderPendingEmail, 1000);
  }
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
  renderPendingEmail();
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
    return 'For security, sign out and sign back in before requesting an email change.';
  }
  if (error && error.code === 'auth/email-already-in-use') {
    return 'That email address is already linked to another account.';
  }
  if (error && error.code === 'auth/invalid-email') {
    return 'Enter a valid work email address.';
  }
  if (error && (error.code === 'auth/unauthorized-continue-uri' || error.code === 'auth/invalid-continue-uri')) {
    return 'Email confirmation is not configured for this site domain yet. Ask an administrator to update the Firebase authorized domains.';
  }
  if (error && error.code === 'auth/operation-not-allowed') {
    return 'Verified email changes are not enabled for this Firebase project yet.';
  }
  return error && error.message ? error.message : 'Your changes could not be saved. Please try again.';
}

async function removeEmailRequest(request) {
  if (!request) return;
  var user = auth.currentUser;
  var operations = [remove(ref(db, 'emailChangeRequests/' + request.id))];
  if (user && request.uid === user.uid) {
    operations.push(updateRecord(ref(db, 'users/' + user.uid), {
      pendingEmailRequestId: null,
      pendingEmailAddress: null
    }));
  }
  await Promise.all(operations);
}

async function cancelPendingEmailChange(expired) {
  if (!pendingEmailRequest) return;
  var request = pendingEmailRequest;
  pendingEmailRequest = null;
  stopPendingTimer();
  pendingEmailEl.hidden = true;
  if (profileRecord) {
    profileRecord.pendingEmailRequestId = null;
    profileRecord.pendingEmailAddress = null;
  }

  try {
    await removeEmailRequest(request);
    setMessage(expired ? 'error' : 'success', expired
      ? 'The email confirmation window expired, so the change was cancelled.'
      : 'The pending email change has been cancelled.');
  } catch (error) {
    console.error('Could not clear pending email change:', error);
    setMessage('error', 'The request could not be cancelled. Refresh the page and try again.');
  }
}

async function loadPendingEmailRequest(user) {
  var requestId = profileRecord && profileRecord.pendingEmailRequestId;
  pendingEmailRequest = null;
  if (!requestId) return;

  var requestSnapshot = await get(ref(db, 'emailChangeRequests/' + requestId));
  if (!requestSnapshot.exists()) {
    await updateRecord(ref(db, 'users/' + user.uid), {
      pendingEmailRequestId: null,
      pendingEmailAddress: null
    });
    profileRecord.pendingEmailRequestId = null;
    profileRecord.pendingEmailAddress = null;
    return;
  }

  var request = Object.assign({
    id: requestId,
    newEmail: profileRecord.pendingEmailAddress || ''
  }, requestSnapshot.val());
  request.expiresAt = Number(request.requestedAt || 0) + EMAIL_CHANGE_WINDOW_MS;
  if (request.uid !== user.uid) {
    await updateRecord(ref(db, 'users/' + user.uid), {
      pendingEmailRequestId: null,
      pendingEmailAddress: null
    });
    profileRecord.pendingEmailRequestId = null;
    profileRecord.pendingEmailAddress = null;
    return;
  }

  if (String(user.email || '').toLowerCase() === String(request.newEmail || '').toLowerCase()) {
    await updateRecord(ref(db, 'users/' + user.uid), {
      email: user.email,
      pendingEmailRequestId: null,
      pendingEmailAddress: null,
      updatedAt: new Date().toISOString()
    });
    await remove(ref(db, 'emailChangeRequests/' + requestId));
    profileRecord.email = user.email;
    profileRecord.pendingEmailRequestId = null;
    profileRecord.pendingEmailAddress = null;
    return;
  }

  pendingEmailRequest = request;
  if (Number(request.expiresAt || 0) <= Date.now() + serverTimeOffset) {
    await cancelPendingEmailChange(true);
  }
}

async function requestEmailChange(user, newEmail) {
  if (pendingEmailRequest) await cancelPendingEmailChange(false);

  var requestId = createRequestId();
  var requestedAt = Date.now();
  var request = {
    id: requestId,
    uid: user.uid,
    previousEmail: user.email || '',
    newEmail: newEmail,
    requestedAt: requestedAt,
    expiresAt: requestedAt + EMAIL_CHANGE_WINDOW_MS,
    status: 'pending'
  };

  var storedRequest = {
    uid: user.uid,
    newEmailHash: await hashEmail(newEmail),
    previousEmailHash: await hashEmail(user.email || ''),
    requestedAt: serverTimestamp(),
    status: 'pending'
  };
  await updateRecord(ref(db, 'emailChangeRequests/' + requestId), storedRequest);
  var savedRequestSnapshot = await get(ref(db, 'emailChangeRequests/' + requestId));
  var serverRequestedAt = savedRequestSnapshot.exists()
    ? Number(savedRequestSnapshot.val().requestedAt || requestedAt)
    : requestedAt;
  request.requestedAt = serverRequestedAt;
  request.expiresAt = serverRequestedAt + EMAIL_CHANGE_WINDOW_MS;
  await updateRecord(ref(db, 'users/' + user.uid), {
    pendingEmailRequestId: requestId,
    pendingEmailAddress: newEmail
  });

  var continueUrl = new URL('profile.html', window.location.href);
  continueUrl.searchParams.set('emailRequest', requestId);

  try {
    await verifyBeforeUpdateEmail(user, newEmail, {
      url: continueUrl.toString(),
      handleCodeInApp: false
    });
  } catch (error) {
    await Promise.all([
      remove(ref(db, 'emailChangeRequests/' + requestId)),
      updateRecord(ref(db, 'users/' + user.uid), {
        pendingEmailRequestId: null,
        pendingEmailAddress: null
      })
    ]).catch(function(cleanupError) {
      console.warn('Could not clean up failed email request:', cleanupError);
    });
    throw error;
  }

  pendingEmailRequest = request;
  profileRecord.pendingEmailRequestId = requestId;
  profileRecord.pendingEmailAddress = newEmail;
  renderPendingEmail();
}

onAuthStateChanged(auth, async function(user) {
  if (!user) {
    window.location.replace('index.html');
    return;
  }

  try {
    var userRef = ref(db, 'users/' + user.uid);
    var userSnapshot = await get(userRef);
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

    try {
      var offsetSnapshot = await get(ref(db, '.info/serverTimeOffset'));
      serverTimeOffset = offsetSnapshot.exists() ? Number(offsetSnapshot.val() || 0) : 0;
    } catch (offsetError) {
      console.warn('Could not load Firebase server time offset:', offsetError);
    }

    if (user.email && String(profileRecord.email || '').toLowerCase() !== user.email.toLowerCase()) {
      var completedRequestId = profileRecord.pendingEmailRequestId || '';
      await updateRecord(userRef, {
        email: user.email,
        pendingEmailRequestId: null,
        pendingEmailAddress: null,
        updatedAt: new Date().toISOString()
      });
      if (completedRequestId) await remove(ref(db, 'emailChangeRequests/' + completedRequestId));
      profileRecord.email = user.email;
      profileRecord.pendingEmailRequestId = null;
      profileRecord.pendingEmailAddress = null;
    }

    var roleId = isAdmin ? 'admin' : (profileRecord.role || 'viewer');
    currentRoleName = await resolveRoleName(roleId);
    await loadPendingEmailRequest(user);
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
      updatedAt: new Date().toISOString()
    });
    profileRecord = Object.assign({}, profileRecord, {
      firstName: firstName,
      lastName: lastName
    });

    var emailChanged = email.toLowerCase() !== String(user.email || '').toLowerCase();
    if (emailChanged) {
      await requestEmailChange(user, email);
      setMessage('success', 'Profile saved. We sent a confirmation link to ' + email + '. It expires in 15 minutes.');
    } else {
      setMessage('success', 'Your profile has been updated.');
    }

    renderProfile(user, profileRecord);
  } catch (error) {
    console.error('Could not save profile:', error);
    setMessage('error', friendlyError(error));
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save changes';
  }
});

cancelEmailChangeBtn.addEventListener('click', function() {
  cancelEmailChangeBtn.disabled = true;
  cancelPendingEmailChange(false).finally(function() {
    cancelEmailChangeBtn.disabled = false;
  });
});

signOutBtn.addEventListener('click', async function() {
  stopPendingTimer();
  await signOut(auth);
  window.location.href = 'index.html';
});
