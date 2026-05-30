// src/services/nailAssistantService.js
console.log('✅ RUNNING nailAssistantService.js from:', __filename);

const { runNailAssistantLLM } = require('./openaiClient');

const { normalizeNailDesign } = require('../domain/validators/normalizeNailDesign');
const { getCollection } = require('../config/firestore');
const { applyPromptOverridesToDesign } = require('./domain/matchers/designOverrideMatcher');

const {
  matchBaseColor,
  buildBaseFromColorDoc,
} = require('./domain/matchers/colorMatcher');


const SERVICE_VERSION = 'v1001_combined_variants_mirror_2025-12-14';

let __TEMPLATES_CACHE = [];

// ---------------------------
// Helpers
// ---------------------------
function resolveMode(input = {}) {
  const modeRaw = String(input.mode || '').toLowerCase();
  const nRaw = input.count ?? input.n ?? input.variantsCount ?? 1;
  const count = Math.max(1, Number(nRaw) || 1);

  const wantsVariants =
    modeRaw === 'variants' ||
    modeRaw === 'variant' ||
    input.variants === true ||
    count > 1;

  return { wantsVariants, count };
}


function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ✅ IMPORTANT: you must point this to YOUR templates array (Step 2 below)
function getTemplatePoolFor(shape, length) {
  // Replace TEMPLATES_ARRAY_NAME with whatever your file uses.
  // Example: return (TEMPLATES || []).filter(...)
  const catalog = (typeof TEMPLATES_ARRAY_NAME !== 'undefined' && Array.isArray(TEMPLATES_ARRAY_NAME))
    ? TEMPLATES_ARRAY_NAME
    : [];

  return catalog
    .filter((t) => t && t.shape === shape && t.length === length)
    .map((t) => t.id || t.templateId)
    .filter(Boolean);
}

function safeJsonParse(maybeJsonString) {
  if (maybeJsonString == null) return null;
  if (typeof maybeJsonString === 'object') return maybeJsonString;
  if (typeof maybeJsonString !== 'string') return null;
  try {
    return JSON.parse(maybeJsonString);
  } catch {
    return null;
  }
}

function deepClone(obj) {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Mirror right hand (5-9) from left hand (0-4)
// LEFT:  0 pinky, 1 ring, 2 middle, 3 index, 4 thumb
// RIGHT: 5 thumb, 6 index, 7 middle, 8 ring, 9 pinky
function applyMirrorHands(fingers) {
  if (!Array.isArray(fingers) || fingers.length !== 10) return fingers;

  // Pairings for "same finger both hands"
  // left pinky (0) <-> right pinky (9)
  // left ring  (1) <-> right ring  (8)
  // left middle(2) <-> right middle(7)
  // left index (3) <-> right index (6)
  // left thumb (4) <-> right thumb (5)
  const PAIRS = [
    [0, 9],
    [1, 8],
    [2, 7],
    [3, 6],
    [4, 5],
  ];

  // Safe clone (your JSON clone is fine for this schema)
  const clone = (obj) => (obj ? JSON.parse(JSON.stringify(obj)) : obj);

  const scoreFinger = (f) => {
    if (!f) return 0;
    return (
      (Array.isArray(f.layers) ? f.layers.length : 0) +
      (Array.isArray(f.charms) ? f.charms.length : 0) +
      (Array.isArray(f.effects) ? f.effects.length : 0) +
      (Array.isArray(f.gelArt3D) ? f.gelArt3D.length : 0)
    );
  };

  const cloneFingerWithUniqueInstanceIds = (finger, suffix) => {
    const f = clone(finger) || { layers: [], charms: [], gelArt3D: [], effects: [] };

    if (Array.isArray(f.charms)) {
      f.charms = f.charms.map((ch, i) => {
        const c = clone(ch) || {};
        if (typeof c.instanceId === 'string' && c.instanceId.trim()) {
          c.instanceId = `${c.instanceId}_${suffix}_${i}`;
        }
        return c;
      });
    }
    return f;
  };

  const out = fingers.map((f) => clone(f));

  for (const [L, R] of PAIRS) {
    const left = out[L];
    const right = out[R];

    const leftScore = scoreFinger(left);
    const rightScore = scoreFinger(right);

    // Choose the "more detailed" side as the source.
    // If tie, prefer RIGHT as the source (so your default "thumb" parsing stays consistent).
    const useRight = rightScore >= leftScore;
    const source = useRight ? right : left;
    const srcIdx = useRight ? R : L;

    out[L] = cloneFingerWithUniqueInstanceIds(source, `Lfrom${srcIdx}`);
    out[R] = cloneFingerWithUniqueInstanceIds(source, `Rfrom${srcIdx}`);
  }

  return out;
}

function buildPromptTags(prompt) {
  const text = String(prompt || '').toLowerCase().trim();
  if (!text) return [];

  // phrase-first
  const phrases = [
    'french tip',
    'chrome',
    'cat eye',
    'glitter',
    'butterfly',
    'heart',
    'marble',
    'swirl',
    'ombre',
    'gold',
    'silver',
    'pink',
    'nude',
    'white',
    'black',
    'lilac',
    'purple',
  ];

  const tags = new Set();

  // capture phrases
  for (const p of phrases) {
    if (text.includes(p)) tags.add(p);
  }

  // token fallback
  const tokens = text
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // simple synonyms
  const synonym = {
    butterflies: 'butterfly',
    bfly: 'butterfly',
    hearts: 'heart',
    ombré: 'ombre',
  };

  for (const tok of tokens) {
    tags.add(synonym[tok] || tok);
  }

  // remove junky tokens
  const stop = new Set(['nails', 'nail', 'set', 'with', 'and', 'or', 'a', 'the']);
  return Array.from(tags).filter((t) => !stop.has(t));
}

// ----------------------------
// Template chooser (safe wrapper)
// ----------------------------
function chooseTemplateSafe({ templates, templateId, shape, length, promptLower }) {
  // If you have a stricter chooser already, prefer it.
  if (typeof chooseTemplateStrict === 'function') {
    return chooseTemplateStrict({ templates, templateId, shape, length, promptLower });
  }

  const norm = (v) => String(v || '').trim().toLowerCase();
  const s = norm(shape);
  const l = norm(length);

  const list = Array.isArray(templates) ? templates : [];

  // Filter templates to correct shape/length
  const matching = list.filter((t) => norm(t?.shape) === s && norm(t?.length) === l);
  if (matching.length === 0) return null;

  // If a templateId was requested, try to match it (id OR templateId)
  if (templateId) {
    const wanted = String(templateId).trim();
    const found = matching.find((t) => String(t?.id || t?.templateId || '').trim() === wanted);
    if (found) return found;
  }

  // Default: first match (stable)
  return matching[0];
}


function resolveShapeLength({ promptLower, shapeOverride, lengthOverride }) {
  let shape = (shapeOverride || '').toString().trim().toLowerCase();
  let length = (lengthOverride || '').toString().trim().toLowerCase();

  // ---------------------------
  // SHAPE: prompt match → else default "square"
  // ---------------------------
  if (!shape) {
    if (promptLower.includes('coffin') || promptLower.includes('ballerina')) shape = 'coffin';
    else if (promptLower.includes('square')) shape = 'square';
    else if (promptLower.includes('stiletto')) shape = 'stiletto';
    else if (promptLower.includes('almond')) shape = 'almond';
    else if (promptLower.includes('duck')) shape = 'duck';
    else shape = 'square'; // ✅ NEW DEFAULT
  }

  // ---------------------------
  // LENGTH: prompt match → else default "medium"
  // ---------------------------
  if (!length) {
    if (promptLower.includes('extra long') || promptLower.includes('xlong') || promptLower.includes('xl')) {
      length = 'extra_long';
    } else if (promptLower.includes('long')) {
      length = 'long';
    } else if (promptLower.includes('short')) {
      length = 'short';
    } else {
      length = 'medium'; // ✅ DEFAULT (same as before, but now explicitly required)
    }
  }

  return { shape, length };
}


// lightweight concept groupings (extend anytime)
const CONCEPT_GROUPS = {
  zebra: ['zebra', 'animal print', 'print'],
  cheetah: ['cheetah', 'leopard', 'animal print', 'print'],
  butterfly: ['butterfly', 'kawaii', 'insect'],
  french: ['french', 'french tip', 'micro french', 'tip'],
  silver: ['silver', 'chrome', 'metallic'],
  gold: ['gold', 'metallic'],
};

function conceptScore(tokens, templateTagsLower) {
  // exact wins
  let score = 0;

  // if user asked zebra:
  if (tokens.has('zebra')) {
    if (templateTagsLower.has('zebra')) score += 10;          // exact
    else if (templateTagsLower.has('animal print')) score += 4; // related
    else if (templateTagsLower.has('cheetah') || templateTagsLower.has('leopard')) score += 2;
  }

  // butterfly intent
  if (tokens.has('butterflies') || tokens.has('butterfly')) {
    if (templateTagsLower.has('butterfly')) score += 6;
  }

  // french intent
  if (tokens.has('french')) {
    if (templateTagsLower.has('french') || templateTagsLower.has('french tip')) score += 5;
  }

  // metal preference (affects charm swaps too, but helps ranking)
  if (tokens.has('silver')) {
    if (templateTagsLower.has('silver')) score += 3;
    if (templateTagsLower.has('gold')) score -= 1; // slight penalty (still allowed)
  }

  return score;
}

function scoreTemplate({ template, promptTags }) {
  const tTags = new Set((template.tags || []).map((x) => String(x).toLowerCase()));
  const pTags = new Set(promptTags.map((x) => String(x).toLowerCase()));

  let overlap = 0;
  for (const tag of pTags) if (tTags.has(tag)) overlap += 1;

  // small bonus if category matches a prompt tag
  const cat = String(template.category || '').toLowerCase();
  if (cat && pTags.has(cat)) overlap += 1.5;

  // optional: complexity preference (example: slightly prefer low/med)
  const complexity = String(template.complexity || '').toLowerCase();
  if (complexity === 'low') overlap += 0.25;
  if (complexity === 'med') overlap += 0.10;

  return overlap;
}


function scoreTemplateByPrompt({ template, promptLower }) {
  let score = 0;

  const tags = Array.isArray(template?.tags) ? template.tags : [];
  const templateTagsLower = new Set(tags.map((t) => (t || '').toString().toLowerCase()));

  // 1) direct tag match
  for (const t of templateTagsLower) {
    if (t && promptLower.includes(t)) score += 3;
  }

  // 2) name/label/category match
  const name = (template?.name || '').toString().toLowerCase();
  const label = (template?.label || '').toString().toLowerCase();
  const category = (template?.category || '').toString().toLowerCase();

  if (name && promptLower.includes(name)) score += 2;
  if (label && promptLower.includes(label)) score += 2;
  if (category && promptLower.includes(category)) score += 1;

  // 3) concept scoring (zebra vs cheetah etc)
  const tokens = tokenizePrompt(promptLower);
  score += conceptScore(tokens, templateTagsLower);

  return score;
}

// ----------------------------
// Safe template loader (used by variants)
// ----------------------------
function getAllTemplatesArraySafe() {
  // 1) Prefer the same catalog function you just added
  try {
    if (typeof getTemplatesCatalog === 'function') {
      const t = getTemplatesCatalog();
      if (Array.isArray(t)) return t;
      if (t && typeof t === 'object') return Object.values(t);
    }
  } catch (e) {
    // ignore
  }

  // 2) Fallback: try the mock "collections" loader if it exists
  try {
    if (typeof getCollection === 'function') {
      const t = getCollection('finger_templates');
      if (Array.isArray(t)) return t;
      if (t && typeof t === 'object') return Object.values(t);
    }
  } catch (e) {
    // ignore
  }

  return [];
}
// ----------------------------
// Template candidate scoring (used by variants)
// ----------------------------
function normalizeShape(s) {
  return String(s || '').trim().toLowerCase();
}

function normalizeLengthWord(s) {
  const v = String(s || '').trim().toLowerCase();
  if (!v) return '';
  if (v.includes('extra') && v.includes('short')) return 'extra short';
  if (v === 'xs') return 'extra short';
  if (v === 'sh' || v === 'short') return 'short';
  if (v === 'md' || v === 'medium') return 'medium';
  if (v === 'lg' || v === 'long') return 'long';
  return v;
}

function lengthWordToCode(word) {
  const w = normalizeLengthWord(word);
  if (w === 'extra short') return 'xs';
  if (w === 'short') return 'sh';
  if (w === 'medium') return 'md';
  if (w === 'long') return 'lg';
  return '';
}

function inferShapeFromTemplateId(id) {
  const s = String(id || '').toLowerCase();
  const shapes = ['coffin', 'square', 'almond', 'stiletto', 'oval', 'round', 'ballerina'];
  for (const sh of shapes) {
    if (s.includes(`_${sh}_`) || s.endsWith(`_${sh}`) || s.includes(`${sh}_`)) return sh;
  }
  return '';
}

function inferLengthCodeFromTemplateId(id) {
  const s = String(id || '').toLowerCase();
  // common endings: _xs _sh _md _lg
  if (s.includes('_xs')) return 'xs';
  if (s.includes('_sh')) return 'sh';
  if (s.includes('_md')) return 'md';
  if (s.includes('_lg')) return 'lg';
  return '';
}

function templateMatchesShapeLength(t, shapeWord, lengthWord) {
  const wantShape = normalizeShape(shapeWord);
  const wantLenWord = normalizeLengthWord(lengthWord);
  const wantLenCode = lengthWordToCode(wantLenWord);

  const id = String(t?.id || t?.templateId || '').trim();
  if (!id) return false;

  // Try explicit fields first (if your template docs have them)
  const tShape =
    normalizeShape(t?.shape || t?.nailShape || t?.meta?.shape || '');
  const tLenWord =
    normalizeLengthWord(t?.length || t?.nailLength || t?.meta?.length || '');

  // Fallback: infer from templateId string
  const inferredShape = inferShapeFromTemplateId(id);
  const inferredLenCode = inferLengthCodeFromTemplateId(id);

  const shapeOk = (tShape && tShape === wantShape) || (!tShape && inferredShape === wantShape);

  const lenOk =
    (tLenWord && tLenWord === wantLenWord) ||
    (!tLenWord && inferredLenCode && inferredLenCode === wantLenCode) ||
    // If template stores code-like length in a field:
    (String(t?.length || '').toLowerCase() === wantLenCode);

  return shapeOk && lenOk;
}

function tokenizePrompt(promptLower) {
  const raw = String(promptLower || '').toLowerCase();
  const parts = raw.split(/[^a-z0-9]+/g).map(s => s.trim()).filter(Boolean);

  // tiny stoplist to avoid noisy tokens
  const stop = new Set([
    'nails','nail','with','and','the','a','an','of','to','for','on','only',
    'left','right','hand','both','mirror','please','make','set'
  ]);

  return parts.filter(p => p.length >= 3 && !stop.has(p));
}

function scoreTemplateForPrompt(t, promptLower, tokens) {
  const id = String(t?.id || t?.templateId || '').toLowerCase();
  const name = String(t?.name || '').toLowerCase();
  const tags = Array.isArray(t?.tags) ? t.tags.map(x => String(x).toLowerCase()) : [];

  let score = 0;

  // reward direct phrase matches
  if (promptLower.includes('butterfly') && (id.includes('butterfly') || tags.includes('butterfly'))) score += 3;
  if (promptLower.includes('glitter') && (id.includes('glitter') || tags.includes('glitter'))) score += 2;
  if (promptLower.includes('ombre') && (id.includes('ombre') || tags.includes('ombre'))) score += 2;
  if (promptLower.includes('marble') && (id.includes('marble') || tags.includes('marble'))) score += 2;
  if (promptLower.includes('french') && (id.includes('french') || tags.includes('french'))) score += 2;

  // token overlap scoring
  for (const tok of tokens) {
    if (id.includes(tok)) score += 1;
    if (name.includes(tok)) score += 1;
    if (tags.includes(tok)) score += 1;
  }

  return score;
}

function getTopTemplateCandidates(promptOrObj, shapeOverride, lengthOverride, llmDataArg) {
  // ✅ Support BOTH call styles:
  // 1) getTopTemplateCandidates(prompt, shapeOverride, lengthOverride, llmDataOrOpts)
  // 2) getTopTemplateCandidates({ prompt, shapeOverride, lengthOverride, llmData, model, preferTrending })

  let prompt = promptOrObj;
  let llmData = llmDataArg;
  let model = null;
  let preferTrending = false;

  const isPlainObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  // If 4th arg is actually an options object, support it
  if (isPlainObj(llmDataArg)) {
    if ('llmData' in llmDataArg) llmData = llmDataArg.llmData;
    if ('openai' in llmDataArg && llmData == null) llmData = llmDataArg.openai;
    if ('model' in llmDataArg) model = llmDataArg.model;
    if ('preferTrending' in llmDataArg) preferTrending = llmDataArg.preferTrending === true;
  }

  // Object-call style
  if (isPlainObj(promptOrObj)) {
    prompt = promptOrObj.prompt ?? promptOrObj.text ?? '';
    shapeOverride = promptOrObj.shapeOverride ?? promptOrObj.shape ?? shapeOverride;
    lengthOverride = promptOrObj.lengthOverride ?? promptOrObj.length ?? lengthOverride;

    llmData = promptOrObj.llmData ?? promptOrObj.openai ?? llmData;

    model = promptOrObj.model ?? promptOrObj.aiModel ?? model;
    preferTrending = (promptOrObj.preferTrending === true) || preferTrending;
  }

  const safePrompt = String(prompt || '').toLowerCase().trim();

  // Resolve shape/length
  const resolved =
    (typeof resolveShapeLength === 'function')
      ? resolveShapeLength({ promptLower: safePrompt, shapeOverride, lengthOverride })
      : { shape: shapeOverride, length: lengthOverride };

  const needShape = String(resolved?.shape || '').toLowerCase();
  const needLength = String(resolved?.length || '').toLowerCase();

  const templates = getTemplatesCatalog() || [];

  // ---- Prompt tags (rules + synonyms + LLM hints) ----
  const buildPromptTags = (text, llm) => {
    const t = String(text || '').toLowerCase();

    const synonym = {
      butterflies: 'butterfly',
      bfly: 'butterfly',
      ombré: 'ombre',
      chromed: 'chrome',
      glittery: 'glitter',
      marbled: 'marble',
      french: 'french tip',
      tip: 'french tip',
      glossy: 'glossy',
      matte: 'matte',
    };

    const tokens = t
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const tags = new Set();

    if (t.includes('french tip')) tags.add('french tip');
    if (t.includes('cat eye')) tags.add('cat eye');

    for (const tok of tokens) {
      const normTok = (synonym[tok] || tok).trim();
      if (normTok.length >= 3) tags.add(normTok);
    }

    const pushArr = (arr) => {
      (Array.isArray(arr) ? arr : []).forEach((x) => {
        const s = String(x || '').toLowerCase().trim();
        if (!s) return;
        const normTok = (synonym[s] || s).trim();
        if (normTok.length >= 3) tags.add(normTok);
      });
    };

    const llmObj = llm && typeof llm === 'object' ? llm : null;
    if (llmObj) {
      pushArr(llmObj.themeKeywords);
      pushArr(llmObj.colorHints);
      pushArr(llmObj.motifs);
      pushArr(llmObj.finishes);

      if (llmObj.vibe) {
        String(llmObj.vibe)
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length >= 3)
          .forEach((w) => tags.add(synonym[w] || w));
      }
    }

    const stop = new Set(['nails', 'nail', 'set', 'with', 'and', 'the', 'for']);
    return Array.from(tags).filter((x) => !stop.has(x));
  };

  const promptTags = buildPromptTags(safePrompt, llmData);

  const normArr = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((x) => String(x || '').toLowerCase().trim())
      .filter(Boolean);

  // ✅ model flags
  const modelKey = String(model || '').trim().toLowerCase();
  const useTrending = preferTrending === true || modelKey === 'muse' || modelKey === 'curated';

  // Trend weights (ONLY affects score when enabled)
  const TREND_WEIGHT =
    useTrending ? 0.20 :
    modelKey === 'iconic' ? 0.05 :
    0.00;

  const clamp100 = (n) => Math.max(0, Math.min(100, n));

  // ✅ Length preference (used ONLY when we have to relax length)
  const lenRank = (l) => {
    const x = String(l || '').toLowerCase().trim();
    // You can reorder these if you want different preference.
    if (x === 'short') return 1;
    if (x === 'medium') return 2;
    if (x === 'long') return 3;
    if (x === 'xl' || x === 'xlong' || x === 'extra long') return 4;
    return 99;
  };

  // ---- 1) Filter STRICT first (shape + length) ----
  const strictPool = templates.filter((t) => {
    const tShape = String(t?.shape || t?.nailShape || '').toLowerCase();
    const tLength = String(t?.length || t?.nailLength || '').toLowerCase();

    if (tShape && needShape && tShape !== needShape) return false;
    if (tLength && needLength && tLength !== needLength) return false;
    return true;
  });

  // ---- 2) If strictPool is empty, RELAX length (shape only) ----
  let pool = strictPool;
  let lengthRelaxed = false;

  if (pool.length === 0 && needShape) {
    const shapeOnly = templates.filter((t) => {
      const tShape = String(t?.shape || t?.nailShape || '').toLowerCase();
      return !needShape || !tShape || tShape === needShape;
    });

    if (shapeOnly.length > 0) {
      pool = shapeOnly;
      lengthRelaxed = true;
    }
  }

  // ---- 3) Score templates in the pool (same scoring as before) ----
  const scored = pool
    .map((t) => {
      const id = String(t?.templateId || t?.id || '').trim();
      if (!id) return null;

      const tTags = new Set(normArr(t?.tags));
      const category = String(t?.category || '').toLowerCase().trim();
      const name = String(t?.name || '').toLowerCase();
      const label = String(t?.label || '').toLowerCase();

      let score = 0;

      for (const tag of promptTags) {
        if (tTags.has(tag)) score += 4;
      }

      if (category && promptTags.includes(category)) score += 2;

      const hay = `${id} ${name} ${label} ${Array.from(tTags).join(' ')}`.toLowerCase();
      const words = safePrompt.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
      for (const w of words) {
        if (hay.includes(w)) score += 0.5;
      }

      const rawTrend = Number(t?.trendingScore);
      const trendingScore = Number.isFinite(rawTrend) ? clamp100(rawTrend) : 0;
      const boostedScore = score + trendingScore * TREND_WEIGHT;

      // ✅ When length is relaxed, prefer closest length to needLength
      const tLen = String(t?.length || t?.nailLength || '').toLowerCase().trim();
      const lengthPenalty =
        lengthRelaxed && needLength
          ? Math.abs(lenRank(tLen) - lenRank(needLength)) * 0.25
          : 0;

      return {
        id,
        score: boostedScore - lengthPenalty,
        complexity: String(t?.complexity || 'unknown'),
        baseScore: score,
        trendingScore,
        trendWeight: TREND_WEIGHT,
        lengthRelaxed,
        templateLength: tLen || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ds = (b.score || 0) - (a.score || 0);
      if (ds !== 0) return ds;
      return String(a.id).localeCompare(String(b.id));
    });

  return scored.slice(0, 20);
}

function getTemplatesCatalog(rawInput) {
  // ---------- helpers ----------
  const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

  const normalizeToArray = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (isPlainObject(raw)) return Object.values(raw);
    return [];
  };

  const normalizeTags = (x) => {
    if (!x) return [];
    if (Array.isArray(x)) {
      return x.map((s) => String(s || '').trim()).filter(Boolean);
    }
    if (typeof x === 'string') {
      return x
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const parseMaybeJson = (x) => {
    try {
      if (!x) return null;
      if (isPlainObject(x)) return x;
      if (typeof x === 'string') return JSON.parse(x);
      return null;
    } catch (_) {
      return null;
    }
  };

  const normLower = (v) => String(v ?? '').trim().toLowerCase();

  // ---------- 1) resolve source (cache-first) ----------
  const cached =
    (typeof __TEMPLATES_CACHE !== 'undefined' && Array.isArray(__TEMPLATES_CACHE) && __TEMPLATES_CACHE.length)
      ? __TEMPLATES_CACHE
      : null;

  let source =
    rawInput ??
    cached ??
    globalThis?.FINGER_TEMPLATES ??
    null;

  if (!source && typeof getCollection === 'function') {
    try {
      source = getCollection('finger_templates') || null;
    } catch (_) {}
    if (!source) {
      try {
        source = getCollection('templates') || null;
      } catch (_) {}
    }
  }

  const list = normalizeToArray(source);

  // ---------- 2) normalize each template ----------
  const normalizeOne = (doc) => {
    if (!isPlainObject(doc)) return null;

    const t = { ...doc };
    const fd = parseMaybeJson(t.fingerDesign);

    // ✅ Firestore doc id (this MUST be what we use for templateId)
    // Try common doc id fields first; if missing, fall back to templateId/templateID.
    const docId = String(
      t.id ??
      t.docId ??
      t._id ??
      t.documentId ??
      t.templateId ??
      t.templateID ??
      ''
    ).trim();

    if (!docId) return null;

    // ✅ legacy key/slug (keep separate; never use as templateId)
    const templateKey = String(
      t.templateKey ??
      t.slug ??
      t.templateSlug ??
      fd?.templateKey ??
      fd?.templateId ?? // sometimes older fingerDesign stored a key here
      ''
    ).trim();

    // Canonical fields
    t.templateId = docId; // ✅ Firestore id
    t.id = docId;         // keep compatibility
    t.templateKey = templateKey || null;

    // tags
    let tags = normalizeTags(t.tags);
    if (!tags.length && fd?.tags) tags = normalizeTags(fd.tags);
    t.tags = tags;

    // name/label
    if (!t.name && (fd?.templateName || fd?.name)) t.name = fd.templateName || fd.name;
    if (!t.label && fd?.label) t.label = fd.label;

    // shape/length
    const shape =
      t.shape ?? t.nailShape ?? fd?.shape ?? fd?.nailShape ?? null;
    const length =
      t.length ?? t.nailLength ?? fd?.length ?? fd?.nailLength ?? null;

    t.shape = shape != null ? normLower(shape) : t.shape;
    t.length = length != null ? normLower(length) : t.length;

    return t;
  };

  const templates = list.map(normalizeOne).filter(Boolean);

  // ---------- 3) debug snapshot (safe + useful) ----------
  console.log('📦 getTemplatesCatalog normalized:', {
    len: templates.length,
    sample: templates.slice(0, 5).map((t) => ({
      templateId: t.templateId,    // ✅ Firestore doc id
      templateKey: t.templateKey,  // legacy key/slug (optional)
      name: t.name || null,
      shape: t.shape || null,
      length: t.length || null,
      tagsLen: Array.isArray(t.tags) ? t.tags.length : 0,
    })),
  });

  return templates;
}

const FINGER_MAP = {
  // left 0-4: pinky->thumb
  left: { pinky: 0, ring: 1, middle: 2, index: 3, thumb: 4 },
  // right 5-9: thumb->pinky
  right: { thumb: 5, index: 6, middle: 7, ring: 8, pinky: 9 },
};

function resolveFingerIndex({ hand, finger }) {
  const h = (hand || '').toLowerCase();
  const f = (finger || '').toLowerCase();
  if (h === 'left' && FINGER_MAP.left[f] !== undefined) return FINGER_MAP.left[f];
  if (h === 'right' && FINGER_MAP.right[f] !== undefined) return FINGER_MAP.right[f];
  return null;
}

function extractFingerDirectives(prompt) {
  const text = (prompt || '').toLowerCase();
  const parts = text.split(',').map(s => s.trim()).filter(Boolean);

  const directives = []; // { hand, finger, text }
  for (const p of parts) {
    // look for optional "left" / "right"
    const hand = p.includes('left') ? 'left' : (p.includes('right') ? 'right' : null);

    // find finger keyword
    const finger =
      p.includes('thumb') ? 'thumb' :
      p.includes('index') ? 'index' :
      p.includes('middle') ? 'middle' :
      p.includes('ring') ? 'ring' :
      p.includes('pinky') ? 'pinky' :
      null;

    if (!finger) continue;

    directives.push({ hand, finger, text: p });
  }

  return directives;
}

// mirror pair mapping for your corrected order
function getMirrorPairIndex(idx) {
  const pairs = { 0: 9, 1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1, 9: 0 };
  return pairs[idx] !== undefined ? pairs[idx] : null;
}

// Build a map: { [fingerIndex]: "directive text" }
function buildOverridesByIndex({ prompt, mirrorHands }) {
  const directives = extractFingerDirectives(prompt);
  const overridesByIndex = {};

  for (const d of directives) {
    if (d.hand) {
      const idx = resolveFingerIndex(d);
      if (idx !== null) overridesByIndex[idx] = d.text;
      continue;
    }

    // no left/right specified
    // default rule:
    // - if mirrorHands true -> apply to both hands (mirror pair)
    // - else -> default to right hand
    const rightIdx = resolveFingerIndex({ hand: 'right', finger: d.finger });
    if (rightIdx !== null) overridesByIndex[rightIdx] = d.text;

    if (mirrorHands === true) {
      const leftIdx = resolveFingerIndex({ hand: 'left', finger: d.finger });
      if (leftIdx !== null) overridesByIndex[leftIdx] = d.text;
    }
  }

  return overridesByIndex;
}
/**
 * Nailzotica finger order:
 * 0-4 = left hand (pinky → thumb)
 * 5-9 = right hand (thumb → pinky)
 */
function resolveAccentIndexes({ promptLower, complexity = 'low' }) {
  const accents = new Set();

  const mentionsAll =
    promptLower.includes('all fingers') ||
    promptLower.includes('every finger') ||
    promptLower.includes('all nails') ||
    promptLower.includes('every nail');

  const mentionsThumb = promptLower.includes('thumb');
  const mentionsRing =
    promptLower.includes('ring finger') ||
    promptLower.includes('ring fingers') ||
    promptLower.includes('ringfinger');

  const mentionsIndex =
    promptLower.includes('index finger') ||
    promptLower.includes('index fingers') ||
    promptLower.includes('pointer');

  const mentionsMiddle =
    promptLower.includes('middle finger') ||
    promptLower.includes('middle fingers');

  const mentionsPinky =
    promptLower.includes('pinky') ||
    promptLower.includes('pinkie') ||
    promptLower.includes('pinky finger') ||
    promptLower.includes('pinkie finger');

  // 1) Explicit user instructions ALWAYS win
  if (mentionsAll) {
    return Array.from({ length: 10 }, (_, i) => i);
  }

  // LEFT:  0 pinky, 1 ring, 2 middle, 3 index, 4 thumb
  // RIGHT: 5 thumb, 6 index, 7 middle, 8 ring, 9 pinky
  if (mentionsThumb)  { accents.add(4); accents.add(5); }
  if (mentionsIndex)  { accents.add(3); accents.add(6); }
  if (mentionsMiddle) { accents.add(2); accents.add(7); }
  if (mentionsRing)   { accents.add(1); accents.add(8); }
  if (mentionsPinky)  { accents.add(0); accents.add(9); }

  if (accents.size > 0) {
    return Array.from(accents).sort((a, b) => a - b);
  }

  // 2) Smart defaults if nothing specified
  if (complexity === 'medium' || complexity === 'high') {
    // thumbs + ring (in your index system)
    return [4, 1, 5, 8];
  }

  // 3) Low complexity default: ring only
  return [1, 8];
}

// ----------------------------
// Finger builders (safe defaults)
// ----------------------------

// Base-only finger: just the base, no layers/charms/etc.
function buildBaseOnlyFinger(base) {
  return {
    base: base || null,
    layers: [],
    charms: [],
    gelArt3D: [],
    effects: [],
  };
}

// If template fingerDesign exists, this turns it into one "accent" finger.
// Safe: accepts either object or stringified JSON.
function buildFingerFromFingerDesign(fingerDesign, base) {
  let fd = fingerDesign;

  // If it's a JSON string, try to parse it
  if (typeof fd === 'string') {
    try {
      fd = JSON.parse(fd);
    } catch (e) {
      fd = null;
    }
  }

  // If nothing usable, fall back to base-only
  if (!fd || typeof fd !== 'object') return buildBaseOnlyFinger(base);

  // Common shapes we might see:
  // fd.layers, fd.charms, fd.effects, fd.gelArt3D
  return {
    base: base || fd.base || null,
    layers: Array.isArray(fd.layers) ? fd.layers : [],
    charms: Array.isArray(fd.charms) ? fd.charms : [],
    gelArt3D: Array.isArray(fd.gelArt3D) ? fd.gelArt3D : [],
    effects: Array.isArray(fd.effects) ? fd.effects : [],
  };
}

// ---------------------------
// Core generator (one design)
// ---------------------------
async function generateOneDesign({
  prompt,
  shapeOverride,
  lengthOverride,
  templateId,     // Firestore doc id coming from variants (base template for this design)
  mirrorHands,

  // optional inputs
  model,
  seed,
  debug,
  preferTrending,

  // ✅ NEW
  complexity,
}) {
  // ----------------------------
  // Helpers (local + safe)
  // ----------------------------
  const norm = (v) => String(v || '').trim().toLowerCase();
  const safePrompt = String(prompt || '').trim();
  const promptLower = safePrompt.toLowerCase();
  const mirrorOn = mirrorHands === true;

  const safeJsonParse = (v) => {
    try {
      if (!v) return null;
      if (typeof v === 'object') return v;
      return JSON.parse(String(v));
    } catch (_) {
      return null;
    }
  };

  // canonical 0..9 mapping
  const IDX = {
    L: { thumb: 0, index: 1, middle: 2, ring: 3, pinky: 4 },
    R: { thumb: 5, index: 6, middle: 7, ring: 8, pinky: 9 },
  };

  function parseFingerDirectives(rawPrompt) {
    // supports: "left thumb ..." or "right ring ..." or "ring ..." (applies to right + left if mirror)
    const text = (rawPrompt || '').toLowerCase();
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);

    const directives = [];
    for (const p of parts) {
      const hand = p.includes('left') ? 'left' : (p.includes('right') ? 'right' : null);

      const finger =
        p.includes('thumb') ? 'thumb' :
        p.includes('index') ? 'index' :
        p.includes('middle') ? 'middle' :
        p.includes('ring') ? 'ring' :
        p.includes('pinky') ? 'pinky' :
        null;

      if (!finger) continue;
      directives.push({ hand, finger, text: p });
    }
    return directives;
  }

  function buildOverrideIndexes(rawPrompt, mirrorOn) {
    const directives = parseFingerDirectives(rawPrompt);
    const idxs = new Set();

    for (const d of directives) {
      if (d.hand === 'left') idxs.add(IDX.L[d.finger]);
      else if (d.hand === 'right') idxs.add(IDX.R[d.finger]);
      else {
        // no hand specified
        idxs.add(IDX.R[d.finger]);
        if (mirrorOn) idxs.add(IDX.L[d.finger]);
      }
    }
    return Array.from(idxs).filter((n) => Number.isInteger(n) && n >= 0 && n <= 9);
  }

  // deterministic shuffle using seed
  let tSeed = Number.isFinite(Number(seed)) ? Number(seed) : Date.now();
  const rand = () => {
    tSeed = (tSeed * 9301 + 49297) % 233280;
    return tSeed / 233280;
  };
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  if (!safePrompt) {
    return {
      prompt: safePrompt,
      nailDesign: null,
      error: 'Prompt is required',
      meta: {
        mode: 'single',
        serviceVersion:
          typeof SERVICE_VERSION !== 'undefined' ? SERVICE_VERSION : 'unknown',
        serviceFile: __filename,
      },
    };
  }

  // ----------------------------
  // 1) Shape + length
  // ----------------------------
  let { shape, length } = (typeof resolveShapeLength === 'function')
    ? resolveShapeLength({ promptLower, shapeOverride, lengthOverride })
    : { shape: shapeOverride, length: lengthOverride };

  shape = norm(shape) || 'square';
  length = norm(length) || 'medium';

  const resolvedShapeOriginal = shape;
  const resolvedLengthOriginal = length;

  // ----------------------------
  // 2) Load collections
  // ----------------------------
  const safeGet = async (name) => {
    try {
      const v = await getCollection(name);
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  };

  const colorLibrary = await safeGet('color_library');

  let templates = await safeGet('finger_templates');
  if (!templates.length) {
    templates = await safeGet('templates');
  }

  const normalizedTemplates =
    typeof getTemplatesCatalog === 'function'
      ? getTemplatesCatalog(templates)
      : (Array.isArray(templates) ? templates : []);

  try {
    global.__TEMPLATES_CACHE = Array.isArray(normalizedTemplates)
      ? normalizedTemplates
      : [];
  } catch (_) {}

  let frenchTips = await safeGet('french_tips');
  if (!frenchTips.length) {
    frenchTips = await safeGet('french_tip');
  }

  let patterns = await safeGet('pattern_library');
  if (!patterns.length) {
    patterns = await safeGet('patterns');
  }

  let charms = await safeGet('charm_library');
  if (!charms.length) {
    charms = await safeGet('charms');
  }

  let stamps = await safeGet('stamp_library');
  if (!stamps.length) {
    stamps = await safeGet('stamps');
  }

  let stickers = await safeGet('sticker_library');
  if (!stickers.length) {
    stickers = await safeGet('stickers');
  }

  let gelArt3D = await safeGet('gel_art_3d');
  if (!gelArt3D.length) {
    gelArt3D = await safeGet('gelArt3D');
  }

  let effects = await safeGet('effect_library');
  if (!effects.length) {
    effects = await safeGet('effects');
  }

  // ----------------------------
  // 3) Base color
  // ----------------------------
  const colorDoc = (typeof matchBaseColor === 'function')
    ? matchBaseColor(safePrompt, colorLibrary)
    : null;

  const base = (typeof buildBaseFromColorDoc === 'function')
    ? buildBaseFromColorDoc(colorDoc)
    : { type: 'solid', colorName: null, colorFamily: null, colorRef: null, finish: 'glossy', opacity: 1, hexColor: null, gradient: null, visible: true };

  // ----------------------------
  // 4) Template selection (base template for this design)
  // ----------------------------
  const templatesCount = Array.isArray(normalizedTemplates) ? normalizedTemplates.length : 0;

  const matchesShape = (t, needShape) => {
    const ts = norm(t?.shape || t?.nailShape);
    if (!needShape) return true;
    if (!ts) return true;
    return ts === needShape;
  };

  const matchesShapeLength = (t, needShape, needLength) => {
    const ts = norm(t?.shape || t?.nailShape);
    const tl = norm(t?.length || t?.nailLength);
    if (needShape && ts && ts !== needShape) return false;
    if (needLength && tl && tl !== needLength) return false;
    return true;
  };

  const findByDocId = (docId) => {
    const want = String(docId || '').trim();
    if (!want) return null;
    return (normalizedTemplates || []).find((t) => {
      const id = String(t?.templateId ?? t?.id ?? '').trim();
      return id === want;
    }) || null;
  };

  const pickLengthFallback = (pool, desiredLen) => {
    const want = norm(desiredLen);
    const orderByDesired = {
      medium: ['medium', 'long', 'short', 'xl', 'xs'],
      long: ['long', 'medium', 'short', 'xl', 'xs'],
      short: ['short', 'medium', 'long', 'xs', 'xl'],
      xl: ['xl', 'long', 'medium', 'short', 'xs'],
      xs: ['xs', 'short', 'medium', 'long', 'xl'],
    };
    const order = orderByDesired[want] || [want, 'long', 'medium', 'short', 'xl', 'xs'];

    for (const lenTry of order) {
      const hit = (pool || []).find((t) => norm(t?.length || t?.nailLength) === lenTry);
      if (hit) return hit;
    }
    return (pool && pool[0]) ? pool[0] : null;
  };

  const requestedTemplateId = templateId != null ? String(templateId).trim() : null;

  let chosenTemplate = null;
  let relaxedLengthUsed = false;

  // 4a) If templateId provided (from variants) honor if it exists
  if (requestedTemplateId) {
    chosenTemplate = findByDocId(requestedTemplateId);
  }

  // 4b) Else: strict shape+length, else relax to shape-only
  if (!chosenTemplate) {
    const strictPool = (normalizedTemplates || []).filter((t) =>
      matchesShapeLength(t, shape, length)
    );

    if (strictPool.length > 0) {
      chosenTemplate = strictPool[0];
      relaxedLengthUsed = false;
    } else {
      const shapeOnlyPool = (normalizedTemplates || []).filter((t) =>
        matchesShape(t, shape)
      );

      if (shapeOnlyPool.length > 0) {
        chosenTemplate = pickLengthFallback(shapeOnlyPool, length);
        relaxedLengthUsed = true;
      }
    }
  }

  if (!chosenTemplate) {
    return {
      prompt: safePrompt,
      nailDesign: null,
      error: `No templates found for shape="${shape}" length="${length}"`,
      meta: {
        mode: 'single',
        serviceVersion:
          typeof SERVICE_VERSION !== 'undefined' ? SERVICE_VERSION : 'unknown',
        serviceFile: __filename,
        resolved: { shape, length },
        templatesCount,
        requestedTemplateId: requestedTemplateId || null,
        chosenTemplateDocId: null,
        finalTemplateId: null,
        relaxedLengthUsed: false,
        chosenTemplateLength: null,
      },
    };
  }

  const chosenTemplateDocId =
    String(chosenTemplate?.templateId ?? chosenTemplate?.id ?? '').trim() || null;

  const chosenTemplateLength = norm(chosenTemplate?.length || chosenTemplate?.nailLength) || length;

  // if template forced a different length, sync output length
  if (chosenTemplateLength && chosenTemplateLength !== length) {
    length = chosenTemplateLength;
  }

  // ----------------------------
  // ✅ 4c) Complexity decision (request > template > default)
  // ----------------------------
  const cxIn = norm(complexity || '');
  const chosenComplexity =
    (['low', 'medium', 'complex'].includes(cxIn) ? cxIn : null) ||
    norm(chosenTemplate?.complexity || 'low') ||
    'low';

  // ----------------------------
  // ✅ 4d) Build a small template set for per-finger variety
  // low -> 2, medium -> 3, complex -> 5
  // ----------------------------
  const wantUnique =
    chosenComplexity === 'complex' ? 5 :
    chosenComplexity === 'medium' ? 3 :
    2;

  const strictPool = (normalizedTemplates || []).filter((t) => matchesShapeLength(t, shape, length));
  const shapeOnlyPool = (normalizedTemplates || []).filter((t) => matchesShape(t, shape));
  const pool = strictPool.length ? strictPool : shapeOnlyPool;

  const getDocId = (t) => String(t?.templateId ?? t?.id ?? '').trim();

  const baseTpl = chosenTemplate;
  const baseTplId = getDocId(baseTpl);

  const otherTpls = shuffle(
    pool.filter((t) => getDocId(t) && getDocId(t) !== baseTplId)
  );

  const pickedTpls = [baseTpl, ...otherTpls].filter(Boolean).slice(0, Math.min(wantUnique, 1 + otherTpls.length));

  const accentTpls = pickedTpls.slice(1);

  const accentAt = (i) => {
    if (!accentTpls.length) return baseTpl;
    return accentTpls[i % accentTpls.length];
  };

  function buildFingerFromTemplateDoc(tplDoc, base) {
    const fd = safeJsonParse(tplDoc?.fingerDesign);

    const core = fd
      ? buildFingerFromFingerDesign(fd, base)
      : buildBaseOnlyFinger(base);

    return {
      // ✅ per-finger template identity
      templateId: getDocId(tplDoc) || null,
      templateName: tplDoc?.name ?? tplDoc?.label ?? null,
      shape: tplDoc?.shape ?? shape,
      length: tplDoc?.length ?? length,
      uiImageUrl: tplDoc?.uiImageUrl ?? tplDoc?.thumbnailUi ?? tplDoc?.imageUrl ?? '',
      modelUrl: tplDoc?.modelUrl ?? '',

      templateRef: fd?.templateRef ?? (
        fd?.templateId || fd?.templateName
          ? { id: fd?.templateId ?? null, name: fd?.templateName ?? null }
          : null
      ),

      ...core,
    };
  }

  // ----------------------------
  // 5) Per-finger directives -> override indexes
  // ----------------------------
  const overrideIndexes = buildOverrideIndexes(safePrompt, mirrorOn);

  // choose accent indices by complexity
  const leftAccents =
    chosenComplexity === 'complex' ? [IDX.L.thumb, IDX.L.index, IDX.L.middle, IDX.L.ring] :
    chosenComplexity === 'medium' ? [IDX.L.thumb, IDX.L.ring] :
    [IDX.L.ring];

  const rightAccentsNonMirror =
    chosenComplexity === 'complex' ? [IDX.R.thumb, IDX.R.index, IDX.R.middle, IDX.R.ring] :
    chosenComplexity === 'medium' ? [IDX.R.thumb, IDX.R.ring] :
    [IDX.R.thumb]; // low + non-mirror: make it different than left ring

  // if overrides exist, use them as the only accents
  const finalAccentIndexes = overrideIndexes.length ? overrideIndexes : (
    mirrorOn
      ? leftAccents // right will be mirrored later
      : [...leftAccents, ...rightAccentsNonMirror]
  );

  const accentSet = new Set(finalAccentIndexes);

  // ----------------------------
  // 6) Build fingers (10)
  // - start all as base template
  // - set accents using accent templates (cycled)
  // ----------------------------
  let fingers = Array.from({ length: 10 }, () => buildFingerFromTemplateDoc(baseTpl, base));

  let accentCounter = 0;

  // left hand accents always first (more predictable)
  const orderedAccentIdx = [
    IDX.L.thumb, IDX.L.index, IDX.L.middle, IDX.L.ring, IDX.L.pinky,
    IDX.R.thumb, IDX.R.index, IDX.R.middle, IDX.R.ring, IDX.R.pinky,
  ].filter((i) => accentSet.has(i));

  for (const idx of orderedAccentIdx) {
    const tpl = accentAt(accentCounter);
    fingers[idx] = buildFingerFromTemplateDoc(tpl, base);
    accentCounter++;
  }

  // ----------------------------
  // 7) Assemble design-level nailDesign
  // design-level templateId stays the "base" template doc id for the design
  // ----------------------------
  const finalTemplateId =
    requestedTemplateId ||
    baseTplId ||
    `template_${shape}_${length}_basic`;

  let nailDesign = {
    shape,
    length,
    templateId: finalTemplateId,
    templateKey: null, // keep stable; optional
    base,
    fingers,
  };

  // ----------------------------
  // 8) apply swaps (ASYNC, per-finger)
  // ✅ if mirrorHands true: swap only left then mirror
  // ----------------------------
  let swapsApplied = false;

  try {
    if (typeof applySwaps === 'function' && nailDesign && Array.isArray(nailDesign.fingers)) {
      const catalogs = {
        frenchTips,
        patterns,
        charms,
        stamps,
        stickers,
        gelArt3D,
        effects,
        colorLibrary,
      };

      const intents = {};

      const modelForSwaps = norm(model) || 'couture';
      const seedForSwaps = Number.isFinite(Number(seed)) ? Number(seed) : Date.now();

      const preferTrendingForSwaps =
        preferTrending === true ||
        modelForSwaps === 'curated' ||
        modelForSwaps === 'muse';

      const indicesToSwap = mirrorOn ? [0,1,2,3,4] : [0,1,2,3,4,5,6,7,8,9];

      for (const i of indicesToSwap) {
        nailDesign.fingers[i] = await applySwaps(
          nailDesign.fingers[i],
          intents,
          catalogs,
          {
            prompt: safePrompt,
            promptLower,
            shape,
            length,
            seed: seedForSwaps,
            model: modelForSwaps,
            fingerIndex: i,
          },
          {
            enableSwaps: true,
            preferTrending: preferTrendingForSwaps,
            debug: debug === true,
          }
        );
      }

      swapsApplied = true;
    }
  } catch (e) {
    console.warn('⚠️ applySwaps failed (continuing):', e?.message || e);
  }

  // ----------------------------
  // 9) mirrorHands (optional)
  // IMPORTANT: this should mirror the FULL finger object (including templateId/templateName)
  // ----------------------------
  if (mirrorOn && typeof applyMirrorHands === 'function') {
    try {
      nailDesign.fingers = applyMirrorHands(nailDesign.fingers);
    } catch (e) {
      console.warn('⚠️ applyMirrorHands failed (continuing):', e?.message || e);
    }
  }

  try {

    console.log('🧪 BEFORE OVERRIDES', {
      prompt: safePrompt,
      colorLibraryLen: Array.isArray(colorLibrary) ? colorLibrary.length : 0,
      frenchTipsLen: Array.isArray(frenchTips) ? frenchTips.length : 0,
      charmsLen: Array.isArray(charms) ? charms.length : 0,
      patternsLen: Array.isArray(patterns) ? patterns.length : 0,
      stampsLen: Array.isArray(stamps) ? stamps.length : 0,
      gelArt3DLen: Array.isArray(gelArt3D) ? gelArt3D.length : 0,
    });

    nailDesign = applyPromptOverridesToDesign({
      design: nailDesign,
      prompt: safePrompt,
      colorLibrary,
      charms,
      frenchTips,
      patterns,
      stamps,
      gelArt3D,
      stickers,
      variantIndex: Number.isFinite(Number(seed)) ? Number(seed) % 10 : 0,
    });
  } catch (e) {
    console.warn('⚠️ applyPromptOverridesToDesign failed:', e?.message || e);
  }

  // ----------------------------
  // 10) normalize
  // NOTE: your normalizeNailDesign MUST preserve finger.templateId/templateName etc,
  // otherwise those fields will get stripped.
  // ----------------------------
  nailDesign = normalizeNailDesign(nailDesign);

  try {
    nailDesign.templateId = finalTemplateId;
    if (!nailDesign.templateKey) nailDesign.templateKey = null;
  } catch (e) {}

  return {
    prompt: safePrompt,
    nailDesign,
    meta: {
      mode: 'single',
      model: norm(model) || 'couture',
      serviceVersion:
        typeof SERVICE_VERSION !== 'undefined' ? SERVICE_VERSION : 'unknown',
      serviceFile: __filename,
      resolved: { shape, length },
      mirrorHands: mirrorOn,

      colorMatched: colorDoc ? (colorDoc.id || colorDoc.name || 'matched') : null,

      templatesCount,

      requestedTemplateId: requestedTemplateId || null,
      chosenTemplateDocId: chosenTemplateDocId || null,
      finalTemplateId,

      relaxedLengthUsed: relaxedLengthUsed === true,
      chosenTemplateLength: chosenTemplateLength || null,
      resolvedLengthOriginal: resolvedLengthOriginal || null,

      complexity: chosenComplexity, // ✅ keep here too

      // finger variety info (helps debugging)
      uniqueTemplateTarget: wantUnique,
      pickedTemplateIds: pickedTpls.map((t) => getDocId(t)).filter(Boolean),
      accentIndexes: Array.from(accentSet),
      accentCount: Array.from(accentSet).length,
      explicitFingerOverrides: overrideIndexes.length > 0,
      overrideIndexes,

      swapsApplied,

      catalogs: {
        frenchTips: Array.isArray(frenchTips) ? frenchTips.length : 0,
        patterns: Array.isArray(patterns) ? patterns.length : 0,
        charms: Array.isArray(charms) ? charms.length : 0,
      },

      templatesCacheLen: Array.isArray(global.__TEMPLATES_CACHE) ? global.__TEMPLATES_CACHE.length : 0,
    },
  };
}

function normStr(v) {
  return String(v ?? '').trim().toLowerCase();
}

function tokenize(text) {
  const s = normStr(text)
    .replace(/[_\-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return [];
  return s.split(' ').filter(Boolean);
}

// very light “AI-ish” cleanup: plural->singular, a few synonyms, normalize phrases
function expandTokens(tokens) {
  const out = new Set();
  const add = (t) => { if (t) out.add(t); };

  const synonymMap = {
    butterflies: 'butterfly',
    butterflys: 'butterfly',
    glittery: 'glitter',
    sparkly: 'sparkle',
    sparkles: 'sparkle',
    rhinestones: 'rhinestone',
    gems: 'gem',
    chrome: 'chrome',
    metallic: 'chrome',
    nude: 'neutral',
    nudeish: 'neutral',
    french: 'french',
    tip: 'tip',
    tips: 'tip',
  };

  for (const raw of tokens) {
    let t = normStr(raw);
    if (!t) continue;

    // simple plural stripping (safe-ish)
    if (t.length > 3 && t.endsWith('s')) t = t.slice(0, -1);

    // apply synonyms
    if (synonymMap[t]) t = synonymMap[t];

    add(t);
  }

  // phrase boosts (if prompt contains both words)
  const joined = Array.from(out).join(' ');
  if (joined.includes('french') && joined.includes('tip')) add('french tip');
  if (joined.includes('hot') && joined.includes('pink')) add('hot pink');

  return out;
}

function safeParseJson(v) {
  try {
    if (v == null) return null;
    if (typeof v === 'object') return v;
    const s = String(v).trim();
    if (!s) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Returns a list of possible “keys” that might identify this template in your system
function getTemplateKeys(tpl) {
  const fd = safeParseJson(tpl?.fingerDesign);
  return [
    tpl?.id,
    tpl?.templateId,     // your Firestore doc's templateId (like "37ehds...")
    tpl?.name,           // slug (like "classic_nude_french")
    tpl?.label,          // human label
    fd?.templateId,      // internal template id inside fingerDesign
    fd?.templateName,
  ]
    .filter(Boolean)
    .map((x) => String(x).trim());
}

// A “search text” for scoring (tags + name/label/category + fingerDesign tags)
function templateSearchBlob(tpl) {
  const fd = safeParseJson(tpl?.fingerDesign);
  const parts = [];

  parts.push(tpl?.name, tpl?.label, tpl?.category);

  if (Array.isArray(tpl?.tags)) parts.push(tpl.tags.join(' '));
  if (Array.isArray(fd?.tags)) parts.push(fd.tags.join(' '));

  return normStr(parts.filter(Boolean).join(' '));
}

function scoreTemplateForPrompt(tpl, promptTokenSet) {
  // tokenize template blob
  const blobTokens = expandTokens(tokenize(templateSearchBlob(tpl)));

  // scoring: overlap of prompt tokens and template tokens
  let score = 0;
  for (const tok of promptTokenSet) {
    if (blobTokens.has(tok)) score += 3; // direct hit
    // allow phrase token ("french tip") to count strongly if present
    if (tok.includes(' ') && blobTokens.has(tok)) score += 6;
  }

  // extra boosts for strong fields
  const cat = normStr(tpl?.category);
  if (cat && promptTokenSet.has(cat)) score += 5;

  // slight boost if template complexity exists and prompt implies “simple/minimal”
  const complexity = normStr(tpl?.complexity);
  if ((promptTokenSet.has('minimal') || promptTokenSet.has('classic')) && complexity === 'low') {
    score += 2;
  }

  return score;
}

function normStr(v) {
  return String(v ?? '').trim().toLowerCase();
}

function tokenize(text) {
  const s = normStr(text)
    .replace(/[_\-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return [];
  return s.split(' ').filter(Boolean);
}

// very light “AI-ish” cleanup: plural->singular, a few synonyms, normalize phrases
function expandTokens(tokens) {
  const out = new Set();
  const add = (t) => { if (t) out.add(t); };

  const synonymMap = {
    butterflies: 'butterfly',
    butterflys: 'butterfly',
    glittery: 'glitter',
    sparkly: 'sparkle',
    sparkles: 'sparkle',
    rhinestones: 'rhinestone',
    gems: 'gem',
    chrome: 'chrome',
    metallic: 'chrome',
    nude: 'neutral',
    nudeish: 'neutral',
    french: 'french',
    tip: 'tip',
    tips: 'tip',
  };

  for (const raw of tokens) {
    let t = normStr(raw);
    if (!t) continue;

    // simple plural stripping (safe-ish)
    if (t.length > 3 && t.endsWith('s')) t = t.slice(0, -1);

    // apply synonyms
    if (synonymMap[t]) t = synonymMap[t];

    add(t);
  }

  // phrase boosts (if prompt contains both words)
  const joined = Array.from(out).join(' ');
  if (joined.includes('french') && joined.includes('tip')) add('french tip');
  if (joined.includes('hot') && joined.includes('pink')) add('hot pink');

  return out;
}

function safeParseJson(v) {
  try {
    if (v == null) return null;
    if (typeof v === 'object') return v;
    const s = String(v).trim();
    if (!s) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Returns a list of possible “keys” that might identify this template in your system
function getTemplateKeys(tpl) {
  const fd = safeParseJson(tpl?.fingerDesign);
  return [
    tpl?.id,
    tpl?.templateId,     // your Firestore doc's templateId (like "37ehds...")
    tpl?.name,           // slug (like "classic_nude_french")
    tpl?.label,          // human label
    fd?.templateId,      // internal template id inside fingerDesign
    fd?.templateName,
  ]
    .filter(Boolean)
    .map((x) => String(x).trim());
}

// A “search text” for scoring (tags + name/label/category + fingerDesign tags)
function templateSearchBlob(tpl) {
  const fd = safeParseJson(tpl?.fingerDesign);
  const parts = [];

  parts.push(tpl?.name, tpl?.label, tpl?.category);

  if (Array.isArray(tpl?.tags)) parts.push(tpl.tags.join(' '));
  if (Array.isArray(fd?.tags)) parts.push(fd.tags.join(' '));

  return normStr(parts.filter(Boolean).join(' '));
}

function scoreTemplateForPrompt(tpl, promptTokenSet) {
  // tokenize template blob
  const blobTokens = expandTokens(tokenize(templateSearchBlob(tpl)));

  // scoring: overlap of prompt tokens and template tokens
  let score = 0;
  for (const tok of promptTokenSet) {
    if (blobTokens.has(tok)) score += 3; // direct hit
    // allow phrase token ("french tip") to count strongly if present
    if (tok.includes(' ') && blobTokens.has(tok)) score += 6;
  }

  // extra boosts for strong fields
  const cat = normStr(tpl?.category);
  if (cat && promptTokenSet.has(cat)) score += 5;

  // slight boost if template complexity exists and prompt implies “simple/minimal”
  const complexity = normStr(tpl?.complexity);
  if ((promptTokenSet.has('minimal') || promptTokenSet.has('classic')) && complexity === 'low') {
    score += 2;
  }

  return score;
}

// ===============================
// ✅ applySwaps (Curated model)
// Swaps charms/patterns/stamps/etc to higher-trending alternatives
// while still matching prompt keywords.
// Safe-by-default: does nothing unless opts.model === 'curated' OR opts.useTrending === true.
// ===============================

const __SWAP_CACHE = {
  poolsByCollection: new Map(), // collectionName -> array
  lastLoadedAt: 0,
};

function __toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function __norm(v) {
  return String(v ?? '').trim().toLowerCase();
}

function __unique(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

// Deterministic PRNG (LCG) so swaps are stable per-seed
function __makeRand(seedNum = 0) {
  let t = __toNum(seedNum, 0) % 233280;
  return () => {
    t = (t * 9301 + 49297) % 233280;
    return t / 233280;
  };
}

function __safeParseJson(val) {
  try {
    if (!val) return null;
    if (typeof val === 'object') return val;
    return JSON.parse(String(val));
  } catch (_) {
    return null;
  }
}

// Small synonym normalization (keeps this cheap + predictable)
function __buildPromptTags(text) {
  const t = __norm(text);

  const synonym = {
    butterflies: 'butterfly',
    bfly: 'butterfly',
    ombré: 'ombre',
    glittery: 'glitter',
    marbled: 'marble',
    french: 'french tip',
    tip: 'french tip',
    tips: 'french tip',
    cateye: 'cat eye',
    'cat-eye': 'cat eye',
  };

  const stop = new Set(['nails', 'nail', 'set', 'with', 'and', 'the', 'for', 'a', 'an']);

  const tags = new Set();

  // phrase detection first
  if (t.includes('french tip')) tags.add('french tip');
  if (t.includes('cat eye')) tags.add('cat eye');
  if (t.includes('aura')) tags.add('aura');
  if (t.includes('chrome')) tags.add('chrome');

  const tokens = t
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const tok of tokens) {
    const normTok = synonym[tok] || tok;
    if (normTok.length >= 3 && !stop.has(normTok)) tags.add(normTok);
  }

  return Array.from(tags);
}

function __normArr(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((x) => __norm(x))
    .filter(Boolean);
}

function __extractAssetId(obj) {
  if (!obj) return null;
  const candidates = [
    obj.assetRef,
    obj.ref,
    obj.id,
    obj.itemId,
    obj.charmRef,
    obj.patternRef,
    obj.stampRef,
    obj.gelArtRef,
    obj.effectRef,
    obj.templateId, // sometimes used inconsistently
  ]
    .map((x) => (x != null ? String(x).trim() : ''))
    .filter(Boolean);

  return candidates[0] || null;
}

function __extractAssetTags(asset) {
  // Pull from common places. Keep it flexible.
  const tags = [];

  tags.push(...__normArr(asset?.tags));
  tags.push(...__normArr(asset?.keywords));
  tags.push(__norm(asset?.category));
  tags.push(__norm(asset?.style));
  tags.push(__norm(asset?.type));

  const nameBits = `${asset?.name || ''} ${asset?.label || ''} ${asset?.title || ''} ${asset?.slug || ''}`;
  if (nameBits.trim()) {
    nameBits
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3)
      .forEach((w) => tags.push(w));
  }

  return __unique(tags.filter(Boolean));
}

function __scoreAsset(asset, promptTags) {
  const tScore = __toNum(asset?.trendingScore, 0);
  const assetTags = new Set(__extractAssetTags(asset));

  let overlap = 0;
  for (const tag of promptTags) {
    if (assetTags.has(__norm(tag))) overlap += 1;
  }

  // Weighted scoring:
  // - trendingScore is the main lever for Curated
  // - overlap keeps it relevant to prompt
  return tScore * 10 + overlap * 3;
}

async function __getPool(collectionName) {
  if (!collectionName) return [];

  // simple caching to avoid reloading for each finger
  if (__SWAP_CACHE.poolsByCollection.has(collectionName)) {
    return __SWAP_CACHE.poolsByCollection.get(collectionName) || [];
  }

  let pool = [];
  try {
    if (typeof getCollection === 'function') {
      pool = await getCollection(collectionName) || [];
    } else if (typeof getCatalog === 'function') {
      // optional fallback if you have a generic catalog fn
      pool = getCatalog(collectionName) || [];
    } else {
      pool = [];
    }
  } catch (_) {
    pool = [];
  }

  if (!Array.isArray(pool)) pool = [];
  __SWAP_CACHE.poolsByCollection.set(collectionName, pool);
  return pool;
}

// Maps “what the finger contains” -> “where to look for replacements”
// You can adjust these names to match your Firestore collections/catalogs.
function __collectionForItem(item, kindHint) {
  const type = __norm(item?.type || kindHint);

  // common
  if (type.includes('charm')) return 'charms';
  if (type.includes('stamp')) return 'stamps';
  if (type.includes('sticker')) return 'stickers';
  if (type.includes('pattern') || type.includes('print')) return 'patterns';

  // ✅ IMPORTANT: match your catalogs key name (camelCase)
  if (type.includes('gel')) return 'gelArt3D';

  if (type.includes('effect')) return 'effects';

  // optional extras (safe to include even if you don’t always load them)
  if (type.includes('french')) return 'frenchTips';
  if (type.includes('color')) return 'colorLibrary';

  // if unknown, don’t swap (safe)
  return null;
}


function __pickBetterReplacement({
  pool,
  promptTags,
  currentId,
  currentScore,
  seedNum,
}) {
  if (!Array.isArray(pool) || pool.length === 0) return null;

  // Build scored candidates
  const scored = pool
    .map((a) => {
      const id = __extractAssetId(a);
      if (!id || id === currentId) return null;
      const s = __scoreAsset(a, promptTags);
      return { id, score: s, raw: a };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  // Only swap if we can beat current score (or current score is unknown)
  const bestScore = scored[0].score;
  const mustBeat = Number.isFinite(currentScore) ? currentScore : -Infinity;
  if (bestScore <= mustBeat) return null;

  // Variety: choose among top M deterministically based on seed
  const M = Math.min(5, scored.length);
  const pick = __toNum(seedNum, 0) % M;
  return scored[pick]; // {id, score, raw}
}

/**
 * applySwaps(finger, opts)
 * opts.model: 'curated' activates trending swaps
 * opts.prompt / opts.promptLower: used for keyword relevance
 * opts.seed: deterministic variation
 * opts.swapChance: 0..1 to reduce over-swapping (default 0.6)
 */

async function applySwaps(fingerDesign, a = {}, b = {}, c = {}, d = {}) {
  // Supports BOTH call styles:
  // A) applySwaps(finger, intents, catalogs, ctx, opts)
  // B) applySwaps(finger, opts)  // where opts may contain { catalogs, ctx }
  try {
    const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
    const normStr = (v) => String(v ?? '').trim();
    const normLower = (v) => normStr(v).toLowerCase();
    const toNum = (v, fallback = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const clamp01 = (n) => Math.max(0, Math.min(1, n));
    const clamp100 = (n) => Math.max(0, Math.min(100, n));
    const makeRand = (seed) => {
      let t = (Number.isFinite(seed) ? seed : 0) % 233280;
      return () => {
        t = (t * 9301 + 49297) % 233280;
        return t / 233280;
      };
    };

    const __toMillis = (v) => {
      if (!v) return null;
      if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
      if (v instanceof Date) return v.getTime();
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const ms = Date.parse(String(v));
      return Number.isFinite(ms) ? ms : null;
    };

    // 0..100 where 100 = very new, 0 = old
    const __newnessScore = (doc, maxDays = 60) => {
      const ms =
        __toMillis(doc?.updatedAt) ??
        __toMillis(doc?.createdAt) ??
        __toMillis(doc?.addedAt) ??
        __toMillis(doc?.created_at) ??
        null;

      if (!ms) return 0;

      const ageDays = (Date.now() - ms) / (1000 * 60 * 60 * 24);
      const x = 1 - clamp01(ageDays / Math.max(1, maxDays));
      return clamp100(x * 100);
    };

    const isCatalogObject = (v) =>
      isPlainObject(v) &&
      (
        Array.isArray(v.patterns) ||
        Array.isArray(v.charms) ||
        Array.isArray(v.frenchTips) ||
        Array.isArray(v.stamps) ||
        Array.isArray(v.stickers) ||
        Array.isArray(v.gelArt3D) ||
        Array.isArray(v.effects) ||
        Array.isArray(v.colorLibrary) ||

        // allow your alt key too (won’t break)
        Array.isArray(v.gel_art_3d)
      );

    // ---- normalize args (support both call styles) ----
    let intents = {};
    let catalogs = {};
    let ctx = {};
    let opts = {};

    if (isCatalogObject(b)) {
      intents = isPlainObject(a) ? a : {};
      catalogs = isPlainObject(b) ? b : {};
      ctx = isPlainObject(c) ? c : {};
      opts = isPlainObject(d) ? d : {};
    } else {
      opts = isPlainObject(a) ? a : {};
      catalogs = isPlainObject(opts.catalogs)
        ? opts.catalogs
        : (isPlainObject(opts.catalog) ? opts.catalog : {});
      ctx = isPlainObject(opts.ctx)
        ? opts.ctx
        : (isPlainObject(opts.context) ? opts.context : {});
      intents = isPlainObject(opts.intents) ? opts.intents : {};
    }

    const finger = isPlainObject(fingerDesign) ? fingerDesign : null;
    if (!finger) return fingerDesign;

    // ✅ Swaps enabled by default (but can explicitly disable)
    if (opts.enableSwaps === false) return fingerDesign;

    const modelKey = normLower(opts.model ?? ctx.model ?? '');
    const preferTrending =
      opts.preferTrending === true ||
      opts.useTrending === true ||
      ctx.preferTrending === true ||
      ctx.useTrending === true;

    // Muse/Curated: allow trending behavior, but Muse focuses on NEW first
    const useTrending = preferTrending || modelKey === 'curated' || modelKey === 'muse';

    const promptLower = normLower(ctx.promptLower ?? opts.promptLower ?? ctx.prompt ?? opts.prompt ?? '');
    if (!promptLower) return fingerDesign;

    const seedNum = toNum(opts.seed ?? ctx.seed, 0);
    const rand = makeRand(seedNum);

    // ✅ Small chance for all models; tune higher by model if desired
    const defaultSwapChance =
      modelKey === 'iconic' ? 0.35 :
      modelKey === 'muse' ? 0.30 :
      modelKey === 'curated' ? 0.25 :
      0.12; // couture/default

    const swapChance = clamp01(
      opts.swapChance != null ? toNum(opts.swapChance, defaultSwapChance) : defaultSwapChance
    );

    if (swapChance <= 0) return fingerDesign;

    // ---- prompt tag builder ----
    const buildPromptTags = (text) => {
      const t = normLower(text);
      const synonym = {
        butterflies: 'butterfly',
        bfly: 'butterfly',
        ombré: 'ombre',
        chromed: 'chrome',
        glittery: 'glitter',
        marbled: 'marble',
        french: 'french tip',
        tip: 'french tip',
        glossy: 'glossy',
        matte: 'matte',
      };

      const tags = new Set();

      if (t.includes('french tip')) tags.add('french tip');
      if (t.includes('cat eye')) tags.add('cat eye');

      const tokens = t
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

      for (const tok of tokens) {
        const normTok = (synonym[tok] || tok).trim();
        if (normTok.length >= 3) tags.add(normTok);
      }

      const stop = new Set(['nails', 'nail', 'set', 'with', 'and', 'the', 'for']);
      return Array.from(tags).filter((x) => !stop.has(x));
    };

    const promptTags = buildPromptTags(promptLower);

    // ---- helpers to detect pools + ids ----
    const extractAssetId = (item) => {
      if (!isPlainObject(item)) return null;
      const keys = [
        'assetRef', 'ref', 'id',
        'charmRef', 'patternRef', 'stampRef', 'stickerRef',
        'frenchTipRef', 'gelArtRef', 'gelArt3DRef', 'effectRef',
        'colorRef',
      ];
      for (const k of keys) {
        if (item[k] != null && normStr(item[k])) return normStr(item[k]);
      }
      return null;
    };

    const setAssetId = (item, newId) => {
      const next = { ...item };
      const id = normStr(newId);
      if (!id) return next;

      const keys = [
        'assetRef', 'ref', 'id',
        'charmRef', 'patternRef', 'stampRef', 'stickerRef',
        'frenchTipRef', 'gelArtRef', 'gelArt3DRef', 'effectRef',
        'colorRef',
      ];
      for (const k of keys) {
        if (k in next && next[k] != null) {
          next[k] = id;
          return next;
        }
      }
      next.assetRef = id;
      return next;
    };

    // ✅ Keep your original mapping style, but support both gel keys
    const collectionForItem = (item, kindHint) => {
      const t = normLower(item?.type ?? kindHint ?? '');
      if (t.includes('french')) return 'frenchTips';
      if (t.includes('pattern') || t.includes('print')) return 'patterns';
      if (t.includes('stamp')) return 'stamps';
      if (t.includes('sticker')) return 'stickers';
      if (t.includes('charm')) return 'charms';
      if (t.includes('gel')) return (Array.isArray(catalogs?.gelArt3D) ? 'gelArt3D' : 'gel_art_3d');
      if (t.includes('effect')) return 'effects';
      if (t.includes('color')) return 'colorLibrary';
      return null;
    };

    const getPool = async (collectionName) => {
      const pool = catalogs?.[collectionName];
      return Array.isArray(pool) ? pool : [];
    };

    const normArr = (arr) =>
      (Array.isArray(arr) ? arr : [])
        .map((x) => normLower(x))
        .filter(Boolean);

    const extractDocId = (doc) => {
      if (!isPlainObject(doc)) return null;
      return (
        normStr(doc.id) ||
        normStr(doc.assetId) ||
        normStr(doc.ref) ||
        normStr(doc.charmId) ||
        normStr(doc.patternId) ||
        normStr(doc.stampId) ||
        normStr(doc.stickerId) ||
        normStr(doc.effectId) ||
        normStr(doc.gelArtId) ||
        normStr(doc.gelArt3DId) ||
        normStr(doc.colorRef) ||
        null
      );
    };

    const scoreDoc = (doc) => {
      const id = extractDocId(doc);
      if (!id) return { id: null, score: -1e9, baseScore: -1e9, trendingScore: 0, newScore: 0 };

      const tags = new Set(normArr(doc.tags));
      const name = normLower(doc.name ?? doc.label ?? '');
      const hay = `${id} ${name} ${Array.from(tags).join(' ')}`.trim();

      let base = 0;
      for (const tag of promptTags) {
        if (tags.has(tag)) base += 4;
      }
      const words = promptLower.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
      for (const w of words) {
        if (hay.includes(w)) base += 0.5;
      }

      const rawTrend = Number(doc.trendingScore);
      const trend = Number.isFinite(rawTrend) ? clamp100(rawTrend) : 0;

      const newScore = __newnessScore(doc, 60);

      // ✅ Model weights (same philosophy as template scoring)
      const TREND_WEIGHT =
        modelKey === 'curated' ? 0.20 :
        modelKey === 'muse'    ? 0.08 :
        modelKey === 'iconic'  ? 0.05 :
        (useTrending ? 0.08 : 0.00);

      const NEW_WEIGHT =
        modelKey === 'muse'    ? 0.25 :
        modelKey === 'curated' ? 0.05 :
        modelKey === 'iconic'  ? 0.10 :
        0.00;

      const total = base + trend * TREND_WEIGHT + newScore * NEW_WEIGHT;

      return {
        id,
        score: total,
        baseScore: base,
        trendingScore: trend,
        newScore,
        trendWeight: TREND_WEIGHT,
        newWeight: NEW_WEIGHT,
      };
    };

    const pickReplacement = ({ pool, currentId, seedSalt = 0 }) => {
      const scored = pool
        .map((doc) => scoreDoc(doc))
        .filter((x) => x.id && x.id !== currentId)
        .sort((a, b) => {
          const ds = (b.score || 0) - (a.score || 0);
          if (ds !== 0) return ds;

          // tie-breaks
          if (modelKey === 'muse') {
            const dn = (b.newScore || 0) - (a.newScore || 0);
            if (dn !== 0) return dn;
          }
          if (useTrending) {
            const dt = (b.trendingScore || 0) - (a.trendingScore || 0);
            if (dt !== 0) return dt;
          }
          return String(a.id).localeCompare(String(b.id));
        });

      if (!scored.length) return null;

      // iconic: more surprise
      if (modelKey === 'iconic') {
        const topN = Math.min(8, scored.length);
        const rr = makeRand(seedNum + seedSalt);
        const idx = Math.floor(rr() * topN);
        return scored[idx] || scored[0];
      }

      // couture/muse/curated: best match
      return scored[0];
    };

    // ---- apply swaps to known arrays ----
    const out = {
      ...finger,
      layers: Array.isArray(finger.layers) ? finger.layers.slice() : [],
      charms: Array.isArray(finger.charms) ? finger.charms.slice() : [],
      gelArt3D: Array.isArray(finger.gelArt3D) ? finger.gelArt3D.slice() : [],
      effects: Array.isArray(finger.effects) ? finger.effects.slice() : [],
    };

    const maybeSwapItem = async (item, kindHint, idx, saltBase) => {
      if (!isPlainObject(item)) return item;
      if (rand() > swapChance) return item;

      const collectionName = collectionForItem(item, kindHint);
      if (!collectionName) return item;

      const pool = await getPool(collectionName);
      if (!pool.length) return item;

      const currentId = extractAssetId(item);
      const picked = pickReplacement({
        pool,
        currentId,
        seedSalt: (saltBase || 0) + idx + collectionName.length,
      });

      if (!picked?.id) return item;
      if (picked.id === currentId) return item;

      const next = setAssetId(item, picked.id);

      if (opts.debug === true) {
        next.__swap = {
          from: currentId,
          to: picked.id,
          pool: collectionName,
          model: modelKey || null,
          pickedScore: picked.score,
          baseScore: picked.baseScore,
          trendingScore: picked.trendingScore,
          newScore: picked.newScore,
          trendWeight: picked.trendWeight,
          newWeight: picked.newWeight,
        };
      }

      return next;
    };

    // layers can contain pattern/stamp/sticker/french_tip, so use type-aware mapping
    for (let i = 0; i < out.layers.length; i++) {
      out.layers[i] = await maybeSwapItem(out.layers[i], out.layers[i]?.type ?? 'layer', i, 10);
    }
    for (let i = 0; i < out.charms.length; i++) {
      out.charms[i] = await maybeSwapItem(out.charms[i], 'charm', i, 100);
    }
    for (let i = 0; i < out.gelArt3D.length; i++) {
      out.gelArt3D[i] = await maybeSwapItem(out.gelArt3D[i], 'gel', i, 200);
    }
    for (let i = 0; i < out.effects.length; i++) {
      out.effects[i] = await maybeSwapItem(out.effects[i], 'effect', i, 300);
    }

    return out;
  } catch (e) {
    console.warn('⚠️ applySwaps failed (continuing):', e?.message || e);
    return fingerDesign;
  }
}

async function generateVariants({
  prompt,
  shapeOverride,
  lengthOverride,

  model = null,

  templateId,
  lockTemplate,
  mirrorHands,
  count = 5,
  seed = 123,
  debug = false,

  preferTrending = null,

  // ✅ NEW
  complexity = null,
}) {
  console.log('generateVariants input templateId:', templateId);

  // ---------- helpers ----------
  const normStr = (v) => String(v ?? '').trim();
  const normLower = (v) => normStr(v).toLowerCase();
  const toNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const unique = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

  const coerceBool = (v) => {
    if (v === true || v === false) return v;
    const s = normLower(v);
    if (['1', 'true', 'yes', 'y', 'on', 'locked', 'lock'].includes(s)) return true;
    if (['0', 'false', 'no', 'n', 'off', 'unlock', 'unlocked'].includes(s)) return false;
    return undefined;
  };

  const safeParseJson = (val) => {
    try {
      if (!val) return null;
      if (typeof val === 'object') return val;
      return JSON.parse(String(val));
    } catch (_) {
      return null;
    }
  };

  // ---------- normalize input ----------
  const safePrompt = normStr(prompt);
  const promptLower = safePrompt.toLowerCase();

  const n = Math.max(1, Math.floor(toNum(count, 1) || 1));
  const seedNum = toNum(seed, 123);

  const modelKey = normLower(model || '');
  const preferTrendingFlag =
    coerceBool(preferTrending) === true ||
    modelKey === 'muse' ||
    modelKey === 'curated';

  // Back-compat lock behavior:
  const lockFlag = coerceBool(lockTemplate);
  const requestedTemplateId = normStr(templateId);
  const lockedTemplateId =
    requestedTemplateId && (lockFlag === undefined ? true : lockFlag)
      ? requestedTemplateId
      : null;

  // ✅ complexity normalize
  const cx = normLower(complexity || '');
  const complexityNorm = ['low', 'medium', 'complex'].includes(cx) ? cx : null;

  if (!safePrompt) {
    return {
      prompt: safePrompt,
      nailDesign: null,
      variants: [],
      meta: {
        mode: 'variants',
        serviceVersion: typeof SERVICE_VERSION !== 'undefined' ? SERVICE_VERSION : 'unknown',
        serviceFile: __filename,
        resolved: { shape: null, length: null },
        count: n,
        seed: seedNum,
        mirrorHands: mirrorHands === true,
        model: modelKey || null,
        preferTrending: preferTrendingFlag,
        complexity: complexityNorm,
        lockTemplate: lockedTemplateId != null,
        lockedTemplateId: lockedTemplateId || null,
        candidateIdsLen: 0,
        chosenTemplateIds: [],
        actuallyReturnedTemplateIds: [],
        fallbackSource: null,
        topCandidates: [],
        error: 'Prompt is required',
        ...(debug === true ? { debug: { selectedTemplates: [] } } : {}),
      },
    };
  }

  // ---------- resolve shape/length ----------
  let { shape, length } =
    (typeof resolveShapeLength === 'function')
      ? resolveShapeLength({ promptLower, shapeOverride, lengthOverride })
      : { shape: shapeOverride, length: lengthOverride };

  shape = normLower(shape) || 'square';
  length = normLower(length) || 'medium';

  const canonShapeTokens = (s) => {
    const x = normLower(s);
    if (x === 'square') return ['square', 'sq'];
    if (x === 'coffin') return ['coffin'];
    if (x === 'almond') return ['almond', 'alm'];
    if (x === 'stiletto') return ['stiletto', 'st'];
    if (x === 'round') return ['round', 'rd'];
    if (x === 'duck') return ['duck', 'du'];
    return [x].filter(Boolean);
  };

  const canonLengthTokens = (l) => {
    const x = normLower(l);
    if (x === 'short') return ['short', 'sm', 's', 'sh'];
    if (x === 'medium') return ['medium', 'md', 'm'];
    if (x === 'long') return ['long', 'lg', 'l'];
    if (x === 'xl' || x === 'xlong' || x === 'extra long') return ['xl', 'xlong'];
    return [x].filter(Boolean);
  };

  const idMatchesShapeLength = (id, shapeVal, lengthVal) => {
    const idn = `_${normLower(id)}_`;
    if (!idn || idn === '__') return false;
    const shapes = canonShapeTokens(shapeVal);
    const lengths = canonLengthTokens(lengthVal);
    const hasShape = shapes.some((tok) => idn.includes(`_${tok}_`));
    const hasLength = lengths.some((tok) => idn.includes(`_${tok}_`));
    return hasShape && hasLength;
  };

  // Deterministic PRNG (LCG)
  let t = seedNum;
  const rand = () => {
    t = (t * 9301 + 49297) % 233280;
    return t / 233280;
  };

  const shuffleDeterministic = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ---------- catalog extraction ----------
  const extractPossibleIds = (tpl) => {
    const ids = [];
    if (!tpl) return ids;

    if (tpl.templateId) ids.push(String(tpl.templateId));
    if (tpl.id) ids.push(String(tpl.id));

    const fd = safeParseJson(tpl.fingerDesign);
    if (fd?.templateId) ids.push(String(fd.templateId));

    return ids.map((x) => x.trim()).filter(Boolean);
  };

  const buildLookup = (templates) => {
    const map = new Map();
    (Array.isArray(templates) ? templates : []).forEach((tpl) => {
      extractPossibleIds(tpl).forEach((id) => {
        if (!map.has(id)) map.set(id, tpl);
      });
    });
    return map;
  };

  const debugInfoForId = (lookup, id) => {
    const tpl = lookup.get(String(id || '')) || null;
    const fd = safeParseJson(tpl?.fingerDesign);
    return {
      requestedKey: id ?? null,
      firestoreTemplateId: tpl?.templateId ?? null,
      id: tpl?.id ?? null,
      name: tpl?.name ?? null,
      label: tpl?.label ?? null,
      category: tpl?.category ?? null,
      tags: Array.isArray(tpl?.tags) ? tpl.tags : [],
      shape: tpl?.shape ?? null,
      length: tpl?.length ?? null,
      complexity: tpl?.complexity ?? null,
      internalFingerDesignTemplateId: fd?.templateId ?? null,
      internalFingerDesignTemplateName: fd?.templateName ?? null,
    };
  };

  // ---------- load templates ----------
  let templates = [];
  let fallbackSource = null;

  try {
    templates = getCollection('finger_templates') || [];
    fallbackSource = 'getCollection(finger_templates)';
  } catch (e) {
    try {
      templates = getCollection('templates') || [];
      fallbackSource = 'getCollection(templates)';
    } catch (e2) {
      templates = [];
      fallbackSource = `error:${e2?.message || 'unknown'}`;
    }
  }

  // cache templates if you have this global
  try { global.__TEMPLATES_CACHE = Array.isArray(templates) ? templates : []; } catch (_) {}

  // ---------- 1) candidates ----------
  let candidates = [];

  if (lockedTemplateId) {
    candidates = [{ id: lockedTemplateId, score: 0, complexity: 'locked' }];
  } else {
    try {
      if (typeof getTopTemplateCandidates === 'function') {
        candidates =
          getTopTemplateCandidates(
            safePrompt,
            shapeOverride,
            lengthOverride,
            { model: modelKey || null, preferTrending: preferTrendingFlag }
          ) || [];
      } else {
        candidates = [];
      }
    } catch (e) {
      candidates = [];
    }

    candidates = (Array.isArray(candidates) ? candidates : [])
      .filter((c) => c && c.id)
      .map((c) => ({
        id: normStr(c.id),
        score: toNum(c.score, 0),
        complexity: c.complexity ?? null,
      }))
      .filter((c) => c.id)
      .sort((a, b) => {
        const ds = (b.score || 0) - (a.score || 0);
        if (ds !== 0) return ds;
        return String(a.id).localeCompare(String(b.id));
      });
  }

  let candidateIds = unique(candidates.map((c) => c.id));

  // ---------- 2) fallback if matcher returned nothing ----------
  if (!lockedTemplateId && candidateIds.length === 0) {
    const allIds = unique(
      (Array.isArray(templates) ? templates : []).flatMap((tpl) => extractPossibleIds(tpl))
    );

    const shapeFiltered = allIds.filter((id) => {
      const idn = `_${String(id || '').trim().toLowerCase()}_`;
      return canonShapeTokens(shape).some((tok) => idn.includes(`_${tok}_`));
    });

    const shapeAndLengthFiltered = shapeFiltered.filter((id) =>
      idMatchesShapeLength(id, shape, length)
    );

    candidateIds =
      shapeAndLengthFiltered.length ? shapeAndLengthFiltered :
      shapeFiltered.length ? shapeFiltered :
      allIds;
  }

  // ---------- 3) variety: pick from top K using seed ----------
  if (!lockedTemplateId && candidateIds.length >= 2) {
    const K = Math.min(5, candidateIds.length);
    const pick = Math.abs(seedNum) % K;
    const pickedId = candidateIds[pick];
    candidateIds = [pickedId, ...candidateIds.filter((x) => x !== pickedId)];
  }

  // ---------- 4) chosen ids per variant ----------
  let chosenIds = [];
  if (lockedTemplateId) {
    chosenIds = Array.from({ length: n }, () => lockedTemplateId);
  } else {
    const firstId = candidateIds[0] || null;
    const rest = candidateIds.slice(1);
    const restShuffled = rest.length ? shuffleDeterministic(rest) : [];

    chosenIds.push(firstId);

    for (let i = 1; i < n; i++) {
      if (restShuffled.length) {
        chosenIds.push(restShuffled[(i - 1) % restShuffled.length]);
      } else {
        chosenIds.push(firstId);
      }
    }
  }

  console.log('🎛️ generateVariants:', {
    n,
    seedNum,
    model: modelKey || null,
    preferTrending: preferTrendingFlag,
    mirrorHands: mirrorHands === true,
    lockedTemplateId,
    resolved: { shape, length },
    candidateIdsLen: candidateIds.length,
    chosenIds,
    fallbackSource,
    debug: debug === true,
  });

  // ---------- 5) generate designs ----------
  const designs = [];
  let firstResolved = null;

  for (let i = 0; i < n; i++) {
    const one = await generateOneDesign({
      prompt: safePrompt,
      shapeOverride,
      lengthOverride,
      templateId: chosenIds[i],
      mirrorHands,

      model: modelKey || null,
      seed: seedNum + i,
      debug: debug === true,
      preferTrending: preferTrendingFlag,

      complexity: complexityNorm, // ✅ PASS THROUGH
    });

    if (!firstResolved && one?.meta?.resolved) firstResolved = one.meta.resolved;
    designs.push(one?.nailDesign || null);
  }

  const main = designs[0] || null;
  const variants = designs.slice(1).filter(Boolean);

  const actuallyReturned = [
    main?.templateId || null,
    ...variants.map((v) => v?.templateId || null),
  ];

  // ---------- 6) optional debug ----------
  let debugBlock = null;
  if (debug === true) {
    const lookup = buildLookup(Array.isArray(templates) ? templates : []);
    debugBlock = {
      selectedTemplates: chosenIds.map((id) => debugInfoForId(lookup, id)),
      debugCatalogSource: fallbackSource || null,
    };
  }

  return {
    prompt: safePrompt,
    nailDesign: main,
    variants,
    meta: {
      mode: 'variants',
      serviceVersion: typeof SERVICE_VERSION !== 'undefined' ? SERVICE_VERSION : 'unknown',
      serviceFile: __filename,

      resolved: firstResolved || { shape, length },

      count: n,
      seed: seedNum,
      mirrorHands: mirrorHands === true,

      model: modelKey || null,
      preferTrending: preferTrendingFlag,

      // ✅ keep complexity visible at the batch level
      complexity: complexityNorm,

      lockTemplate: lockedTemplateId != null,
      lockedTemplateId: lockedTemplateId || null,

      candidateIdsLen: candidateIds.length,
      chosenTemplateIds: chosenIds,
      actuallyReturnedTemplateIds: actuallyReturned,
      fallbackSource: fallbackSource || null,

      topCandidates: (Array.isArray(candidates) ? candidates : []).map((c) => ({
        id: c?.id,
        score: c?.score,
        complexity: c?.complexity,
      })),

      ...(debug === true ? { debug: debugBlock } : {}),
    },
  };
}

function tokenizePrompt(promptLower) {
  return new Set(
    (promptLower || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
  );
}

function scoreByTagOverlap(docTags, promptTokens) {
  const tags = Array.isArray(docTags) ? docTags : [];
  let score = 0;

  for (const raw of tags) {
    const tag = (raw || '').toString().toLowerCase().trim();
    if (!tag) continue;

    // Give points if the tag appears as a whole token
    if (promptTokens.has(tag)) score += 5;

    // Also allow multi-word tags like "hot pink"
    if (tag.includes(' ') && Array.from(promptTokens).join(' ').includes(tag)) score += 4;

    // Small partial match fallback
    for (const tok of promptTokens) {
      if (tok.length >= 4 && tag.includes(tok)) { score += 1; break; }
    }
  }

  return score;
}

function pickBestRanked(docs, promptTokens, { excludeId = null } = {}) {
  if (!Array.isArray(docs) || docs.length === 0) return null;

  const scored = docs.map((d) => ({
    doc: d,
    id: d?.id || d?.patternRef || d?.patternId || null,
    score: scoreByTagOverlap(d?.tags, promptTokens),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Return best that isn't excluded
  for (const s of scored) {
    if (!s.id) continue;
    if (excludeId && s.id === excludeId) continue;
    if (s.score <= 0) break; // stop if nothing matches prompt at all
    return s.doc;
  }

  return null;
}

// ---------------------------
// Public export: single + variants + combined
// ---------------------------
exports.generateDesign = async ({
  prompt,
  shapeOverride,
  lengthOverride,
  templateId,
  mirrorHands,
  count,
  seed,
}) => {
  const safePrompt = (prompt || '').toString().trim();
  const promptLower = safePrompt.toLowerCase();

  // hard clamp 1..10
  const n = Math.max(1, Math.min(Number(count || 1), 10));
  const seedNum = Number.isFinite(Number(seed)) ? Number(seed) : Date.now();
  const rand = mulberry32(seedNum);

  // ✅ SINGLE
  if (n === 1) {
    return generateOneDesign({
      prompt: safePrompt,
      shapeOverride,
      lengthOverride,
      templateId,
      mirrorHands,
    });
  }

  // ✅ VARIANTS (+ combined mirrorHands if true)
  let templates = [];
  try {
    templates = getCollection('finger_templates');
  } catch (e) {
    console.warn('⚠️ finger_templates load failed:', e.message);
  }

  const { shape, length } = resolveShapeLength({ promptLower, shapeOverride, lengthOverride });

  const candidates = getTopTemplateCandidates({
    templates,
    shape,
    length,
    promptLower,
    limit: Math.max(5, n),
  });

  // Fallback: if no candidates, just repeat the same logic n times
  if (candidates.length === 0) {
    const designs = [];
    for (let i = 0; i < n; i++) {
      const one = await generateOneDesign({
        prompt: safePrompt,
        shapeOverride,
        lengthOverride,
        templateId,
        mirrorHands,
      });
      designs.push(one.nailDesign);
    }

    return {
      prompt: safePrompt,
      nailDesign: designs[0],
      variants: designs.slice(1),
      meta: {
        mode: 'variants',
        serviceVersion: SERVICE_VERSION,
        serviceFile: __filename,
        resolved: { shape, length },
        count: n,
        seed: seedNum,
        mirrorHands: mirrorHands === true,
        topCandidates: [],
        fallback: true,
      },
    };
  }

  // Choose template ids per variant to diversify deterministically
  const designs = [];
  for (let i = 0; i < n; i++) {
    // Spread across candidates + small deterministic jitter
    const baseIdx = i % candidates.length;
    const jitter = Math.floor(rand() * Math.min(3, candidates.length));
    const pickIdx = Math.min(candidates.length - 1, baseIdx + jitter);

    const chosenId = (templateId || candidates[pickIdx].id);

    const one = await generateOneDesign({
      prompt: safePrompt,
      shapeOverride,
      lengthOverride,
      templateId: chosenId,
      mirrorHands, // ✅ this is the “combined mode” part (applies to each variant)
    });

    designs.push(one.nailDesign);
  }

  return {
    prompt: safePrompt,
    nailDesign: designs[0],
    variants: designs.slice(1),
    meta: {
      mode: 'variants',
      serviceVersion: SERVICE_VERSION,
      serviceFile: __filename,
      resolved: { shape, length },
      count: n,
      seed: seedNum,
      mirrorHands: mirrorHands === true, // ✅ combined indicator
      topCandidates: candidates.map((c) => ({
        id: c.id,
        score: c.score,
        complexity: c.complexity,
      })),
    },
  };
};

// In nailAssistantService.js
const crypto = require('crypto');

const genId = () =>
  (typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`);

const nowIso = () => new Date().toISOString();

const ALLOWED_COMPLEXITY = new Set(['low', 'medium', 'complex']);
function normalizeComplexity(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s || ['auto', 'any', 'default', 'detect', 'none', 'null'].includes(s)) return null;
  return ALLOWED_COMPLEXITY.has(s) ? s : null;
}

function inferComplexityFromModel(model) {
  const m = String(model || '').trim().toLowerCase();
  if (m === 'couture') return 'complex';
  if (m === 'iconic') return 'medium';
  if (m === 'muse' || m === 'curated') return 'medium';
  return 'medium';
}

async function generateDesign(input = {}) {
  const body =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  const mode = String(body.mode ?? '').trim().toLowerCase();
  const isVariants = mode === 'variants' || body.variants === true;

  const prompt = String(body.prompt ?? body.text ?? '').trim();

  const shapeOverride = body.shapeOverride ?? body.shape ?? null;
  const lengthOverride = body.lengthOverride ?? body.length ?? null;

  const mirrorHands = body.mirrorHands === true;

  const templateId =
    body.templateId != null ? String(body.templateId).trim() : null;

  const lockTemplate = body.lockTemplate === true;

  // ✅ complexity (low|medium|complex) — allow null/"auto"
  const complexityRaw = body.complexity ?? null;
  const complexity = String(complexityRaw ?? '').trim().toLowerCase();
  const complexityNorm = ['low', 'medium', 'complex'].includes(complexity)
    ? complexity
    : null;

  // sensible defaults
  const countRaw = body.count ?? body.n ?? 5;

  // if caller didn't provide seed, default to Date.now() so UX varies
  const seedRaw = body.seed ?? Date.now();

  const count = Math.max(
    1,
    Number.isFinite(Number(countRaw)) ? Number(countRaw) : 5
  );
  const seed = Number.isFinite(Number(seedRaw)) ? Number(seedRaw) : Date.now();

  if (!prompt) {
    return {
      prompt,
      nailDesign: null,
      variants: [],
      meta: {
        mode: isVariants ? 'variants' : 'single',
        serviceVersion:
          typeof SERVICE_VERSION !== 'undefined' ? SERVICE_VERSION : 'unknown',
        serviceFile: __filename,
        seed: isVariants ? seed : null,
        mirrorHands,
        model: body.model ?? null,
        complexity: complexityNorm,
      },
      error: 'Prompt is required',
    };
  }

  // ✅ OpenAI (safe): run once per request
  let llm = null;
  try {
    const r = await runNailAssistantLLM({ prompt });
    if (r?.ok) llm = r;
  } catch (e) {
    llm = { ok: false, reason: e?.message || 'openai_error' };
  }

  if (isVariants) {
    // ✅ Only lock variants if lockTemplate === true
    const templateIdForVariants = lockTemplate ? templateId : null;

    const result = await generateVariants({
      prompt,
      shapeOverride,
      lengthOverride,
      model: body.model ?? null,
      templateId: templateIdForVariants,
      mirrorHands,
      count,
      seed,
      lockTemplate,
      complexity: complexityNorm, // ✅ pass through
      llm: llm?.json ?? null,     // safe if ignored
      debug: body.debug === true,
      preferTrending: body.preferTrending ?? null,
    });

    // attach OpenAI info to meta (non-breaking)
    if (result?.meta) {
      result.meta.openai = llm
        ? { ok: !!llm.ok, model: llm.model || null, data: llm.json || null }
        : { ok: false, model: null, data: null };

      if (complexityNorm) result.meta.complexity = complexityNorm;
    }
    return result;
  }

  // single
  const one = await generateOneDesign({
    prompt,
    shapeOverride,
    lengthOverride,
    templateId: templateId || null,
    mirrorHands,
    complexity: complexityNorm, // ✅ pass through
    llm: llm?.json ?? null,     // safe if ignored
    model: body.model ?? null,
    seed,
    debug: body.debug === true,
    preferTrending: body.preferTrending ?? null,
  });

  // attach OpenAI info to meta (non-breaking)
  if (one?.meta) {
    one.meta.openai = llm
      ? { ok: !!llm.ok, model: llm.model || null, data: llm.json || null }
      : { ok: false, model: null, data: null };

    if (complexityNorm) one.meta.complexity = complexityNorm;
  }

  return one;
}


module.exports.generateDesign = generateDesign;


module.exports = { generateDesign };




exports.SERVICE_VERSION = SERVICE_VERSION;
exports.generateDesign = generateDesign;
exports.generateOneDesign = generateOneDesign;
exports.generateVariants = generateVariants;






