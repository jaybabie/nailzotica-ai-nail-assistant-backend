// src/domain/builders/baseBuilder.js

function buildBaseLayer(colorDoc, parsed) {
    const finishes = parsed.finishes || [];
    const finish = finishes[0] || 'glossy';
  
    return {
      type: 'solid', // later can be 'gradient' if parsed patterns/gradients
      colorName: colorDoc.name || colorDoc.label || 'Unknown',
      colorFamily: colorDoc.family || colorDoc.category || 'unknown',
      colorRef: colorDoc.id || colorDoc.docId || 'unknown-color-ref',
      finish,
      opacity: 1,
      hexColor: colorDoc.hex || colorDoc.hexCode || '#FFFFFF',
      gradient: null,
      visible: true,
    };
  }
  
  module.exports = {
    buildBaseLayer,
  };
  