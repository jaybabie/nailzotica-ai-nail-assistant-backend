// src/domain/validators/nailDesignValidator.js
const Ajv = require('ajv');
const nailDesignSchema = require('./nailDesignSchema');

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: true, // optional but nice during iteration
});

const validateFn = ajv.compile(nailDesignSchema);

function validateNailDesign(nailDesign) {
  const valid = validateFn(nailDesign);
  if (!valid) {
    return {
      valid: false,
      errors: validateFn.errors || [],
    };
  }
  return { valid: true, errors: [] };
}

module.exports = {
  validateNailDesign,
};
