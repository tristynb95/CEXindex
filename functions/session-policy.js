"use strict";

const {validateManagedUserUid} = require("./user-target");

function validateSessionRevocationInput(data, callerUid) {
  const uid = validateManagedUserUid(data, callerUid, {
    missing: "Choose whose sessions to end.",
    self: "Use the profile menu to sign yourself out of this device."
  });
  return {uid};
}

module.exports = {
  validateSessionRevocationInput
};
