// src/controllers/nailAssistantController.js
const nailAssistantService = require('../services/nailAssistantService');
const crypto = require('crypto');

// ---------- helpers ----------
const toStr = (v) => (v == null ? '' : String(v));
const normLowerOrNull = (v) => {
  const s = toStr(v).trim().toLowerCase();
  return s ? s : null;
};
const toIntOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const toBoolOrNull = (v) => {
  if (v === true || v === false) return v;
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return null;
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

// Your canonical 10-finger order (matches your “named” requirement)
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

function fingersArrayToNamedMap(fingersArr) {
  const arr = Array.isArray(fingersArr) ? fingersArr : [];
  const out = {};
  for (let i = 0; i < FINGER_KEYS.length; i++) out[FINGER_KEYS[i]] = arr[i] ?? null;
  return out;
}

function stripMetaDuplicates(meta) {
  const m = meta && typeof meta === 'object' ? { ...meta } : {};
  // Remove the repeated top-level-ish fields you don’t want inside meta:
  delete m.mirrorHands;
  delete m.count;
  delete m.model;
  return m;
}

function stampDesign(design, batchId) {
  if (!design || typeof design !== 'object') return design;
  return {
    ...design,
    generationId: design.generationId || genId(),
    generationBatchId: design.generationBatchId || batchId,
    generatedAt: design.generatedAt || nowIso(),
    // Add named fingers while keeping original array as-is
    fingersNamed: fingersArrayToNamedMap(design.fingers),
  };
}

// ---------- controller ----------
exports.generateDesign = async (req, res, next) => {
  try {
    const body = req.body || {};
    const userId = req?.user?.uid || null;

    // 🔎 DEBUG (leave in until fixed)
    console.log('🧾 controller req.body =', body);

    const prompt = toStr(body.prompt).trim();
    if (!prompt) {
      return res.status(400).json({ error: 'prompt (string) is required' });
    }

    // read inputs (your curl uses these exact keys)
    const mode = cleanAutoTokens(normLowerOrNull(body.mode)) || 'single';
    const count = toIntOrNull(body.count);
    const mirrorHands = toBoolOrNull(body.mirrorHands);
    const model = cleanAutoTokens(normLowerOrNull(body.model));
    let seed = toIntOrNull(body.seed);
    if (seed == null) seed = Date.now();

    // Build payload for service
    const payload = { prompt, mode, seed };
    if (count != null) payload.count = count;
    if (mirrorHands !== null) payload.mirrorHands = mirrorHands;
    if (model) payload.model = model;

    // ✅ Call service (this is the critical part)
    const raw = await nailAssistantService.generateDesign(payload);

    // Raw designs list coming back (service typically returns nailDesign + variants)
    const batchId = raw?.generationBatchId || genId();

    const main = raw?.nailDesign ? stampDesign(raw.nailDesign, batchId) : null;
    const variants = Array.isArray(raw?.variants)
      ? raw.variants.map((d) => stampDesign(d, batchId))
      : [];

    const generatedDesigns = [...(main ? [main] : []), ...variants];

    // aiModelUsed: prefer service meta openai.model if present
    const aiModelUsed =
      raw?.meta?.openai?.model ||
      raw?.meta?.openai?.data?.model ||
      raw?.aiModelUsed ||
      null;

    // ✅ Final response in YOUR format
    const response = {
      userId,
      prompt,
      model: model || null,
      designCount: generatedDesigns.length,
      mirrorHands: mirrorHands ?? null,
      createdAt: nowIso(),

      generationBatchId: batchId,
      aiModelUsed,

      meta: stripMetaDuplicates(raw?.meta),

      generatedDesigns,
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
