// src/domain/validators/nailDesignSchema.js

const nailDesignSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['shape', 'length', 'templateId', 'base', 'fingers'],
  properties: {
    shape: { type: 'string' },
    length: { type: 'string' },
    templateId: { type: 'string' },
    base: {
      type: 'object',
      additionalProperties: false,
      required: [
        'type',
        'colorName',
        'colorFamily',
        'colorRef',
        'finish',
        'opacity',
        'hexColor',
        'gradient',
        'visible',
      ],
      properties: {
        type: { type: 'string', enum: ['solid', 'gradient'] },
        colorName: { type: 'string' },
        colorFamily: { type: 'string' },
        colorRef: { type: 'string' },
        finish: { type: 'string' },
        opacity: { type: 'number' },
        hexColor: { type: 'string' },
        gradient: {
          anyOf: [{ type: 'null' }, { type: 'object' }],
        },
        visible: { type: 'boolean' },
      },
    },
    fingers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true, // we’ll refine later
        required: ['base', 'layers', 'charms', 'effects'],
        properties: {
          // ❌ no fingerIndex here anymore
          base: { $ref: '#/properties/base' },
          layers: { type: 'array' },
          charms: { type: 'array' },
          effects: { type: 'array' },
        },
      },
    },
  },
};

module.exports = nailDesignSchema;