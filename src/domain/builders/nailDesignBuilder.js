// src/domain/builders/nailDesignBuilder.js
const { mergeTemplateIntoFinger } = require('./fingerBuilder');

/**
 * Build the final NailDesign JSON structure from:
 * - parsed prompt info
 * - resolved shape/length
 * - chosen template
 * - base layer
 */
function buildFinalNailDesignJSON({ parsed, shape, length, template, base }) {
  const templateFingers = template.fingers || template.fingersArray || [];

  const fingers = templateFingers.map((finger) => {
    const normalizedTemplateFinger = {
      // ✅ NO fingerIndex here at all
      layers: finger.layers || [],
      charms: finger.charms || [],
      effects: finger.effects || [],
    };

    return mergeTemplateIntoFinger(normalizedTemplateFinger, { base });
  });

  return {
    shape,
    length,
    templateId: template.id || template.docId || 'unknown-template-id',
    base,
    fingers,
  };
}

module.exports = {
  buildFinalNailDesignJSON,
};
