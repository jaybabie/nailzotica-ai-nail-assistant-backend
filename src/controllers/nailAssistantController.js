// src/controllers/nailAssistantController.js
const nailAssistantService = require('../services/nailAssistantService');
const crypto = require('crypto');
const { normalizeNailAssistantResponse } = require('../utils/normalizeNailAssistantResponse');

// ---------- helpers ----------
const toStr = (v) => (v == null ? '' : String(v));

const toIntOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const toBoolOrNull = (v) => {
  if (v === true || v === false) return v;
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'locked', 'lock'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'unlock', 'unlocked'].includes(s)) return false;
  return null;
};

const normLowerOrNull = (v) => {
  const s = toStr(v).trim().toLowerCase();
  return s ? s : null;
};

const cleanAutoTokens = (s) => {
  if (!s) return null;
  if (['auto', 'any', 'default', 'detect', 'none', 'null'].includes(s)) return null;
  return s;
};

const genId = () =>
  (typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`);

const nowIso = () => new Date().toISOString();

const stampDesign = (design, batchId, createdAtIso) => {
  if (!design || typeof design !== 'object') return design;
  return {
    ...design,
    generationId: design.generationId || genId(),
    generationBatchId: design.generationBatchId || batchId,
    generatedAt: design.generatedAt || createdAtIso,
  };
};

// ---------- controller ----------
exports.generateDesign = async (req, res, next) => {
  try {
    const body = req.body || {};

    // Auth user (from requireAuth middleware)
    const userId = req?.user?.uid || null;

    // prompt required
    const prompt = toStr(body.prompt).trim();
    if (!prompt) return res.status(400).json({ error: 'prompt (string) is required' });

    // count (designCount)
    const countRaw = body.count ?? body.designCount ?? body.n ?? body.variantsCount;
    const countParsed = toIntOrNull(countRaw);
    const designCount = countParsed == null ? 1 : Math.max(1, countParsed);

    // mode (infer variants if designCount > 1)
    const modeFromBody = cleanAutoTokens(normLowerOrNull(body.mode ?? body.variantsMode ?? body.type));
    const inferredMode = designCount > 1 ? 'variants' : 'single';
    const mode = modeFromBody || inferredMode;

    // overrides (only explicit override keys)
    const shapeOverride = cleanAutoTokens(normLowerOrNull(body.shapeOverride));
    const lengthOverride = cleanAutoTokens(normLowerOrNull(body.lengthOverride));

    // template lock + id
    const templateId = toStr(body.templateId).trim() || null;
    const lockTemplate = toBoolOrNull(body.lockTemplate);

    // mirror hands
    const mirrorHands = toBoolOrNull(body.mirrorHands);

    // seed
    let seed = toIntOrNull(body.seed);
    if (seed == null) seed = Date.now();

    // model selector
    const model = cleanAutoTokens(
      normLowerOrNull(body.model ?? body.aiModel ?? body.styleModel ?? body.variantModel)
    );

    // preferTrending (optional)
    const preferTrending = toBoolOrNull(body.preferTrending);

    // optional debug
    const debug = toBoolOrNull(body.debug);

    // payload to service
    const payload = { mode, prompt, seed };

    if (shapeOverride) payload.shapeOverride = shapeOverride;
    if (lengthOverride) payload.lengthOverride = lengthOverride;
    if (templateId) payload.templateId = templateId;

    if (lockTemplate !== null) payload.lockTemplate = lockTemplate;
    if (mirrorHands !== null) payload.mirrorHands = mirrorHands;

    // IMPORTANT: service expects `count`
    payload.count = designCount;

    if (model) payload.model = model;
    if (preferTrending !== null) payload.preferTrending = preferTrending;
    if (debug !== null) payload.debug = debug;

    // Call service
    const rawResult = await nailAssistantService.generateDesign(payload);

    // Batch stamping
    const generationBatchId = genId();
    const createdAt = nowIso();

    const main = rawResult?.nailDesign ? stampDesign(rawResult.nailDesign, generationBatchId, createdAt) : null;
    const variants = Array.isArray(rawResult?.variants)
      ? rawResult.variants.map((d) => stampDesign(d, generationBatchId, createdAt))
      : [];

    // designs you actually want to return
    const generatedDesigns = [
      ...(main ? [main] : []),
      ...variants,
    ].slice(0, designCount);

    // ai model used (from service meta.openai.model if present)
    const aiModelUsed = rawResult?.meta?.openai?.model || rawResult?.meta?.openai?.data?.model || null;

    // meta: keep it, but we’ll prune mirrorHands/count/model in the normalizer
    const meta = rawResult?.meta || null;

    // Build final response with finger naming + meta cleanup
    const finalResponse = normalizeNailAssistantResponse({
      userId,
      prompt,
      model: model || null,
      designCount,
      mirrorHands: mirrorHands ?? false,
      createdAt,
      generationBatchId,
      aiModelUsed,
      meta,
      generatedDesigns,
    });

    return res.json(finalResponse);
  } catch (err) {
    console.error('❌ Error in generateDesign controller:', err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: err?.message || 'Internal server error',
        where: 'nailAssistantController.generateDesign',
        stack: err?.stack,
      });
    }
    return next(err);
  }
};