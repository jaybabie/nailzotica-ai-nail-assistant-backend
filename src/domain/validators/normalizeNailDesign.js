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

function deepClone(obj) {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

function normalizeBase(base) {
  const b = base && typeof base === 'object' ? base : {};

  return {
    ...b,
    type: b.type ?? 'solid',
    colorName: b.colorName ?? null,
    colorFamily: b.colorFamily ?? null,
    colorRef: b.colorRef ?? null,
    finish: b.finish ?? 'glossy',
    opacity: typeof b.opacity === 'number' ? b.opacity : 1,
    hexColor: b.hexColor ?? b.hexCode ?? null,
    hexCode: b.hexCode ?? b.hexColor ?? null,
    polishCode: b.polishCode ?? null,
    uiTextureUrl: b.uiTextureUrl ?? '',
    canvasUiUrl: b.canvasUiUrl ?? '',
    builderUiImage: b.builderUiImage ?? '',
    uiImageUrl: b.uiImageUrl ?? '',
    gradient: b.gradient ?? null,
    visible: typeof b.visible === 'boolean' ? b.visible : true,
  };
}

/**
 * IMPORTANT:
 * Preserve extra per-finger fields (templateId/templateName/uiImageUrl/modelUrl/etc),
 * while normalizing required arrays + base.
 */
function normalizeFinger(finger, base) {
  const f = finger && typeof finger === 'object' ? finger : {};
  return {
    ...f, // ✅ keep extra fields
    base: normalizeBase(f.base || base),
    layers: ensureArray(f.layers),
    charms: ensureArray(f.charms),
    gelArt3D: ensureArray(f.gelArt3D),
    effects: ensureArray(f.effects),
  };
}

function normalizeNailDesign(nailDesign) {
  if (!nailDesign || typeof nailDesign !== 'object') return null;

  const shape = (nailDesign.shape ?? '').toString();
  const length = (nailDesign.length ?? '').toString();
  const templateId = (nailDesign.templateId ?? '').toString();

  const base = normalizeBase(nailDesign.base);

  let fingers = ensureArray(nailDesign.fingers).map((f) => normalizeFinger(f, base));

  // Enforce exactly 10 fingers
  if (fingers.length < 10) {
    while (fingers.length < 10) fingers.push(normalizeFinger(null, base));
  } else if (fingers.length > 10) {
    fingers = fingers.slice(0, 10);
  }

  return {
    shape,
    length,
    templateId,
    templateKey: nailDesign.templateKey ?? null, // ✅ keep if present
    base,
    fingers: deepClone(fingers),
  };
}

module.exports = {
  normalizeNailDesign,
  FINGER_KEYS,
};
