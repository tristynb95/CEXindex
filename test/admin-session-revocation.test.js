const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('admin.html');
const adminScript = read('js/admin-page.js');
const authScript = read('js/auth.js');
const guardScript = read('js/session-guard.js');
const functionScript = read('functions/index.js');
const databaseRules = JSON.parse(read('database.rules.json'));
const {validateSessionRevocationInput} = require('../functions/session-policy');

test('the access modal offers sign out everywhere to full admins only, never for yourself', () => {
  assert.match(html, /id="userAccessSignOutEverywhere"[^>]*>Sign out everywhere</);
  assert.match(adminScript, /userAccessSignOutEverywhere\.hidden = !state\.isFullAdmin \|\| isCurrent/);
  assert.match(adminScript, /if \(!user \|\| !state\.isFullAdmin \|\| uid === currentUserId\(\)\) return;/);
  assert.match(adminScript, /revokeUserSessionsCall\(\{ uid: uid \}\)/);
  assert.match(adminScript, /httpsCallable\(functionsClient, 'revokeUserSessions'\)/);
});

test('the input policy blocks self-revocation and malformed targets', () => {
  assert.deepEqual(validateSessionRevocationInput({uid: 'target-uid'}, 'admin-uid'), {uid: 'target-uid'});
  assert.throws(
    () => validateSessionRevocationInput({uid: 'admin-uid'}, 'admin-uid'),
    (error) => error.code === 'permission-denied'
  );
  assert.throws(
    () => validateSessionRevocationInput({uid: 'bad/uid'}, 'admin-uid'),
    (error) => error.code === 'invalid-argument'
  );
  assert.throws(
    () => validateSessionRevocationInput(null, 'admin-uid'),
    (error) => error.code === 'invalid-argument'
  );
});

test('the server revokes refresh tokens behind a full-admin check', () => {
  const start = functionScript.indexOf('exports.revokeUserSessions');
  assert.ok(start > 0);
  const body = functionScript.slice(start);
  assert.match(body, /if \(!request\.auth\)/);
  assert.match(body, /assertFullAdmin\(database, actorUid, "sign someone out of every device"\)/);
  assert.match(body, /getAuth\(\)\.revokeRefreshTokens\(targetUid\)/);
  assert.match(functionScript, /adminSnapshot\.val\(\) !== true/);
});

test('both account-security calls stamp the revocation that signs open tabs out', () => {
  assert.match(functionScript, /updates\[`sessionRevocations\/\$\{targetUid\}`\] = sessionRevocationStamp\(actorEmail, revokedAtMs\)/);
  assert.match(functionScript, /updates\[`sessionRevocations\/\$\{targetUid\}`\] = sessionRevocationStamp\(actorEmail, changedAtMs\)/);
  assert.match(functionScript, /revokedAt: atMs/);
});

test('the revocation audit records identities and time, and nobody can write the stamp', () => {
  const start = functionScript.indexOf('updates[`securityAudit/sessionRevocations/${auditKey}`] = {');
  const end = functionScript.indexOf('\n  };', start);
  const payload = functionScript.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(payload, /action: "sessions\.revoked_by_admin"/);
  assert.match(payload, /actorUid/);
  assert.match(payload, /targetUid/);
  assert.match(payload, /at: revokedAt/);

  const revocations = databaseRules.rules.sessionRevocations;
  assert.equal(revocations['.write'], false);
  assert.match(revocations['.read'], /admins/);
  assert.match(revocations.$uid['.read'], /auth\.uid === \$uid/);
});

test('every signed-in page watches its own revocation stamp', () => {
  [
    ['js/auth.js', authScript],
    ['js/admin-page.js', adminScript],
    ['js/bakery-profile.js', read('js/bakery-profile.js')],
    ['js/my-activity.js', read('js/my-activity.js')],
    ['js/my-team.js', read('js/my-team.js')],
    ['js/profile-page.js', read('js/profile-page.js')]
  ].forEach(([name, source]) => {
    assert.match(source, /import \{[^}]*trackSessionRevocation[^}]*\} from '\.\/session-guard\.js'/, name);
    assert.match(source, /trackSessionRevocation\((?:primaryAuth|auth), db, user\)/, name);
  });
});

test('the guard ignores stamps from before the current sign-in and signs out for later ones', () => {
  assert.match(guardScript, /sessionRevocations\/' \+ user\.uid \+ '\/revokedAt/);
  assert.match(guardScript, /Math\.floor\(Date\.parse\(token\.authTime\) \/ 1000\)/);
  assert.match(guardScript, /Math\.floor\(revokedAt \/ 1000\) <= signedInAt\) return;/);
  assert.match(guardScript, /signOut\(auth\)/);
});

test('somebody signed out remotely is told why on the login screen', () => {
  const notice = read('js/sign-out-notice.js');
  assert.match(guardScript, /noteSignOutReason\('revoked'\)/);
  assert.match(notice, /revoked: 'An administrator signed you out of every device/);
  assert.match(authScript, /var signOutNotice = consumeSignOutNotice\(\);/);
  assert.match(authScript, /loginError\.textContent = signOutNotice;/);
});
