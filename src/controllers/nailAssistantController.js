// src/controllers/nailAssistantController.js
const nailAssistantService = require('../services/nailAssistantService');

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

exports.generateDesign = async (req, res, next) => {
  try {
    const body = req.body || {};

    const prompt = toStr(body.prompt).trim();
    if (!prompt) {
      return res.status(400).json({ error: 'prompt (string) is required' });
    }

    // Support both naming styles:
    // - preferred: shapeOverride / lengthOverride
    // - back-compat: shape / length
    const shapeOverride = toStr(body.shapeOverride || body.shape).trim() || null;
    const lengthOverride = toStr(body.lengthOverride || body.length).trim() || null;

    // count first so we can infer mode from it
    const count = toIntOrNull(body.count);

    // ✅ Mode: respect explicit mode if provided; otherwise infer from count
    const modeFromBody = normLowerOrNull(body.mode || body.variantsMode || body.type);
    const inferredMode = count != null && count > 1 ? 'variants' : 'single';
    const mode = modeFromBody || inferredMode;

    const templateId = toStr(body.templateId).trim() || null;

    const lockTemplate = toBoolOrNull(body.lockTemplate);
    const mirrorHands = toBoolOrNull(body.mirrorHands);

    let seed = toIntOrNull(body.seed);

    // ✅ Always-different UX:
    // If client didn’t send a valid seed, generate one.
    if (seed == null) seed = Date.now();

    // ✅ Model pass-through (iconic | couture | muse | curated)
    // Accepts multiple param names for back-compat.
    const model = normLowerOrNull(
      body.model ??
        body.aiModel ??
        body.styleModel ??
        body.variantModel ??
        null
    );

    const payload = {
      mode,
      prompt,
      shapeOverride,
      lengthOverride,
      templateId,

      // pass flags only if provided (otherwise let service decide)
      lockTemplate: lockTemplate === null ? undefined : lockTemplate,
      mirrorHands: mirrorHands === null ? undefined : mirrorHands,

      // count only if provided; service will enforce min/max
      count: count == null ? undefined : count,

      // ✅ new
      model: model === null ? undefined : model,

      seed,

      // debug: true, // (optional) flip on if you want verbose debug blocks
    };

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