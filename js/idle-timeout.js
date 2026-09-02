import { signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { noteSignOutReason } from './sign-out-notice.js';

// Signs somebody out after an hour without activity, warning them first.
//
// Five minutes before the deadline a dialogue asks whether to stay signed in.
// Until that dialogue appears, ordinary use keeps the session alive silently —
// but once it is up, only the button extends the session. Letting a stray mouse
// move dismiss it would mean the warning vanishes without the person ever
// registering what it said, which is worse than not warning at all.
//
// Activity is shared across tabs through localStorage: somebody writing a visit
// report in one tab must not be timed out by the dashboard sitting idle in
// another. Every tab reads the same stamp, and the storage event tells the idle
// tabs when a sibling has been used.

const IDLE_LIMIT_MS = 60 * 60 * 1000;   // an hour without activity
const WARNING_MS = 5 * 60 * 1000;       // dialogue appears this far ahead
const ACTIVITY_KEY = 'gails:lastActivityAt';
const WRITE_THROTTLE_MS = 20 * 1000;    // at most one localStorage write per 20s
const TICK_MS = 1000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];

let session = null;

// One timer at a time, started and stopped from each page's auth state change.
// Call it with the signed-in user, or with null when there is nobody signed in.
export function trackIdleTimeout(auth, user) {
  if (session) {
    session.stop();
    session = null;
  }
  if (user) session = startIdleTimeout(auth);
}

export function startIdleTimeout(auth) {
  if (!auth) return { stop: function() {} };

  let warned = false;
  let signingOut = false;
  let lastWriteAt = 0;
  let ticker = null;
  const dialogue = buildDialogue();

  function readLastActivity() {
    try {
      const stored = Number(window.localStorage.getItem(ACTIVITY_KEY));
      if (isFinite(stored) && stored > 0) return stored;
    } catch {
      // Private browsing — fall back to this tab's own clock.
    }
    return lastWriteAt || Date.now();
  }

  function recordActivity(force) {
    const now = Date.now();
    if (!force && now - lastWriteAt < WRITE_THROTTLE_MS) return;
    lastWriteAt = now;
    try {
      window.localStorage.setItem(ACTIVITY_KEY, String(now));
    } catch {
      // Private browsing. The timeout still works, just not across tabs.
    }
  }

  function onActivity() {
    // Deliberately ignored while the dialogue is up: see the note at the top.
    if (warned || signingOut) return;
    recordActivity(false);
  }

  function onStorage(event) {
    if (event.key !== ACTIVITY_KEY) return;
    // A sibling tab was used. Re-evaluating now hides the dialogue here, so
    // being active anywhere counts as being active everywhere.
    tick();
  }

  function extend() {
    warned = false;
    recordActivity(true);
    dialogue.hide();
    // A fresh ID token, so somebody who stays all day is not left holding one
    // that is nearly expired. Failure is not fatal — the SDK renews on its own.
    const user = auth.currentUser;
    if (user) {
      user.getIdToken(true).catch(function(tokenError) {
        console.warn('Could not refresh the session token:', tokenError);
      });
    }
  }

  function endSession(reason) {
    if (signingOut) return;
    signingOut = true;
    dialogue.hide();
    if (reason) noteSignOutReason(reason);
    signOut(auth).catch(function(signOutError) {
      console.warn('Could not complete the idle sign-out:', signOutError);
    });
  }

  function tick() {
    if (signingOut) return;
    const idleFor = Date.now() - readLastActivity();

    if (idleFor >= IDLE_LIMIT_MS) {
      endSession('idle');
      return;
    }
    if (idleFor >= IDLE_LIMIT_MS - WARNING_MS) {
      warned = true;
      dialogue.show(IDLE_LIMIT_MS - idleFor);
      return;
    }
    if (warned) {
      warned = false;
      dialogue.hide();
    }
  }

  function stop() {
    if (ticker) {
      window.clearInterval(ticker);
      ticker = null;
    }
    ACTIVITY_EVENTS.forEach(function(name) {
      window.removeEventListener(name, onActivity, true);
    });
    window.removeEventListener('storage', onStorage);
    dialogue.destroy();
  }

  dialogue.onExtend(extend);
  dialogue.onSignOut(function() { endSession(null); });
  recordActivity(true);
  ACTIVITY_EVENTS.forEach(function(name) {
    window.addEventListener(name, onActivity, true);
  });
  window.addEventListener('storage', onStorage);
  ticker = window.setInterval(tick, TICK_MS);

  return { stop: stop, extend: extend, tick: tick };
}

// Injected rather than written into six HTML files, for the same reason the
// account menu is: one copy cannot drift into six slightly different ones.
function buildDialogue() {
  const root = document.createElement('div');
  root.className = 'modal-overlay idle-modal';
  root.id = 'idleTimeoutModal';
  root.hidden = true;
  root.innerHTML =
    '<div class="idle-modal__surface" role="alertdialog" aria-modal="true"' +
      ' aria-labelledby="idleTimeoutTitle" aria-describedby="idleTimeoutBody">' +
      '<div class="idle-modal__head">' +
        '<span class="idle-modal__eyebrow">Session</span>' +
        '<h3 class="idle-modal__title" id="idleTimeoutTitle">Are you still there?</h3>' +
        '<p class="idle-modal__sub" id="idleTimeoutBody">You have been inactive for a while, so we are about to sign you out to keep the dashboard secure.</p>' +
      '</div>' +
      '<div class="idle-modal__countdown">' +
        '<span class="idle-modal__countdown-label">Signing out in</span>' +
        '<span class="idle-modal__countdown-value" data-idle-countdown role="timer" aria-live="polite">5:00</span>' +
      '</div>' +
      '<div class="idle-modal__actions">' +
        '<button type="button" class="idle-modal__secondary" data-idle-sign-out>Sign out now</button>' +
        '<button type="button" class="btn" data-idle-extend>Stay signed in</button>' +
      '</div>' +
    '</div>';

  const countdown = root.querySelector('[data-idle-countdown]');
  const extendBtn = root.querySelector('[data-idle-extend]');
  const signOutBtn = root.querySelector('[data-idle-sign-out]');
  let mounted = false;
  let shownText = '';

  return {
    show: function(remainingMs) {
      if (!mounted) {
        document.body.appendChild(root);
        mounted = true;
      }
      const wasHidden = root.hidden;
      root.hidden = false;
      const text = formatRemaining(remainingMs);
      // Only touched when it changes, so the live region is not read a running
      // clock digit by digit.
      if (text !== shownText) {
        shownText = text;
        countdown.textContent = text;
      }
      if (wasHidden) extendBtn.focus();
    },
    hide: function() {
      root.hidden = true;
    },
    destroy: function() {
      root.hidden = true;
      if (mounted && root.parentNode) root.parentNode.removeChild(root);
      mounted = false;
    },
    onExtend: function(handler) { extendBtn.addEventListener('click', handler); },
    onSignOut: function(handler) { signOutBtn.addEventListener('click', handler); }
  };
}

function formatRemaining(remainingMs) {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

export const IDLE_TIMEOUT_CONFIG = { IDLE_LIMIT_MS, WARNING_MS, ACTIVITY_KEY };
