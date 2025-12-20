// src/controllers/nailAssistantController.js
const nailAssistantService = require('../services/nailAssistantService');
const { normalizeNailAssistantResponse } = require('../utils/normalizeNailAssistantResponse');
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

function stripMetaDuplicates(meta) {
  const m = meta && typeof meta === 'object' ? { ...meta } : {};
  delete m.mirrorHands;
  delete m.count;
  delete m.model;
  delete m.designCount;
  return m;
}

const ALLOWED_COMPLEXITY = new Set(['low', 'medium', 'complex']);
function normalizeComplexity(v) {
  const s = cleanAutoTokens(normLowerOrNull(v));
  if (!s) return null;
  return ALLOWED_COMPLEXITY.has(s) ? s : null;
}

// ---------- controller ----------
exports.generateDesign = async (req, res, next) => {
  try {
    const body = req.body || {};
    const userId = req?.user?.uid || null;

    const prompt = toStr(body.prompt).trim();
    if (!prompt) return res.status(400).json({ error: 'prompt (string) is required' });

    const mode = cleanAutoTokens(normLowerOrNull(body.mode)) || 'single';
    const count = toIntOrNull(body.count);
    const mirrorHands = toBoolOrNull(body.mirrorHands);
    const model = cleanAutoTokens(normLowerOrNull(body.model));
    const complexity = normalizeComplexity(body.complexity); // ✅ accept low/medium/complex

    let seed = toIntOrNull(body.seed);
    if (seed == null) seed = Date.now();

    // payload -> service
    const payload = { prompt, mode, seed };
    if (count != null) payload.count = count;
    if (mirrorHands !== null) payload.mirrorHands = mirrorHands;
    if (model) payload.model = model;
    if (complexity) payload.complexity = complexity;

    const serviceResult = await nailAssistantService.generateDesign(payload);

    // ✅ normalize into YOUR exact schema (named 10-finger map)
    const normalized = normalizeNailAssistantResponse({
      userId,
      requestPayload: payload,
      serviceResult,
    });

    // ✅ ensure missing fields never break clients
    const response = {
      userId: normalized.userId ?? userId ?? null,
      prompt: normalized.prompt ?? prompt,
      model: normalized.model ?? model ?? null,
      complexity: complexity ?? normalized?.meta?.chosenComplexity ?? normalized?.meta?.complexity ?? null, // ✅ top-level if you want it
      designCount: normalized.designCount ?? (Array.isArray(normalized.generatedDesigns) ? normalized.generatedDesigns.length : 0),
      mirrorHands: normalized.mirrorHands ?? (mirrorHands ?? null),
      createdAt: normalized.createdAt ?? nowIso(),

      generationBatchId: normalized.generationBatchId ?? genId(),
      aiModelUsed: normalized.aiModelUsed ?? null,

      meta: stripMetaDuplicates(normalized.meta),

      generatedDesigns: Array.isArray(normalized.generatedDesigns) ? normalized.generatedDesigns : [],
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
