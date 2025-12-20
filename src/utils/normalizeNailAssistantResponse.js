// src/utils/normalizeNailAssistantResponse.js

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

// minimal finger fallback (keeps required arrays present)
function makeEmptyFinger() {
  return {
    base: null,
    layers: [],
    charms: [],
    gelArt3D: [],
    effects: [],
  };
}

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Accepts:
 * - Array[10] in canonical order
 * - Object keyed by FINGER_KEYS
 * - Missing/null => fills all 10 keys with empty finger objects
 */
function coerceFingersToNamedObject(fingersMaybe) {
  // Case A: already a keyed object
  if (isPlainObject(fingersMaybe)) {
    const out = {};
    for (const k of FINGER_KEYS) {
      out[k] = isPlainObject(fingersMaybe[k]) ? fingersMaybe[k] : makeEmptyFinger();
    }
    return out;
  }

  // Case B: array in canonical order
  const arr = Array.isArray(fingersMaybe) ? fingersMaybe : [];
  const out = {};
  for (let i = 0; i < FINGER_KEYS.length; i++) {
    const key = FINGER_KEYS[i];
    const v = arr[i];
    out[key] = isPlainObject(v) ? v : makeEmptyFinger();
  }
  return out;
}

function extractDesignList(serviceResult) {
  // NEW service format
  if (Array.isArray(serviceResult?.generatedDesigns) && serviceResult.generatedDesigns.length) {
    return serviceResult.generatedDesigns;
  }

  // older: { designs: [...] }
  if (Array.isArray(serviceResult?.designs) && serviceResult.designs.length) {
    return serviceResult.designs;
  }

  // classic: { nailDesign, variants }
  const list = [];
  if (serviceResult?.nailDesign) list.push(serviceResult.nailDesign);
  if (Array.isArray(serviceResult?.variants)) list.push(...serviceResult.variants);
  return list;
}

function normalizeOneDesign(d, fallback) {
  const createdAt = fallback.generatedAt ?? new Date().toISOString();

  return {
    generationId: d?.generationId ?? null,
    generatedAt: d?.generatedAt ?? createdAt,
    prompt: fallback.prompt ?? null,

    // design-level
    shape: d?.shape ?? fallback.shape ?? null,
    length: d?.length ?? fallback.length ?? null,
    templateId: d?.templateId ?? null,
    templateKey: d?.templateKey ?? null,

    // keep design-level base (your app expects it in some places)
    base: d?.base ?? fallback.base ?? null,

    // ALWAYS keyed fingers (10 keys)
    fingers: coerceFingersToNamedObject(d?.fingers ?? d?.fingersNamed),
  };
}

/**
 * Build final response in your desired schema.
 * Works with:
 * - NEW service format: { generatedDesigns: [...] }
 * - OLD service format: { nailDesign, variants }
 */
function normalizeNailAssistantResponse({ userId, requestPayload, serviceResult }) {
  const designs = extractDesignList(serviceResult);

  const createdAt =
    serviceResult?.createdAt ??
    serviceResult?.generatedAt ??
    serviceResult?.nailDesign?.generatedAt ??
    (designs?.[0]?.generatedAt ?? null) ??
    new Date().toISOString();

  const generationBatchId =
    serviceResult?.generationBatchId ??
    serviceResult?.nailDesign?.generationBatchId ??
    (Array.isArray(serviceResult?.variants) ? serviceResult.variants[0]?.generationBatchId : null) ??
    (Array.isArray(serviceResult?.generatedDesigns) ? serviceResult.generatedDesigns[0]?.generationBatchId : null) ??
    null;

  const aiModelUsed =
    serviceResult?.aiModelUsed ??
    serviceResult?.meta?.openai?.model ??
    serviceResult?.meta?.openai?.data?.model ??
    null;

  const model =
    requestPayload?.model ??
    serviceResult?.model ??
    serviceResult?.meta?.model ??
    null;

  const mirrorHands =
    requestPayload?.mirrorHands ??
    serviceResult?.mirrorHands ??
    serviceResult?.meta?.mirrorHands ??
    null;

  // ✅ complexity should never be lost:
  // priority: requestPayload.complexity > service meta.complexity > service meta.chosenComplexity
  const complexity =
    requestPayload?.complexity ??
    serviceResult?.meta?.complexity ??
    serviceResult?.meta?.chosenComplexity ??
    null;

  const designCount =
    serviceResult?.designCount ??
    requestPayload?.count ??
    serviceResult?.meta?.count ??
    designs.length;

  const resolvedShape = serviceResult?.meta?.resolved?.shape ?? null;
  const resolvedLength = serviceResult?.meta?.resolved?.length ?? null;

  // base fallback: prefer first design base, else service nailDesign base
  const baseFallback =
    designs?.[0]?.base ??
    serviceResult?.nailDesign?.base ??
    null;

  return {
    userId: userId ?? null,
    prompt: serviceResult?.prompt ?? requestPayload?.prompt ?? null,
    model,
    designCount,
    mirrorHands,
    createdAt,
    generationBatchId,
    aiModelUsed,

    // keep meta; ensure complexity is visible even if only sent in request
    meta: {
      ...(serviceResult?.meta ?? {}),
      ...(complexity ? { complexity } : {}),
    },

    generatedDesigns: designs.map((d) =>
      normalizeOneDesign(d, {
        prompt: serviceResult?.prompt ?? requestPayload?.prompt ?? null,
        generatedAt: createdAt,
        shape: resolvedShape,
        length: resolvedLength,
        base: baseFallback,
      })
    ),
  };
}

module.exports = {
  normalizeNailAssistantResponse,
  FINGER_KEYS,
};
