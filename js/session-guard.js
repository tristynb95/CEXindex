import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { noteSignOutReason } from './sign-out-notice.js';

// Watches for an administrator ending this person's sessions from the People
// panel ("Sign out everywhere").
//
// The revocation itself happens server-side, in the revokeUserSessions Cloud
// Function: it drops the refresh tokens, so no device can renew, and any page
// that is reloaded is signed out immediately. What it cannot do on its own is
// close a tab that is already open — that tab keeps the ID token it is holding
// until it expires, up to an hour later. So the function also stamps
// sessionRevocations/{uid}, and this listener turns that stamp into an
// immediate sign-out on every open tab.
//
// Presentation, in other words, in the same sense as the report visibility
// controls: the authority is the revoked refresh token, and this is what makes
// it visible straight away.

var activeStop = null;

// One guard at a time, started and stopped from each page's auth state change.
// Call it with the signed-in user, or with null when there is nobody signed in.
export function trackSessionRevocation(auth, db, user) {
  if (activeStop) {
    activeStop();
    activeStop = null;
  }
  if (user) activeStop = startSessionRevocationGuard(auth, db, user);
}

export function startSessionRevocationGuard(auth, db, user) {
  if (!auth || !db || !user) return function() {};

  var stopped = false;
  var unsubscribe = null;

  function stop() {
    stopped = true;
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  user.getIdTokenResult().then(function(token) {
    if (stopped) return;
    // Whole seconds, because that is the granularity Firebase stamps auth_time
    // with. A revocation inside the same second as the sign-in is an admin's
    // click racing this person's fresh login, and is deliberately ignored —
    // the same comparison Firebase's own revocation rules use.
    var signedInAt = Math.floor(Date.parse(token.authTime) / 1000);
    if (!isFinite(signedInAt)) return;

    unsubscribe = onValue(ref(db, 'sessionRevocations/' + user.uid + '/revokedAt'), function(snapshot) {
      var revokedAt = snapshot.val();
      if (typeof revokedAt !== 'number' || Math.floor(revokedAt / 1000) <= signedInAt) return;
      stop();
      noteSignOutReason('revoked');
      signOut(auth).catch(function(signOutError) {
        console.warn('Could not complete a remote sign-out:', signOutError);
      });
    }, function(watchError) {
      console.warn('Could not watch for a remote sign-out:', watchError);
    });
  }).catch(function(tokenError) {
    console.warn('Could not read the sign-in time for the session guard:', tokenError);
  });

  return stop;
}
