// src/domain/builders/fingerBuilder.js

function mergeTemplateIntoFinger(templateFinger, overrides) {
  const { base } = overrides;

  return {
    // no fingerIndex here
    base,
    layers: templateFinger.layers || [],
    charms: templateFinger.charms || [],
    effects: templateFinger.effects || [],
  };
}

module.exports = {
  mergeTemplateIntoFinger,
};
