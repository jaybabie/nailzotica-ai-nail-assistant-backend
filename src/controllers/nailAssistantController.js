// src/controllers/nailAssistantController.js
const nailAssistantService = require('../services/nailAssistantService');

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

// ---------- controller ----------
exports.generateDesign = async (req, res, next) => {
  try {
    const body = req.body || {};

    // prompt required
    const prompt = toStr(body.prompt).trim();
    if (!prompt) {
      return res.status(400).json({ error: 'prompt (string) is required' });
    }

    // ✅ count first (used to infer mode)
    // accept back-compat keys
    const countRaw = body.count ?? body.n ?? body.variantsCount;
    const count = toIntOrNull(countRaw);

    // ✅ mode: respect explicit mode; else infer from count; else default to single
    const modeFromBody = normLowerOrNull(body.mode ?? body.variantsMode ?? body.type);
    const inferredMode =
      count != null && count > 1 ? 'variants' : 'single';
    const mode = modeFromBody || inferredMode;

    // ✅ IMPORTANT:
    // Only accept explicit override fields, NEVER fall back to body.shape/body.length.
    // This prevents clients that always send defaults from forcing overrides.
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
      normLowerOrNull(
        body.model ??
          body.aiModel ??
          body.styleModel ??
          body.variantModel ??
          null
      )
    );

    // preferTrending (optional, only pass if provided)
    const preferTrending = toBoolOrNull(body.preferTrending);

    // Build payload: only include optional keys when actually provided
    const payload = {
      mode,
      prompt,
      seed,
    };

    if (shapeOverride) payload.shapeOverride = shapeOverride;
    if (lengthOverride) payload.lengthOverride = lengthOverride;

    if (templateId) payload.templateId = templateId;

    if (lockTemplate !== null) payload.lockTemplate = lockTemplate;
    if (mirrorHands !== null) payload.mirrorHands = mirrorHands;

    if (count != null) payload.count = count;

    if (model) payload.model = model;

    if (preferTrending !== null) payload.preferTrending = preferTrending;

    // debug: allow turning on via request if you want
    // const debug = toBoolOrNull(body.debug);
    // if (debug !== null) payload.debug = debug;

    const result = await nailAssistantService.generateDesign(payload);
    return res.json(result);
  } catch (err) {
    console.error('❌ Error in generateDesign controller:', err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: err?.message || 'Internal server error',
        where: 'nailAssistantController.generateDesign',
        stack: err?.stack,
      });
    }
    next(err);
  }
};