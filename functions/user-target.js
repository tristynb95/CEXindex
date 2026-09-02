"use strict";

// Shared input rules for the admin-only account actions in index.js. Setting
// somebody's password and signing them out everywhere both take the same
// thing — the uid of a person who is not the caller — so the check lives here
// once instead of drifting apart in two copies.

const INVALID_DATABASE_KEY_CHARACTERS = new Set([".", "#", "$", "[", "]", "/"]);

function inputError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateManagedUserUid(data, callerUid, messages) {
  const copy = messages || {};
  if (!data || typeof data !== "object") {
    throw inputError("invalid-argument", copy.missing || "Choose a person first.");
  }

  const uid = typeof data.uid === "string" ? data.uid.trim() : "";
  if (!uid || uid.length > 128 || Array.from(uid).some((character) => INVALID_DATABASE_KEY_CHARACTERS.has(character))) {
    throw inputError("invalid-argument", "That user account is not valid.");
  }
  if (uid === callerUid) {
    throw inputError("permission-denied", copy.self || "You cannot run this on your own account.");
  }

  return uid;
}

module.exports = {
  INVALID_DATABASE_KEY_CHARACTERS,
  inputError,
  validateManagedUserUid
};
