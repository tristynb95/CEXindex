// Why somebody is looking at the login form when they did not ask to be.
//
// Both automatic sign-outs — an administrator ending sessions, and the idle
// timeout — happen on whatever page the person was using, then land them on
// index.html. Without this they arrive at a blank login form with no idea what
// happened. The reason is left in sessionStorage, which survives the redirect,
// and js/auth.js reads it once as the login screen renders.

const SIGN_OUT_REASON_KEY = 'gails:signedOutReason';

const REASON_MESSAGES = {
  revoked: 'An administrator signed you out of every device. Sign in again to continue.',
  idle: 'You were signed out after a period of inactivity, to keep the dashboard secure. Sign in again to continue.'
};

export function noteSignOutReason(reason) {
  if (!REASON_MESSAGES[reason]) return;
  try {
    window.sessionStorage.setItem(SIGN_OUT_REASON_KEY, reason);
  } catch {
    // Private browsing. The sign-out still happens; only the notice is lost.
  }
}

// Read once and cleared, so a later voluntary sign-out does not replay it.
export function consumeSignOutNotice() {
  try {
    const reason = window.sessionStorage.getItem(SIGN_OUT_REASON_KEY);
    if (!reason) return '';
    window.sessionStorage.removeItem(SIGN_OUT_REASON_KEY);
    return REASON_MESSAGES[reason] || '';
  } catch {
    return '';
  }
}
