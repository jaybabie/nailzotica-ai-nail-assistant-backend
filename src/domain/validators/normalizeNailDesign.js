// src/domain/validators/normalizeNailDesign.js

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function deepClone(obj) {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

function normalizeBase(base) {
  const b = base && typeof base === 'object' ? base : {};
  return {
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

function normalizeFinger(finger, base) {
  const f = finger && typeof finger === 'object' ? finger : {};
  return {
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
    base,
    fingers: deepClone(fingers), // keep responses isolated
  };
}

module.exports = { normalizeNailDesign };
