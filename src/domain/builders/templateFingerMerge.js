// src/domain/builders/templateFingerMerge.js

/**
 * Convert your template finger structure into your NailDesign finger structure.
 * 
 * Template likely contains:
 * {
 *   base: {...optional},
 *   layers: [...],
 *   charms: [...],
 *   effects: [...]
 * }
 * 
 * This function merges template data with resolved base layers.
 */

function mergeTemplateFinger(templateFingerData, baseLayer) {
  if (!templateFingerData) {
    return {
      base: { ...baseLayer },
      layers: [],
      charms: [],
      effects: [],
    };
  }

  return {
    base: templateFingerData.base ? { ...templateFingerData.base } : { ...baseLayer },
    layers: Array.isArray(templateFingerData.layers) ? templateFingerData.layers.map((l) => ({ ...l })) : [],
    charms: Array.isArray(templateFingerData.charms) ? templateFingerData.charms.map((c) => ({ ...c })) : [],
    effects: Array.isArray(templateFingerData.effects) ? templateFingerData.effects.map((e) => ({ ...e })) : [],
  };
}

module.exports = {
  mergeTemplateFinger,
};
