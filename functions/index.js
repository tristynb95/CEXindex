"use strict";

const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getDatabase} = require("firebase-admin/database");
const {logger} = require("firebase-functions/logger");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {validatePasswordChangeInput} = require("./password-policy");

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

  // Client-side visibility is only presentation. This server-side check is the
  // authority: custom roles that can edit the People table cannot set passwords.
  const adminSnapshot = await database.ref(`admins/${actorUid}`).get();
  if (adminSnapshot.val() !== true) {
    throw new HttpsError("permission-denied", "Only a full administrator can set another person's password.");
  }

  let targetUser;
  try {
    targetUser = await getAuth().getUser(targetUid);
  } catch (error) {
    if (error && error.code === "auth/user-not-found") {
      throw new HttpsError("failed-precondition", "That user account no longer exists.");
    }
    logger.error("Could not look up the password-change target.", {actorUid, targetUid, code: error && error.code});
    throw new HttpsError("internal", "The user account could not be checked.");
  }

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

  const changedAt = new Date().toISOString();
  const auditKey = database.ref("securityAudit/passwordChanges").push().key;
  const updates = {};
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
