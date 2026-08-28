// src/domain/resolvers/shapeLengthResolver.js

function norm(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
}

/*
 * Canonical production shapes.
 *
 * These match the values used by the Nailzotica
 * Shape/Length customizer and local nail catalog.
 */
const SHAPE_LENGTHS = Object.freeze({
  square: ['extra_short', 'short', 'medium', 'long', 'extra_long'],
  ballerina: ['short', 'medium', 'long', 'extra_long'],
  stiletto: ['short', 'medium', 'long', 'extra_long'],
  duck: ['extra_short', 'short', 'medium'],
  duck_mooncut: ['extra_short', 'short', 'medium'],
  almond: ['short'],
  oval: ['short', 'medium'],
  square_mooncut: ['short', 'medium', 'long', 'extra_long'],
  ballerina_mooncut: ['short', 'medium', 'long', 'extra_long'],
  lipstick_left: ['short', 'medium', 'long', 'extra_long'],
  lipstick_right: ['short', 'medium', 'long', 'extra_long'],
});

const CANONICAL_SHAPES = Object.freeze(Object.keys(SHAPE_LENGTHS));
const CANONICAL_LENGTHS = Object.freeze([
  'extra_short',
  'short',
  'medium',
  'long',
  'extra_long',
]);

function normalizeShape(v) {
  let s = norm(v);
  if (!s) return null;

  // User-facing/common synonym. Production value is "ballerina".
  if (s === 'coffin') s = 'ballerina';

  // The production customizer does not expose a separate round shape.
  // Treat "round" as the closest supported canonical shape.
  if (s === 'round') s = 'oval';

  return CANONICAL_SHAPES.includes(s) ? s : null;
}

function normalizeLength(v) {
  let s = norm(v);
  if (!s) return null;

  if (['xl', 'x_long', 'xlong'].includes(s)) {
    s = 'extra_long';
  }

  if (['xs', 'x_short', 'xshort'].includes(s)) {
    s = 'extra_short';
  }

  return CANONICAL_LENGTHS.includes(s) ? s : null;
}

function allowedLengthsForShape(shape) {
  const normalizedShape = normalizeShape(shape);
  if (!normalizedShape) return [];
  return [...SHAPE_LENGTHS[normalizedShape]];
}

function isValidShapeLength(shape, length) {
  const normalizedShape = normalizeShape(shape);
  const normalizedLength = normalizeLength(length);

  if (!normalizedShape || !normalizedLength) return false;

  return SHAPE_LENGTHS[normalizedShape].includes(normalizedLength);
}

function defaultLengthForShape(shape) {
  const allowed = allowedLengthsForShape(shape);

  if (!allowed.length) return 'medium';
  if (allowed.includes('medium')) return 'medium';
  if (allowed.includes('short')) return 'short';

  return allowed[0];
}

function coerceLengthForShape(shape, preferredLength = null) {
  const normalizedShape = normalizeShape(shape) || 'square';
  const normalizedLength = normalizeLength(preferredLength);

  if (
    normalizedLength &&
    isValidShapeLength(normalizedShape, normalizedLength)
  ) {
    return normalizedLength;
  }

  return defaultLengthForShape(normalizedShape);
}

function resolveShapeAndLength(parsed = {}, overrides = {}) {
  const parsedShape = normalizeShape(parsed.shape);
  const parsedLength = normalizeLength(parsed.length);

  const overrideShape = normalizeShape(
    overrides.shapeOverride ?? overrides.shape
  );
  const overrideLength = normalizeLength(
    overrides.lengthOverride ?? overrides.length
  );

  const shape = overrideShape || parsedShape || 'square';

  // Override wins when valid for the resolved shape.
  // Otherwise try the parsed length, then a safe production default.
  let length = null;

  if (overrideLength && isValidShapeLength(shape, overrideLength)) {
    length = overrideLength;
  } else if (parsedLength && isValidShapeLength(shape, parsedLength)) {
    length = parsedLength;
  } else {
    length = defaultLengthForShape(shape);
  }

  return { shape, length };
}

function shapeFromPrompt(promptLower = '') {
  const p = String(promptLower || '').toLowerCase();

  // Check specific compound shapes before their base-name substrings.
  if (
    p.includes('ballerina_mooncut') ||
    p.includes('ballerina mooncut') ||
    p.includes('coffin_mooncut') ||
    p.includes('coffin mooncut')
  ) {
    return 'ballerina_mooncut';
  }

  if (
    p.includes('square_mooncut') ||
    p.includes('square mooncut')
  ) {
    return 'square_mooncut';
  }

  if (
    p.includes('duck_mooncut') ||
    p.includes('duck mooncut')
  ) {
    return 'duck_mooncut';
  }

  if (
    p.includes('lipstick_left') ||
    p.includes('lipstick left') ||
    p.includes('left lipstick')
  ) {
    return 'lipstick_left';
  }

  if (
    p.includes('lipstick_right') ||
    p.includes('lipstick right') ||
    p.includes('right lipstick')
  ) {
    return 'lipstick_right';
  }

  if (p.includes('coffin') || p.includes('ballerina')) return 'ballerina';
  if (p.includes('stiletto')) return 'stiletto';
  if (p.includes('almond')) return 'almond';
  if (p.includes('oval') || p.includes('round')) return 'oval';
  if (p.includes('duck')) return 'duck';
  if (p.includes('square')) return 'square';

  return null;
}

function lengthFromPrompt(promptLower = '') {
  const p = String(promptLower || '').toLowerCase();

  // Check extra-short before generic short, and extra-long before long.
  if (
    p.includes('extra short') ||
    p.includes('extra-short') ||
    p.includes('extra_short') ||
    p.includes('xshort') ||
    p.includes('x-short') ||
    p.includes('xs')
  ) {
    return 'extra_short';
  }

  if (
    p.includes('extra long') ||
    p.includes('extra-long') ||
    p.includes('extra_long') ||
    p.includes('xlong') ||
    p.includes('x-long') ||
    p.includes('xl')
  ) {
    return 'extra_long';
  }

  if (p.includes('medium')) return 'medium';
  if (p.includes('short')) return 'short';
  if (p.includes('long')) return 'long';

  return null;
}

function resolveShapeLength({
  promptLower = '',
  shapeOverride = null,
  lengthOverride = null,
} = {}) {
  const overrideShape = normalizeShape(shapeOverride);
  const overrideLength = normalizeLength(lengthOverride);

  const parsedShape = shapeFromPrompt(promptLower);
  const parsedLength = lengthFromPrompt(promptLower);

  const shape = overrideShape || parsedShape || 'square';

  let length = null;

  if (overrideLength && isValidShapeLength(shape, overrideLength)) {
    length = overrideLength;
  } else if (parsedLength && isValidShapeLength(shape, parsedLength)) {
    length = parsedLength;
  } else {
    length = defaultLengthForShape(shape);
  }

  return { shape, length };
}

module.exports = {
  SHAPE_LENGTHS,
  CANONICAL_SHAPES,
  CANONICAL_LENGTHS,
  resolveShapeAndLength,
  resolveShapeLength,
  normalizeShape,
  normalizeLength,
  allowedLengthsForShape,
  isValidShapeLength,
  defaultLengthForShape,
  coerceLengthForShape,
};
