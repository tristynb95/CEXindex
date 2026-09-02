"use strict";

const {inputError, validateManagedUserUid} = require("./user-target");

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

function validatePasswordChangeInput(data, callerUid) {
  const uid = validateManagedUserUid(data, callerUid, {
    missing: "Choose a person and enter a new password.",
    self: "Use your Profile page to change your own password."
  });
  const password = data.password;

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
