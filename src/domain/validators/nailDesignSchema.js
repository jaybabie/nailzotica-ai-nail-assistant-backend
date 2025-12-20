// src/domain/validators/nailDesignSchema.js

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

const baseSchema = {
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
};

const fingerSchema = {
  type: 'object',
  // ✅ allow extra fields like templateId/templateName/uiImageUrl/modelUrl/templateRef/etc
  additionalProperties: true,
  required: ['base', 'layers', 'charms', 'gelArt3D', 'effects'],
  properties: {
    base: { anyOf: [{ type: 'null' }, baseSchema] },
    layers: { type: 'array' },
    charms: { type: 'array' },
    gelArt3D: { type: 'array' },
    effects: { type: 'array' },
  },
};

const fingersObjectSchema = {
  type: 'object',
  additionalProperties: false,
  required: FINGER_KEYS,
  properties: FINGER_KEYS.reduce((acc, key) => {
    acc[key] = fingerSchema;
    return acc;
  }, {}),
};

const nailDesignSchema = {
  type: 'object',
  additionalProperties: false,

  // ✅ This matches your normalized "generatedDesigns[]" item
  required: ['generationId', 'generatedAt', 'prompt', 'shape', 'length', 'templateId', 'base', 'fingers'],

  properties: {
    generationId: { anyOf: [{ type: 'null' }, { type: 'string' }] },
    generatedAt: { anyOf: [{ type: 'null' }, { type: 'string' }] },
    prompt: { anyOf: [{ type: 'null' }, { type: 'string' }] },

    shape: { type: 'string' },
    length: { type: 'string' },

    templateId: { type: 'string' },
    templateKey: { anyOf: [{ type: 'null' }, { type: 'string' }] },

    base: { anyOf: [{ type: 'null' }, baseSchema] },

    // ✅ NAMED fingers
    fingers: fingersObjectSchema,
  },
};

module.exports = nailDesignSchema;
