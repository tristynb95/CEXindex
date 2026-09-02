"use strict";

const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getDatabase} = require("firebase-admin/database");
const {logger} = require("firebase-functions/logger");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {validatePasswordChangeInput} = require("./password-policy");
const {validateSessionRevocationInput} = require("./session-policy");

initializeApp();

const ALLOWED_ORIGINS = [
  "https://cexindex.web.app",
  "https://cexindex.firebaseapp.com",
  /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/
];

function callableInput(request) {
  try {
    return validatePasswordChangeInput(request.data, request.auth.uid);
  } catch (error) {
    throw new HttpsError(error.code || "invalid-argument", error.message);
  }
}

// Client-side visibility is only presentation. Both account-security calls run
// this instead: custom roles that can edit the People table cannot set
// passwords or end somebody's sessions.
async function assertFullAdmin(database, actorUid, action) {
  const adminSnapshot = await database.ref(`admins/${actorUid}`).get();
  if (adminSnapshot.val() !== true) {
    throw new HttpsError("permission-denied", `Only a full administrator can ${action}.`);
  }
}

async function lookUpTarget(targetUid, actorUid) {
  try {
    return await getAuth().getUser(targetUid);
  } catch (error) {
    if (error && error.code === "auth/user-not-found") {
      throw new HttpsError("failed-precondition", "That user account no longer exists.");
    }
    logger.error("Could not look up the account action target.", {actorUid, targetUid, code: error && error.code});
    throw new HttpsError("internal", "The user account could not be checked.");
  }
}

// revokeRefreshTokens stops any device renewing its ID token, but a tab that is
// already open keeps the token it is holding until that expires — up to an hour
// later. This stamp is what closes the gap: every page watches its own row (see
// js/session-guard.js) and signs out the moment a stamp later than its sign-in
// lands. Milliseconds, so the client can compare it against the auth_time claim.
function sessionRevocationStamp(actorEmail, atMs) {
  return {
    revokedAt: atMs,
    at: new Date(atMs).toISOString(),
    by: actorEmail
  };
}

exports.setUserPassword = onCall({
  region: "us-central1",
  cors: ALLOWED_ORIGINS,
  invoker: "public",
  memory: "256MiB",
  timeoutSeconds: 30,
  maxInstances: 5
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before changing a password.");
  }

  const {uid: targetUid, password} = callableInput(request);
  const actorUid = request.auth.uid;
  const actorEmail = request.auth.token.email || actorUid;
  const database = getDatabase();

  await assertFullAdmin(database, actorUid, "set another person's password");

  const targetUser = await lookUpTarget(targetUid, actorUid);
  if (targetUser.disabled) {
    throw new HttpsError("failed-precondition", "This account is disabled. Restore its access before setting a password.");
  }

  try {
    await getAuth().updateUser(targetUid, {password});
  } catch (error) {
    logger.error("Could not set a managed user's password.", {actorUid, targetUid, code: error && error.code});
    throw new HttpsError("internal", "The password could not be changed. Please try again.");
  }

  // Password updates invalidate refresh tokens automatically. Keep an explicit
  // revocation as defence in depth, but do not report the successful password
  // change as failed if this redundant call has a transient error.
  try {
    await getAuth().revokeRefreshTokens(targetUid);
  } catch (error) {
    logger.warn("Password changed; explicit session revocation could not be repeated.", {actorUid, targetUid, code: error && error.code});
  }

  const changedAtMs = Date.now();
  const changedAt = new Date(changedAtMs).toISOString();
  const auditKey = database.ref("securityAudit/passwordChanges").push().key;
  const updates = {};
  updates[`sessionRevocations/${targetUid}`] = sessionRevocationStamp(actorEmail, changedAtMs);
  updates[`securityAudit/passwordChanges/${auditKey}`] = {
    action: "password.set_by_admin",
    actorUid,
    actorEmail,
    targetUid,
    targetEmail: targetUser.email || null,
    at: changedAt
  };

  let auditRecorded = true;
  try {
    const invitationSnapshot = await database.ref(`users/${targetUid}/invitation`).get();
    if (invitationSnapshot.exists()) {
      updates[`users/${targetUid}/invitation/passwordSetAt`] = changedAt;
      updates[`users/${targetUid}/invitation/passwordSetBy`] = actorEmail;
    }
    await database.ref().update(updates);
  } catch (error) {
    auditRecorded = false;
    logger.warn("Password changed, but audit metadata could not be saved.", {actorUid, targetUid, code: error && error.code});
  }

  logger.info("Admin password change completed.", {actorUid, targetUid, auditRecorded});
  return {
    uid: targetUid,
    email: targetUser.email || null,
    sessionsRevoked: true,
    auditRecorded
  };
});

exports.revokeUserSessions = onCall({
  region: "us-central1",
  cors: ALLOWED_ORIGINS,
  invoker: "public",
  memory: "256MiB",
  timeoutSeconds: 30,
  maxInstances: 5
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in before ending someone's sessions.");
  }

  let targetUid;
  try {
    ({uid: targetUid} = validateSessionRevocationInput(request.data, request.auth.uid));
  } catch (error) {
    throw new HttpsError(error.code || "invalid-argument", error.message);
  }

  const actorUid = request.auth.uid;
  const actorEmail = request.auth.token.email || actorUid;
  const database = getDatabase();

  await assertFullAdmin(database, actorUid, "sign someone out of every device");

  const targetUser = await lookUpTarget(targetUid, actorUid);

  try {
    await getAuth().revokeRefreshTokens(targetUid);
  } catch (error) {
    logger.error("Could not revoke a user's refresh tokens.", {actorUid, targetUid, code: error && error.code});
    throw new HttpsError("internal", "Their sessions could not be ended. Please try again.");
  }

  const revokedAtMs = Date.now();
  const revokedAt = new Date(revokedAtMs).toISOString();
  const auditKey = database.ref("securityAudit/sessionRevocations").push().key;
  const updates = {};
  updates[`sessionRevocations/${targetUid}`] = sessionRevocationStamp(actorEmail, revokedAtMs);
  updates[`securityAudit/sessionRevocations/${auditKey}`] = {
    action: "sessions.revoked_by_admin",
    actorUid,
    actorEmail,
    targetUid,
    targetEmail: targetUser.email || null,
    at: revokedAt
  };

  // The refresh tokens are already gone by this point, so a failed write costs
  // the open tabs their immediate sign-out, not the revocation itself. Report
  // it rather than failing the whole call.
  let stampRecorded = true;
  try {
    await database.ref().update(updates);
  } catch (error) {
    stampRecorded = false;
    logger.warn("Sessions revoked, but the revocation stamp could not be saved.", {actorUid, targetUid, code: error && error.code});
  }

  logger.info("Admin session revocation completed.", {actorUid, targetUid, stampRecorded});
  return {
    uid: targetUid,
    email: targetUser.email || null,
    revokedAt,
    stampRecorded
  };
});
