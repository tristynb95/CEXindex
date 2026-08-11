"use strict";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const INVALID_DATABASE_KEY_CHARACTERS = new Set([".", "#", "$", "[", "]", "/"]);

function inputError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validatePasswordChangeInput(data, callerUid) {
  if (!data || typeof data !== "object") {
    throw inputError("invalid-argument", "Choose a person and enter a new password.");
  }

  const uid = typeof data.uid === "string" ? data.uid.trim() : "";
  const password = data.password;

  if (!uid || uid.length > 128 || Array.from(uid).some((character) => INVALID_DATABASE_KEY_CHARACTERS.has(character))) {
    throw inputError("invalid-argument", "That user account is not valid.");
  }
  if (uid === callerUid) {
    throw inputError("permission-denied", "Use your Profile page to change your own password.");
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw inputError("invalid-argument", `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw inputError("invalid-argument", `The new password must be no more than ${MAX_PASSWORD_LENGTH} characters.`);
  }

  return {uid, password};
}

module.exports = {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validatePasswordChangeInput
};
