// src/utils/normalizeNailAssistantResponse.js

const { normalizeNailDesign } = require("../domain/validators/normalizeNailDesign");

const FINGER_KEYS = [
  "left_thumb",
  "left_index",
  "left_middle",
  "left_ring",
  "left_pinky",
  "right_thumb",
  "right_index",
  "right_middle",
  "right_ring",
  "right_pinky",
];

// array[0..9] -> { left_thumb: ..., ... }
function fingersArrayToKeyedObject(fingersArr = []) {
  const out = {};
  for (let i = 0; i < FINGER_KEYS.length; i++) {
    out[FINGER_KEYS[i]] = fingersArr[i] ?? {
      base: null,
      layers: [],
      charms: [],
      gelArt3D: [],
      effects: [],
    };
  }
  return out;
}

// pulls designs from whatever the service returns
function extractDesignList(serviceResult) {
  if (Array.isArray(serviceResult?.designs) && serviceResult.designs.length) {
    return serviceResult.designs;
  }
  const list = [];
  if (serviceResult?.nailDesign) list.push(serviceResult.nailDesign);
  if (Array.isArray(serviceResult?.variants)) list.push(...serviceResult.variants);
  return list;
}

function normalizeNailAssistantResponse({ userId, requestPayload, serviceResult }) {
  const designList = extractDesignList(serviceResult);

  const createdAt =
    serviceResult?.generatedAt ??
    serviceResult?.nailDesign?.generatedAt ??
    new Date().toISOString();

  const generationBatchId =
    serviceResult?.generationBatchId ??
    serviceResult?.nailDesign?.generationBatchId ??
    serviceResult?.variants?.[0]?.generationBatchId ??
    null;

  const aiModelUsed = serviceResult?.meta?.openai?.model ?? null;

  // NOTE: requestPayload.count is your requested count; serviceResult.meta.count is what it used
  const designCount = requestPayload?.count ?? serviceResult?.meta?.count ?? designList.length;

  return {
    userId: userId ?? null,
    prompt: serviceResult?.prompt ?? requestPayload?.prompt ?? null,
    model: requestPayload?.model ?? serviceResult?.meta?.model ?? null,
    designCount,
    mirrorHands: requestPayload?.mirrorHands ?? serviceResult?.meta?.mirrorHands ?? null,
    createdAt,
    generationBatchId,
    aiModelUsed,
    meta: serviceResult?.meta ?? {},

    generatedDesigns: designList.map((raw) => {
      const normalized = normalizeNailDesign(raw) || {};

      return {
        generationId: raw?.generationId ?? null,
        generatedAt: raw?.generatedAt ?? createdAt,
        prompt: serviceResult?.prompt ?? requestPayload?.prompt ?? null,

        // design-level
        shape: normalized.shape ?? null,
        length: normalized.length ?? null,
        templateId: normalized.templateId ?? null,

        // ✅ keyed fingers
        fingers: fingersArrayToKeyedObject(normalized.fingers),

        // optional: keep if you want it (your example doesn’t include it)
        // base: normalized.base ?? null,
      };
    }),
  };
}

module.exports = { normalizeNailAssistantResponse, FINGER_KEYS };
