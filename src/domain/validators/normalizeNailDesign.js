// src/domain/validators/normalizeNailDesign.js

const FINGER_KEYS = [
  'left_thumb',
  'left_index',
  'left_middle',
  'left_ring',
  'left_pinky',
  'right_thumb',
  'right_index',
  'right_middle',
  'right_ring',
  'right_pinky',
];

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function deepClone(obj) {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

function normalizeBase(base) {
  const b = isPlainObject(base) ? base : {};
  // ✅ NON-DESTRUCTIVE: keep any extra keys (like id, etc) but enforce required ones
  return {
    ...b,
    type: b.type ?? 'solid',
    colorName: b.colorName ?? null,
    colorFamily: b.colorFamily ?? null,
    colorRef: b.colorRef ?? null,
    finish: b.finish ?? 'glossy',
    opacity: typeof b.opacity === 'number' ? b.opacity : 1,
    hexColor: b.hexColor ?? null,
    gradient: b.gradient ?? null,
    visible: typeof b.visible === 'boolean' ? b.visible : true,
  };
}

function makeEmptyFinger(base) {
  return {
    base: normalizeBase(base),
    layers: [],
    charms: [],
    gelArt3D: [],
    effects: [],
  };
}

function normalizeFinger(finger, designBase) {
  const f = isPlainObject(finger) ? finger : {};

  // ✅ keep extra per-finger keys (templateId, templateName, uiImageUrl, modelUrl, templateRef, shape/length, etc.)
  return {
    ...f,
    base: normalizeBase(f.base ?? designBase),
    layers: ensureArray(f.layers),
    charms: ensureArray(f.charms),
    gelArt3D: ensureArray(f.gelArt3D),
    effects: ensureArray(f.effects),
  };
}

/**
 * Accept fingers as:
 * - array[10]
 * - object keyed by FINGER_KEYS
 * Return BOTH:
 * - fingersArray (always length 10)
 * - fingersNamed (always 10 keys)
 */
function coerceFingers(fingersMaybe, designBase) {
  // already keyed object
  if (isPlainObject(fingersMaybe)) {
    const named = {};
    for (const k of FINGER_KEYS) {
      named[k] = normalizeFinger(fingersMaybe[k], designBase);
    }
    const arr = FINGER_KEYS.map((k) => named[k]);
    return { fingersArray: arr, fingersNamed: named };
  }

  // array form
  const arrIn = ensureArray(fingersMaybe);
  const arr = arrIn.map((f) => normalizeFinger(f, designBase));

  while (arr.length < 10) arr.push(makeEmptyFinger(designBase));
  if (arr.length > 10) arr.length = 10;

  const named = {};
  for (let i = 0; i < FINGER_KEYS.length; i++) {
    named[FINGER_KEYS[i]] = arr[i] ?? makeEmptyFinger(designBase);
  }

  return { fingersArray: arr, fingersNamed: named };
}

/**
 * Internal normalizer:
 * - preserves extra top-level keys
 * - enforces base + 10 fingers
 * - supports both array and named finger input
 */
function normalizeFinger(finger, base) {
  const f = finger && typeof finger === 'object' ? finger : {};
  return {
    // ✅ preserve per-finger template identity (new)
    templateId: f.templateId ?? null,
    templateName: f.templateName ?? null,
    shape: f.shape ?? null,
    length: f.length ?? null,
    uiImageUrl: f.uiImageUrl ?? '',
    modelUrl: f.modelUrl ?? '',
    templateRef: f.templateRef ?? null,

    // existing
    base: normalizeBase(f.base || base),
    layers: ensureArray(f.layers),
    charms: ensureArray(f.charms),
    gelArt3D: ensureArray(f.gelArt3D),
    effects: ensureArray(f.effects),
  };
}


module.exports = { normalizeNailDesign, FINGER_KEYS };
