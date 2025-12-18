// src/controllers/nailAssistantController.js
const nailAssistantService = require('../services/nailAssistantService');
const crypto = require('crypto'); // built-in (no npm install)

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
  if (['0', 'false', 'no', 'n', 'off', 'unlock', 'unlocked'].includes(s))
    return false;
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

// Node versions can vary; randomUUID exists on modern Node, but provide a fallback.
const genId = () =>
  (typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`);

const nowIso = () => new Date().toISOString();

const stampDesign = (design, batchId) => {
  if (!design || typeof design !== 'object') return design;
  return {
    ...design,
    generationId: design.generationId || genId(),
    generationBatchId: design.generationBatchId || batchId,
    generatedAt: design.generatedAt || nowIso(),
  };
};

// ---------- controller ----------
exports.generateDesign = async (req, res, next) => {
  try {
    const body = req.body || {};

    // prompt required
    const prompt = toStr(body.prompt).trim();
    if (!prompt) {
      return res.status(400).json({ error: 'prompt (string) is required' });
    }

    // ✅ count first (used to infer mode) - accept back-compat keys
    const countRaw = body.count ?? body.n ?? body.variantsCount;
    const count = toIntOrNull(countRaw);

    // ✅ mode: respect explicit mode; else infer from count; else default to single
    const modeFromBody = cleanAutoTokens(
      normLowerOrNull(body.mode ?? body.variantsMode ?? body.type)
    );
    const inferredMode = count != null && count > 1 ? 'variants' : 'single';
    const mode = modeFromBody || inferredMode;

    // ✅ IMPORTANT: only accept explicit override fields; NEVER fall back to body.shape/body.length.
    const shapeOverride = cleanAutoTokens(normLowerOrNull(body.shapeOverride));
    const lengthOverride = cleanAutoTokens(normLowerOrNull(body.lengthOverride));

    // template lock + id
    const templateId = toStr(body.templateId).trim() || null;
    const lockTemplate = toBoolOrNull(body.lockTemplate);

    // mirror hands
    const mirrorHands = toBoolOrNull(body.mirrorHands);

    // seed: always-different UX if not provided
    let seed = toIntOrNull(body.seed);
    if (seed == null) seed = Date.now();

    // model selector (iconic | couture | muse | curated)
    const model = cleanAutoTokens(
      normLowerOrNull(body.model ?? body.aiModel ?? body.styleModel ?? body.variantModel)
    );

    // preferTrending (optional, only pass if provided)
    const preferTrending = toBoolOrNull(body.preferTrending);

    // optional debug passthrough
    const debug = toBoolOrNull(body.debug);

    // Build payload: only include optional keys when actually provided
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

    // Call service
    const rawResult = await nailAssistantService.generateDesign(payload);

    // ✅ Normalize + stamp response (don’t mutate service result in case it’s frozen/shared)
    const batchId = genId();
    const stamped = { ...(rawResult || {}) };

    if (stamped.nailDesign) stamped.nailDesign = stampDesign(stamped.nailDesign, batchId);

    if (Array.isArray(stamped.variants)) {
      stamped.variants = stamped.variants.map((d) => stampDesign(d, batchId));
    } else {
      stamped.variants = [];
    }

    // Convenience list for client UI
    stamped.designs = [
      ...(stamped.nailDesign ? [stamped.nailDesign] : []),
      ...stamped.variants,
    ];

    // Batch metadata (top-level)
    stamped.generationBatchId = stamped.generationBatchId || batchId;
    stamped.generatedAt = stamped.generatedAt || nowIso();

    return res.json(stamped);
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