// src/domain/resolvers/shapeLengthResolver.js

function norm(v) {
  return String(v || '').trim().toLowerCase().replace(/-/g, '_');
}

function normalizeShape(v) {
  const s = norm(v);

  if (s === 'ballerina') return 'coffin';

  const allowed = ['square', 'coffin', 'almond', 'stiletto', 'oval', 'round', 'duck'];
  return allowed.includes(s) ? s : null;
}

function normalizeLength(v) {
  const s = norm(v);

  if (['xl', 'x_long', 'extra_long', 'extra long'].includes(s)) {
    return 'extra_long';
  }

  const allowed = ['short', 'medium', 'long', 'extra_long'];
  return allowed.includes(s) ? s : null;
}

function resolveShapeAndLength(parsed = {}, overrides = {}) {
  const parsedShape = normalizeShape(parsed.shape);
  const parsedLength = normalizeLength(parsed.length);

  const overrideShape = normalizeShape(overrides.shape);
  const overrideLength = normalizeLength(overrides.length);

  const shape = overrideShape || parsedShape || 'square';
  const length = overrideLength || parsedLength || 'medium';

  return { shape, length };
}

function resolveShapeLength({ promptLower = '', shapeOverride = null, lengthOverride = null } = {}) {
  const p = String(promptLower || '').toLowerCase();

  let shape = normalizeShape(shapeOverride);
  let length = normalizeLength(lengthOverride);

  if (!shape) {
    if (p.includes('coffin') || p.includes('ballerina')) shape = 'coffin';
    else if (p.includes('stiletto')) shape = 'stiletto';
    else if (p.includes('almond')) shape = 'almond';
    else if (p.includes('oval')) shape = 'oval';
    else if (p.includes('round')) shape = 'round';
    else if (p.includes('duck')) shape = 'duck';
    else if (p.includes('square')) shape = 'square';
    else shape = 'square';
  }

  if (!length) {
    if (
      p.includes('extra long') ||
      p.includes('extra-long') ||
      p.includes('xlong') ||
      p.includes('xl')
    ) {
      length = 'extra_long';
    } else if (p.includes('long')) {
      length = 'long';
    } else if (p.includes('short')) {
      length = 'short';
    } else if (p.includes('medium')) {
      length = 'medium';
    } else {
      length = 'medium';
    }
  }

  return { shape, length };
}

module.exports = {
  resolveShapeAndLength,
  resolveShapeLength,
  normalizeShape,
  normalizeLength,
};