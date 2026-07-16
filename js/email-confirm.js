import { auth, db } from './firebase-config.js';
import { applyActionCode, checkActionCode, onAuthStateChanged, reload } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, get, update as updateRecord, remove } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

const iconEl = document.getElementById('emailActionIcon');
const eyebrowEl = document.getElementById('emailActionEyebrow');
const titleEl = document.getElementById('emailActionTitle');
const messageEl = document.getElementById('emailActionMessage');
const addressEl = document.getElementById('emailActionAddress');
const returnLink = document.getElementById('emailActionReturn');

function showResult(type, eyebrow, title, message, email) {
  iconEl.className = 'email-action-card__icon is-' + type;
  iconEl.textContent = type === 'success' ? '✓' : '!';
  eyebrowEl.textContent = eyebrow;
  titleEl.textContent = title;
  messageEl.textContent = message;
  addressEl.textContent = email || '';
  addressEl.hidden = !email;
  returnLink.hidden = false;
}

function requestIdFromContinueUrl(continueUrl) {
  if (!continueUrl) return '';
  try {
    return new URL(continueUrl).searchParams.get('emailRequest') || '';
  } catch (error) {
    return '';
  }
}

function getActionParams() {
  var directParams = new URLSearchParams(window.location.search);
  var wrappedLink = window.location.hash ? window.location.hash.slice(1) : '';
  if (!wrappedLink) return directParams;

  try {
    var actionUrl = new URL(wrappedLink);
    var allowedOrigins = [
      'https://cexindex.firebaseapp.com',
      'https://cexindex.web.app'
    ];
    if (allowedOrigins.indexOf(actionUrl.origin) === -1 || actionUrl.pathname !== '/__/auth/action') {
      return directParams;
    }
    return actionUrl.searchParams;
  } catch (error) {
    return directParams;
  }
}

async function hashEmail(email) {
  var normalized = String(email || '').trim().toLowerCase();
  var bytes = new TextEncoder().encode(normalized);
  var digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(function(byte) {
    return byte.toString(16).padStart(2, '0');
  }).join('');
}

function currentUserReady() {
  return new Promise(function(resolve) {
    var settled = false;
    var unsubscribe = null;
    function finish(user) {
      if (settled) return;
      settled = true;
      if (unsubscribe) unsubscribe();
      resolve(user);
    }
    unsubscribe = onAuthStateChanged(auth, finish);
    if (settled && unsubscribe) unsubscribe();
    setTimeout(function() {
      finish(auth.currentUser);
    }, 1500);
  });
}

async function clearRequestIfSignedIn(requestId, request, email) {
  var user = await currentUserReady();
  if (!user || user.uid !== request.uid) return;
  try {
    await reload(user);
    await updateRecord(ref(db, 'users/' + user.uid), {
      email: user.email || email,
      pendingEmailRequestId: null,
      pendingEmailAddress: null,
      updatedAt: new Date().toISOString()
    });
    await remove(ref(db, 'emailChangeRequests/' + requestId));
  } catch (error) {
    console.warn('The email changed, but local profile cleanup will finish on next sign-in:', error);
  }
}

async function clearExpiredRequestIfSignedIn(requestId, request) {
  var user = await currentUserReady();
  if (!user || user.uid !== request.uid) return;
  try {
    await Promise.all([
      remove(ref(db, 'emailChangeRequests/' + requestId)),
      updateRecord(ref(db, 'users/' + user.uid), {
        pendingEmailRequestId: null,
        pendingEmailAddress: null
      })
    ]);
  } catch (error) {
    console.warn('Expired request cleanup will finish when the profile is opened:', error);
  }
}

async function confirmEmailChange() {
  var params = getActionParams();
  var actionCode = params.get('oobCode') || '';
  var mode = params.get('mode') || '';
  var requestId = requestIdFromContinueUrl(params.get('continueUrl'));

  if (!actionCode || !requestId || (mode && mode !== 'verifyAndChangeEmail' && mode !== 'verifyEmail')) {
    showResult('error', 'Invalid confirmation', 'This link cannot be used.', 'Request a new email change from your profile.');
    return;
  }

  try {
    var offsetSnapshot = await get(ref(db, '.info/serverTimeOffset'));
    var serverTimeOffset = offsetSnapshot.exists() ? Number(offsetSnapshot.val() || 0) : 0;
    var requestSnapshot = await get(ref(db, 'emailChangeRequests/' + requestId));
    if (!requestSnapshot.exists()) {
      showResult('error', 'Change cancelled', 'This email change is no longer pending.', 'The request was cancelled, expired, or has already been completed.');
      return;
    }

    var request = requestSnapshot.val();
    var expiresAt = Number(request.requestedAt || 0) + (15 * 60 * 1000);
    if (request.status !== 'pending' || expiresAt <= Date.now() + serverTimeOffset) {
      showResult('error', 'Confirmation expired', 'The 15-minute window has ended.', 'Your email was not changed. Return to your profile to request a new confirmation.');
      await clearExpiredRequestIfSignedIn(requestId, request);
      return;
    }

    var actionInfo = await checkActionCode(auth, actionCode);
    if (actionInfo.operation !== 'VERIFY_AND_CHANGE_EMAIL') {
      showResult('error', 'Invalid confirmation', 'This link is for a different account action.', 'Your email was not changed.');
      return;
    }

    var newEmail = actionInfo.data && actionInfo.data.email ? actionInfo.data.email : '';
    var previousEmail = actionInfo.data && actionInfo.data.previousEmail ? actionInfo.data.previousEmail : '';
    var hashes = await Promise.all([hashEmail(newEmail), hashEmail(previousEmail)]);
    if (hashes[0] !== request.newEmailHash || hashes[1] !== request.previousEmailHash) {
      showResult('error', 'Invalid confirmation', 'This link does not match the pending request.', 'Your email was not changed.');
      return;
    }

    await applyActionCode(auth, actionCode);
    await clearRequestIfSignedIn(requestId, request, newEmail);
    showResult('success', 'Email confirmed', 'Your sign-in email has been updated.', 'Use the new address the next time you sign in.', newEmail);
  } catch (error) {
    console.error('Email confirmation failed:', error);
    var errorCode = String(error && error.code || '').toLowerCase();
    var expired = error && (error.code === 'auth/expired-action-code'
      || error.code === 'auth/invalid-action-code'
      || errorCode.indexOf('permission') !== -1);
    showResult('error', expired ? 'Confirmation unavailable' : 'Could not confirm email', expired
      ? 'This confirmation link has expired, was cancelled, or has already been used.'
      : 'We could not complete the email change.', expired
      ? 'Return to your profile to request a new confirmation.'
      : 'Please try again or request a new link from your profile.');
  }
}

confirmEmailChange();
