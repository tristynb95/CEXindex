const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('admin.html');
const adminScript = read('js/admin-page.js');
const functionScript = read('functions/index.js');
const firebaseConfig = JSON.parse(read('firebase.json'));
const databaseRules = JSON.parse(read('database.rules.json'));
const {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validatePasswordChangeInput
} = require('../functions/password-policy');

test('admin password form asks only for a new password and confirmation', () => {
  assert.match(html, /id="userAccessPasswordPanel"/);
  assert.match(html, /id="userAccessNewPassword"[^>]*autocomplete="new-password"[^>]*minlength="12"/);
  assert.match(html, /id="userAccessConfirmPassword"[^>]*autocomplete="new-password"/);
  assert.doesNotMatch(html, /id="userAccessCurrentPassword"|name="currentPassword"/);
  assert.match(html, /The current password cannot be viewed/);
});

test('only a verified full admin sees and invokes the direct password control', () => {
  assert.match(adminScript, /state\.isFullAdmin = adminSnap\.exists\(\) && adminSnap\.val\(\) === true/);
  assert.match(adminScript, /userAccessSetPassword\.hidden = !state\.isFullAdmin \|\| isCurrent/);
  assert.match(adminScript, /setUserPasswordCall\(\{ uid: uid, password: password \}\)/);
  assert.match(adminScript, /event\.target\.closest\('#userAccessPasswordPanel'\)/);
});

test('server validates auth and full-admin status before changing a password', () => {
  assert.match(functionScript, /if \(!request\.auth\)/);
  assert.match(functionScript, /database\.ref\(`admins\/\$\{actorUid\}`\)\.get\(\)/);
  assert.match(functionScript, /adminSnapshot\.val\(\) !== true/);
  assert.match(functionScript, /getAuth\(\)\.updateUser\(targetUid, \{password\}\)/);
  assert.match(functionScript, /getAuth\(\)\.revokeRefreshTokens\(targetUid\)/);
});

test('password input policy blocks self-service, malformed targets, and weak values', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 12);
  assert.equal(MAX_PASSWORD_LENGTH, 128);
  assert.deepEqual(
    validatePasswordChangeInput({uid: 'target-uid', password: 'A secure passphrase 42!'}, 'admin-uid'),
    {uid: 'target-uid', password: 'A secure passphrase 42!'}
  );
  assert.throws(
    () => validatePasswordChangeInput({uid: 'admin-uid', password: 'A secure passphrase 42!'}, 'admin-uid'),
    (error) => error.code === 'permission-denied'
  );
  assert.throws(
    () => validatePasswordChangeInput({uid: 'bad/uid', password: 'A secure passphrase 42!'}, 'admin-uid'),
    (error) => error.code === 'invalid-argument'
  );
  assert.throws(
    () => validatePasswordChangeInput({uid: 'target-uid', password: 'too short'}, 'admin-uid'),
    (error) => error.code === 'invalid-argument'
  );
});

test('audit trail stores identities and time, never the password', () => {
  const auditStart = functionScript.indexOf('updates[`securityAudit/passwordChanges/${auditKey}`] = {');
  const auditEnd = functionScript.indexOf('\n  };', auditStart);
  const auditPayload = functionScript.slice(auditStart, auditEnd);
  assert.ok(auditStart >= 0 && auditEnd > auditStart);
  assert.match(auditPayload, /actorUid/);
  assert.match(auditPayload, /targetUid/);
  assert.match(auditPayload, /at: changedAt/);
  assert.doesNotMatch(auditPayload, /\bpassword\s*:/i);
  assert.equal(databaseRules.rules.securityAudit['.write'], false);
  assert.match(databaseRules.rules.securityAudit['.read'], /admins/);
});

test('Cloud Functions uses the supported Node 22 runtime', () => {
  assert.equal(firebaseConfig.functions.source, 'functions');
  assert.equal(firebaseConfig.functions.runtime, 'nodejs22');
  assert.ok(firebaseConfig.hosting.ignore.includes('functions/**'));
  const functionPackage = JSON.parse(read('functions/package.json'));
  assert.equal(functionPackage.engines.node, '22');
});
