// src/controllers/nailAssistantController.js
const nailAssistantService = require('../services/nailAssistantService');
const crypto = require('crypto');

// ---------- helpers ----------
const toStr = (v) => (v == null ? '' : String(v));

const toIntOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const toBoolOrNull = (v) => {
  if (v === true || v === false) return v;
  if (v == null || v === '') return null;
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

// randomUUID fallback
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

// Normalize the service meta.openai.model -> aiModelUsed
const getAiModelUsed = (meta) =>
  meta?.openai?.model ||
  meta?.openai?.data?.model ||
  meta?.aiModelUsed ||
  null;

// ---------- controller ----------
exports.generateDesign = async (req, res, next) => {
  try {
    const body = req.body || {};

    // ✅ prompt required
    const prompt = toStr(body.prompt).trim();
    if (!prompt) return res.status(400).json({ error: 'prompt (string) is required' });

    // ✅ count first (for inferred mode)
    const countRaw = body.count ?? body.n ?? body.variantsCount;
    const count = toIntOrNull(countRaw);

    // ✅ mode
    const modeFromBody = cleanAutoTokens(normLowerOrNull(body.mode ?? body.variantsMode ?? body.type));
    const inferredMode = count != null && count > 1 ? 'variants' : 'single';
    const mode = modeFromBody || inferredMode;

    // ✅ ONLY explicit overrides (never fall back to body.shape/body.length)
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

    // debug passthrough
    const debug = toBoolOrNull(body.debug);

    // ✅ Build payload
    const payload = { mode, prompt, seed };

    if (shapeOverride) payload.shapeOverride = shapeOverride;
    if (lengthOverride) payload.lengthOverride = lengthOverride;

    if (templateId) payload.templateId = templateId;
    if (lockTemplate !== null) payload.lockTemplate = lockTemplate;
    if (mirrorHands !== null) payload.mirrorHands = mirrorHands;

    if (count != null) payload.count = count;
    if (model) payload.model = model;
    if (preferTrending !== null) payload.preferTrending = preferTrending;
    if (debug !== null) payload.debug = debug;

    // ✅ Pull userId from auth middleware (source of truth)
    // Fallback to body.userId ONLY if auth isn't present (useful for local testing)
    const userId =
      req?.user?.uid ||
      (body.userId != null && String(body.userId).trim() ? String(body.userId).trim() : null);

    // ✅ Generate
    const rawResult = await nailAssistantService.generateDesign(payload);

    // ✅ Stamp designs
    const batchId = genId();
    const createdAt = nowIso();

    const nailDesignStamped = rawResult?.nailDesign
      ? stampDesign(rawResult.nailDesign, batchId, createdAt)
      : null;

    const variantsStamped = Array.isArray(rawResult?.variants)
      ? rawResult.variants.map((d) => stampDesign(d, batchId, createdAt))
      : [];

    const generatedDesigns = [
      ...(nailDesignStamped ? [nailDesignStamped] : []),
      ...variantsStamped,
    ];

    // ✅ Envelope response (matches your target shape)
    const meta = rawResult?.meta || null;

    const response = {
      userId,                         // ✅ added
      prompt,                         // original prompt
      model: model || meta?.model || null,
      designCount: generatedDesigns.length,
      mirrorHands: mirrorHands ?? meta?.mirrorHands ?? null,
      createdAt,                      // ✅ top-level timestamp
      generationBatchId: batchId,     // ✅ consistent batch id
      aiModelUsed: getAiModelUsed(meta),
      meta,                           // keep service meta (debug-friendly)
      generatedDesigns,               // ✅ renamed designs list
    };

    return res.json(response);
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
