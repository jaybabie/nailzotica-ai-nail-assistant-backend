// src/utils/normalizeNailAssistantResponse.js

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
  
  function mapFingersArrayToObject(fingersArray = []) {
    const out = {};
    for (let i = 0; i < FINGER_KEYS.length; i++) {
      const key = FINGER_KEYS[i];
      out[key] = fingersArray[i] ?? {
        base: null,
        layers: [],
        charms: [],
        gelArt3D: [],
        effects: [],
      };
    }
    return out;
  }
  
  function extractDesignList(serviceResult) {
    if (Array.isArray(serviceResult?.designs) && serviceResult.designs.length) {
      return serviceResult.designs;
    }
    const list = [];
    if (serviceResult?.nailDesign) list.push(serviceResult.nailDesign);
    if (Array.isArray(serviceResult?.variants)) list.push(...serviceResult.variants);
    return list;
  }
  
  function normalizeOneDesign(d, fallback) {
    return {
      generationId: d?.generationId ?? null,
      generatedAt: d?.generatedAt ?? fallback.generatedAt ?? null,
      prompt: fallback.prompt ?? null,
  
      // design-level
      shape: d?.shape ?? fallback.shape ?? null,
      length: d?.length ?? fallback.length ?? null,
      templateId: d?.templateId ?? null,
      templateKey: d?.templateKey ?? null,
  
      // ✅ keyed fingers
      fingers: mapFingersArrayToObject(d?.fingers),
    };
  }
  
  /**
   * Build final response in your desired schema.
   */
  function normalizeNailAssistantResponse({ userId, requestPayload, serviceResult }) {
    const designs = extractDesignList(serviceResult);
  
    const createdAt =
      serviceResult?.generatedAt ??
      serviceResult?.nailDesign?.generatedAt ??
      new Date().toISOString();
  
    const generationBatchId =
      serviceResult?.generationBatchId ??
      serviceResult?.nailDesign?.generationBatchId ??
      (Array.isArray(serviceResult?.variants) ? serviceResult.variants[0]?.generationBatchId : null) ??
      null;
  
    // Your meta already contains openai.model in your response example:
    const aiModelUsed = serviceResult?.meta?.openai?.model ?? null;
  
    return {
      userId: userId ?? null,
      prompt: serviceResult?.prompt ?? requestPayload?.prompt ?? null,
      model: requestPayload?.model ?? serviceResult?.meta?.model ?? null,
      designCount: requestPayload?.count ?? serviceResult?.meta?.count ?? designs.length,
      mirrorHands:
        requestPayload?.mirrorHands ?? serviceResult?.meta?.mirrorHands ?? null,
      createdAt,
      generationBatchId,
      aiModelUsed,
  
      meta: serviceResult?.meta ?? {},
  
      generatedDesigns: designs.map((d) =>
        normalizeOneDesign(d, {
          prompt: serviceResult?.prompt ?? requestPayload?.prompt ?? null,
          generatedAt: createdAt,
          shape: serviceResult?.meta?.resolved?.shape ?? null,
          length: serviceResult?.meta?.resolved?.length ?? null,
        })
      ),
    };
  }
  
  module.exports = {
    normalizeNailAssistantResponse,
    FINGER_KEYS,
  };
  