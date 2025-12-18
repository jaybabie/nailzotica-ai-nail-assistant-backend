// src/domain/resolvers/shapeLengthResolver.js

function resolveShapeAndLength(parsed, overrides = {}) {
    const { shape: parsedShape, length: parsedLength } = parsed || {};
    const { shape: shapeOverride, length: lengthOverride } = overrides;
  
    const shape = shapeOverride || parsedShape || 'coffin';
    const length = lengthOverride || parsedLength || 'long';
  
    return { shape, length };
  }
  
  module.exports = {
    resolveShapeAndLength,
  };
  