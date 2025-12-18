// src/routes/nailAssistantRoutes.js

console.log('✅ LOADED nailAssistantRoutes.js from:', __filename);

const express = require('express');
const router = express.Router();

// ✅ PROVE which service file is actually being required
const servicePath = require.resolve('../services/nailAssistantService');
console.log('✅ nailAssistantService resolved path:', servicePath);

const { generateDesign } = require('../services/nailAssistantService');

// ---------- helpers ----------
const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

const normStr = (v) => String(v ?? '').trim();

const normLower = (v) => {
  const s = normStr(v);
  return s ? s.toLowerCase() : '';
};

const toBool = (v) => {
  if (v === true) return true;
  if (v === false) return false;
  const s = normLower(v);
  if (['true', '1', 'yes', 'y', 'on', 'locked', 'lock'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'off', 'unlock', 'unlocked'].includes(s)) return false;
  return false;
};

// returns null if "not provided", otherwise boolean
const toBoolOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  return toBool(v);
};

const toNumOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---------- route ----------
// POST /api/nail-assistant
router.post('/nail-assistant', async (req, res) => {
  console.log('✅ HIT POST /api/nail-assistant');

  try {
    const body = isPlainObject(req?.body) ? req.body : {};
    console.log('🧾 BODY:', body);

    // Base payload
    const payload = {
      // prompt
      prompt: body.prompt ?? body.text ?? '',

      // mode + variants
      mode: body.mode ?? body.variantsMode ?? body.type ?? undefined,
      variants: body.variants ?? undefined,
      count: body.count ?? body.n ?? body.variantsCount ?? undefined,
      seed: body.seed ?? undefined,

      // overrides
      shapeOverride: body.shapeOverride ?? body.shape ?? null,
      lengthOverride: body.lengthOverride ?? body.length ?? null,

      // ✅ model selector (iconic | couture | muse/curated)
      model: body.model ?? body.aiModel ?? body.variantModel ?? body.styleModel ?? null,

      // ✅ trending preference (lets client force muse behavior even if model isn't muse)
      preferTrending:
        body.preferTrending ?? body.trending ?? body.trendingOnly ?? body.muse ?? null,

      // Firestore doc id stays as templateId (string)
      templateId:
        body.templateId ??
        body.templateID ??
        body.template_id ??
        body.template ??
        null,

      // lock behavior
      lockTemplate: body.lockTemplate ?? body.lock ?? body.locked ?? body.lock_template ?? null,

      // misc
      mirrorHands: body.mirrorHands ?? body.mirror ?? null,

      debug: body.debug === true,
    };

    // Normalize strings
    payload.prompt = normStr(payload.prompt);
    if (payload.mode != null) payload.mode = normLower(payload.mode) || undefined;

    // Normalize model
    payload.model = normLower(payload.model) || null;

    // Coerce bools
    payload.mirrorHands = toBool(payload.mirrorHands);
    payload.lockTemplate = toBool(payload.lockTemplate);

    // preferTrending: keep null if not provided (so service can decide by model)
    payload.preferTrending = toBoolOrNull(payload.preferTrending);

    // Count: default 5, min 2 (so variants always has at least main + 1)
    if (payload.count !== undefined) {
      const n = toNumOrNull(payload.count);
      payload.count = n == null ? 5 : Math.max(2, Math.floor(n));
    } else {
      payload.count = 5;
    }

    // Seed: if not provided -> Date.now() for always-different UX
    {
      const s = toNumOrNull(payload.seed);
      payload.seed = s == null ? Date.now() : s;
    }

    // Template id normalization
    if (payload.templateId != null) payload.templateId = normStr(payload.templateId) || null;

    // If caller sends variants=true but no mode, set mode to variants
    if (!payload.mode && payload.variants === true) payload.mode = 'variants';

    console.log('🎯 FORWARDED payload:', {
      mode: payload.mode,
      promptLen: payload.prompt.length,
      model: payload.model,
      preferTrending: payload.preferTrending,
      templateId: payload.templateId,
      lockTemplate: payload.lockTemplate,
      mirrorHands: payload.mirrorHands,
      count: payload.count,
      seed: payload.seed,
      shapeOverride: payload.shapeOverride,
      lengthOverride: payload.lengthOverride,
      variants: payload.variants,
      debug: payload.debug,
    });

    const result = await generateDesign(payload);
    return res.json(result);
  } catch (e) {
    console.error('❌ /api/nail-assistant error stack:\n', e?.stack || e);
    return res.status(500).json({
      error: e?.message || 'Unknown error',
      where: 'POST /api/nail-assistant',
      stack: e?.stack || null,
    });
  }
});

module.exports = router;
