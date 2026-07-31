import { auth, db } from './firebase-config.js';
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  updateEmail,
  updatePassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, get, set, update as updateRecord, remove } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { BUILTIN_ROLES, resolveRolePermissions, canSeeTeam } from './permissions.js';
import { mountStandaloneProfileMenu } from './standalone-profile-menu.js';

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

const passwordForm = document.getElementById('profilePasswordForm');
const currentPasswordInput = document.getElementById('profileCurrentPassword');
const newPasswordInput = document.getElementById('profileNewPassword');
const confirmPasswordInput = document.getElementById('profileConfirmPassword');
const passwordMessageEl = document.getElementById('profilePasswordMessage');
const passwordBtn = document.getElementById('profilePasswordBtn');

const emailModal = document.getElementById('profileEmailModal');
const emailModalBackdrop = document.getElementById('profileEmailModalBackdrop');
const emailModalClose = document.getElementById('profileEmailModalClose');
const emailModalCancel = document.getElementById('profileEmailModalCancel');
const emailModalAddress = document.getElementById('profileEmailModalAddress');
const emailConfirmForm = document.getElementById('profileEmailConfirmForm');
const emailPasswordInput = document.getElementById('profileEmailPassword');
const emailModalMessage = document.getElementById('profileEmailModalMessage');
const emailConfirmBtn = document.getElementById('profileEmailConfirmBtn');


let profileRecord = null;
let currentRoleName = 'Viewer';
let currentPermissions = null;
let pendingProfileSave = null;
let headerProfileMenu = null;

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

function setMessage(element, type, text) {
  element.className = 'profile-message' + (type ? ' is-' + type : '');
  element.textContent = text || '';
  element.hidden = !text;
}

function setButtonBusy(button, busy, busyText, readyText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : readyText;
}

// My Activity is opt-in per user (users/{uid}.myActivity, granted in the admin
// portal), so the header link is hidden until it has been turned on. My Team
// is granted by the role instead, so it follows the role's team scope.
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
  if (headerProfileMenu) headerProfileMenu.update(user, record);
}

// Resolves the role once, for both its display name and what it grants —
// avoiding a second read of the same record just to decide whether the My Team
// link belongs in the header.
async function loadRole(roleId) {
  if (BUILTIN_ROLES[roleId]) {
    return { name: BUILTIN_ROLES[roleId].name, permissions: resolveRolePermissions(roleId, null) };
  }
  var definition = null;
  try {
    var roleSnapshot = await get(ref(db, 'roles/' + roleId));
    definition = roleSnapshot.exists() ? roleSnapshot.val() : null;
  } catch (error) {
    console.warn('Could not load the assigned role:', error);
  }
  return {
    name: (definition && definition.name) || roleId || 'Viewer',
    permissions: resolveRolePermissions(roleId, definition)
  };
}

function hasPasswordProvider(user) {
  return Boolean(user && user.providerData && user.providerData.some(function(provider) {
    return provider.providerId === 'password';
  }));
}

function friendlyError(error) {
  var code = error && error.code;
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-mismatch') {
    return 'The current password is incorrect.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'Please confirm your current password again.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'That email address is already linked to another account.';
  }
  if (code === 'auth/invalid-email') {
    return 'Enter a valid work email address.';
  }
  if (code === 'auth/weak-password') {
    return 'Choose a stronger password with at least 6 characters.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts were made. Wait a moment and try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'The request could not reach Firebase. Check your connection and try again.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Direct email changes are blocked by Firebase email-enumeration protection. An administrator must disable that setting or add a secure backend.';
  }
  if (code === 'auth/password-provider-unavailable') {
    return 'This account does not use a password sign-in, so it cannot be confirmed with a password.';
  }
  return error && error.message ? error.message : 'Your changes could not be saved. Please try again.';
}

async function reauthenticateWithPassword(user, password) {
  if (!hasPasswordProvider(user)) {
    var providerError = new Error('Password confirmation is unavailable for this account.');
    providerError.code = 'auth/password-provider-unavailable';
    throw providerError;
  }
  var credential = EmailAuthProvider.credential(user.email || '', password);
  await reauthenticateWithCredential(user, credential);
}

async function saveProfileDetails(user, details, includeEmail) {
  var displayName = details.firstName + ' ' + details.lastName;
  if (displayName !== user.displayName) {
    try {
      await updateProfile(user, { displayName: displayName });
    } catch (profileError) {
      console.warn('Could not mirror the name to Firebase Auth:', profileError);
    }
  }

  var updates = {
    firstName: details.firstName,
    lastName: details.lastName,
    updatedAt: new Date().toISOString()
  };
  if (includeEmail) updates.email = details.email;

  await updateRecord(ref(db, 'users/' + user.uid), updates);

  // Keep the shared people directory in step, so a renamed colleague is
  // @mentionable under their new name straight away. Best-effort: the directory
  // is a convenience for the mention picker, not part of the profile record.
  try {
    await set(ref(db, 'userDirectory/' + user.uid), {
      name: displayName.trim(),
      email: (includeEmail ? details.email : user.email) || ''
    });
  } catch (directoryError) {
    console.warn('Could not update your entry in the shared people directory:', directoryError);
  }

  profileRecord = Object.assign({}, profileRecord, updates);
  renderProfile(user, profileRecord);
}

function openEmailModal(details) {
  var user = auth.currentUser;
  if (!hasPasswordProvider(user)) {
    setMessage(messageEl, 'error', friendlyError({ code: 'auth/password-provider-unavailable' }));
    return;
  }

  pendingProfileSave = details;
  emailModalAddress.textContent = details.email;
  emailPasswordInput.value = '';
  setMessage(emailModalMessage, '', '');
  emailModal.hidden = false;
  document.body.classList.add('profile-modal-open');
  window.setTimeout(function() {
    emailPasswordInput.focus();
  }, 0);
}

function closeEmailModal() {
  if (emailConfirmBtn.disabled) return;
  emailModal.hidden = true;
  document.body.classList.remove('profile-modal-open');
  emailPasswordInput.value = '';
  pendingProfileSave = null;
  setMessage(emailModalMessage, '', '');
  emailInput.focus();
}

onAuthStateChanged(auth, async function(user) {
  if (!user) {
    window.location.replace('index.html');
    return;
  }

  try {
    var userRef = ref(db, 'users/' + user.uid);
    // Independent reads, so one round trip rather than two.
    var gateSnapshots = await Promise.all([
      get(userRef),
      get(ref(db, 'admins/' + user.uid))
    ]);
    var userSnapshot = gateSnapshots[0];
    var adminSnapshot = gateSnapshots[1];
    var isAdmin = adminSnapshot.exists() && adminSnapshot.val() === true;

    if (!userSnapshot.exists() && !isAdmin) {
      await signOut(auth);
      window.location.replace('index.html');
      return;
    }

    profileRecord = userSnapshot.exists()
      ? userSnapshot.val()
      : { firstName: '', lastName: '', email: user.email || '', role: 'admin' };

    var cleanup = {};
    var obsoleteRequestId = profileRecord.pendingEmailRequestId || '';
    if (obsoleteRequestId || profileRecord.pendingEmailAddress) {
      cleanup.pendingEmailRequestId = null;
      cleanup.pendingEmailAddress = null;
      profileRecord.pendingEmailRequestId = null;
      profileRecord.pendingEmailAddress = null;
    }
    if (user.email && String(profileRecord.email || '').toLowerCase() !== user.email.toLowerCase()) {
      cleanup.email = user.email;
      cleanup.updatedAt = new Date().toISOString();
      profileRecord.email = user.email;
    }
    if (Object.keys(cleanup).length) await updateRecord(userRef, cleanup);
    if (obsoleteRequestId) {
      await remove(ref(db, 'emailChangeRequests/' + obsoleteRequestId)).catch(function(error) {
        console.warn('Could not remove the obsolete email request:', error);
      });
    }

    var roleId = isAdmin ? 'admin' : (profileRecord.role || 'viewer');
    var role = await loadRole(roleId);
    currentRoleName = role.name;
    currentPermissions = role.permissions;
    headerProfileMenu = mountStandaloneProfileMenu({
      user: user,
      profile: profileRecord,
      showActivity: profileRecord.myActivity === true,
      showTeam: canSeeTeam(currentPermissions),
      permissions: currentPermissions,
      onSignOut: async function() {
        await signOut(auth);
        window.location.href = 'index.html';
      }
    });
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
  setMessage(messageEl, '', '');

  var user = auth.currentUser;
  if (!user || !profileRecord) return;

  var details = {
    firstName: firstNameInput.value.trim(),
    lastName: lastNameInput.value.trim(),
    email: emailInput.value.trim()
  };
  if (!details.firstName || !details.lastName || !details.email) {
    setMessage(messageEl, 'error', 'Enter your first name, last name, and work email.');
    return;
  }

  var emailChanged = details.email.toLowerCase() !== String(user.email || '').toLowerCase();
  if (emailChanged) {
    openEmailModal(details);
    return;
  }

  setButtonBusy(saveBtn, true, 'Saving…', 'Save changes');
  try {
    await saveProfileDetails(user, details, false);
    setMessage(messageEl, 'success', 'Your profile has been updated.');
  } catch (error) {
    console.error('Could not save profile:', error);
    setMessage(messageEl, 'error', friendlyError(error));
  } finally {
    setButtonBusy(saveBtn, false, 'Saving…', 'Save changes');
  }
});

emailConfirmForm.addEventListener('submit', async function(event) {
  event.preventDefault();
  setMessage(emailModalMessage, '', '');

  var user = auth.currentUser;
  var details = pendingProfileSave;
  var currentPassword = emailPasswordInput.value;
  if (!user || !details) return;
  if (!currentPassword) {
    setMessage(emailModalMessage, 'error', 'Enter your current password.');
    return;
  }

  var emailWasUpdated = false;
  setButtonBusy(emailConfirmBtn, true, 'Changing email…', 'Confirm and change email');
  try {
    await reauthenticateWithPassword(user, currentPassword);
    await updateEmail(user, details.email);
    emailWasUpdated = true;
    await saveProfileDetails(user, details, true);

    emailModal.hidden = true;
    document.body.classList.remove('profile-modal-open');
    emailPasswordInput.value = '';
    pendingProfileSave = null;
    setMessage(messageEl, 'success', 'Your profile and sign-in email have been updated.');
  } catch (error) {
    console.error('Could not change email:', error);
    if (emailWasUpdated) {
      renderProfile(user, Object.assign({}, profileRecord, { email: user.email || details.email }));
      setMessage(emailModalMessage, 'error', 'Your sign-in email changed, but the profile record could not be fully updated. Refresh the page to finish syncing it.');
    } else {
      setMessage(emailModalMessage, 'error', friendlyError(error));
    }
  } finally {
    setButtonBusy(emailConfirmBtn, false, 'Changing email…', 'Confirm and change email');
  }
});

passwordForm.addEventListener('submit', async function(event) {
  event.preventDefault();
  setMessage(passwordMessageEl, '', '');

  var user = auth.currentUser;
  var currentPassword = currentPasswordInput.value;
  var newPassword = newPasswordInput.value;
  var confirmedPassword = confirmPasswordInput.value;
  if (!user) return;

  if (!currentPassword || !newPassword || !confirmedPassword) {
    setMessage(passwordMessageEl, 'error', 'Complete all three password fields.');
    return;
  }
  if (newPassword.length < 6) {
    setMessage(passwordMessageEl, 'error', 'Your new password must contain at least 6 characters.');
    return;
  }
  if (newPassword !== confirmedPassword) {
    setMessage(passwordMessageEl, 'error', 'The new passwords do not match.');
    confirmPasswordInput.focus();
    return;
  }
  if (newPassword === currentPassword) {
    setMessage(passwordMessageEl, 'error', 'Choose a new password that is different from your current password.');
    newPasswordInput.focus();
    return;
  }

  setButtonBusy(passwordBtn, true, 'Updating password…', 'Update password');
  try {
    await reauthenticateWithPassword(user, currentPassword);
    await updatePassword(user, newPassword);
    passwordForm.reset();
    setMessage(passwordMessageEl, 'success', 'Your password has been updated.');
  } catch (error) {
    console.error('Could not change password:', error);
    setMessage(passwordMessageEl, 'error', friendlyError(error));
  } finally {
    setButtonBusy(passwordBtn, false, 'Updating password…', 'Update password');
  }
});

[emailModalBackdrop, emailModalClose, emailModalCancel].forEach(function(control) {
  control.addEventListener('click', closeEmailModal);
});

document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape' && !emailModal.hidden) closeEmailModal();
});
