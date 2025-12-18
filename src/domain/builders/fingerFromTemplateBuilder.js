// src/domain/builders/fingerFromTemplateBuilder.js

/**
 * Build a single finger object from:
 * - fingerDesign: parsed JSON from template.fingerDesign
 * - baseLayer: the base color we matched from color_library
 *
 * We let the Hot Pink base override template base color while
 * keeping other fields (finish, opacity, etc.) from the template.
 */
function buildFingerFromFingerDesign(fingerDesign, baseLayer) {
  if (!fingerDesign || typeof fingerDesign !== 'object') {
    // fallback basic finger
    return {
      base: { ...baseLayer },
      layers: [],
      charms: [],
      gelArt3D: [],
      effects: [],
    };
  }

  // Template may define its own base object (no color, or some neutral color)
  const templateBase = fingerDesign.base || {};

  // Merge so that your matched color wins, but we keep template fields if needed.
  const base = {
    ...templateBase,
    ...baseLayer,
  };

  return {
    base,
    layers: Array.isArray(fingerDesign.layers)
      ? fingerDesign.layers.map((l) => ({ ...l }))
      : [],
    charms: Array.isArray(fingerDesign.charms)
      ? fingerDesign.charms.map((c) => ({ ...c }))
      : [],
    gelArt3D: Array.isArray(fingerDesign.gelArt3D)
      ? fingerDesign.gelArt3D.map((g) => ({ ...g }))
      : [],
    effects: Array.isArray(fingerDesign.effects)
      ? fingerDesign.effects.map((e) => ({ ...e }))
      : [],
  };
}

module.exports = {
  buildFingerFromFingerDesign,
};
