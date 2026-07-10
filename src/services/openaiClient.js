// src/services/openaiClient.js
const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

function safeArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean);
}

function normalizeShape(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['square', 'coffin', 'almond', 'stiletto', 'oval', 'round', 'duck'].includes(s)) return s;
  if (s === 'ballerina') return 'coffin';
  return null;
}

function normalizeLength(v) {
  const s = String(v || '').trim().toLowerCase().replace(/-/g, '_');
  if (['short', 'medium', 'long', 'extra_long'].includes(s)) return s;
  if (['xl', 'x_long', 'extra long', 'extra-long'].includes(s)) return 'extra_long';
  return null;
}

function normalizeComplexity(v) {
  const s = String(v || '').trim().toLowerCase();

  // User-facing names
  if (s === 'basic') return 'low';
  if (s === 'glam') return 'medium';
  if (s === 'extra') return 'complex';

  // Existing backend names
  if (['low', 'medium', 'complex'].includes(s)) return s;

  return null;
}

function complexityLabelFromBackend(v) {
  if (v === 'low') return 'basic';
  if (v === 'medium') return 'glam';
  if (v === 'complex') return 'extra';
  return null;
}

function normalizeFinish(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['glossy', 'matte', 'glitter', 'metallic'].includes(s)) return s;
  if (['shiny', 'gloss'].includes(s)) return 'glossy';
  if (['chrome', 'gold', 'silver'].includes(s)) return 'metallic';
  return null;
}

function normalizeColorFamilies(arr) {
  const map = {
    // Pinks
    pink: 'pinks',
    hot_pink: 'pinks',
    baby_pink: 'pinks',
    blush: 'pinks',
    rose: 'pinks',
    rosy: 'pinks',
    fuchsia: 'pinks',
    magenta: 'pinks',
    mauve: 'pinks',
    bubblegum: 'pinks',
    salmon: 'pinks',
    coral: 'pinks',

    // Reds
    red: 'reds',
    cherry: 'reds',
    burgundy: 'reds',
    wine: 'reds',
    maroon: 'reds',
    crimson: 'reds',
    ruby: 'reds',
    scarlet: 'reds',

    // Oranges
    orange: 'oranges',
    peach: 'oranges',
    apricot: 'oranges',
    tangerine: 'oranges',
    terracotta: 'oranges',
    rust: 'oranges',
    burnt_orange: 'oranges',

    // Yellows
    yellow: 'yellows',
    lemon: 'yellows',
    butter: 'yellows',
    mustard: 'yellows',
    honey: 'yellows',

    // Greens
    green: 'greens',
    lime: 'greens',
    mint: 'greens',
    sage: 'greens',
    olive: 'greens',
    emerald: 'greens',
    forest: 'greens',
    neon_green: 'greens',

    // Blues
    blue: 'blues',
    baby_blue: 'blues',
    sky_blue: 'blues',
    navy: 'blues',
    royal_blue: 'blues',
    cobalt: 'blues',
    teal: 'blues',
    turquoise: 'blues',
    aqua: 'blues',
    aquamarine: 'blues',

    // Purples
    purple: 'purples',
    lavender: 'purples',
    lilac: 'purples',
    violet: 'purples',
    plum: 'purples',
    grape: 'purples',
    periwinkle: 'purples',

    // Browns
    brown: 'browns',
    chocolate: 'browns',
    mocha: 'browns',
    coffee: 'browns',
    caramel: 'browns',
    camel: 'browns',
    taupe: 'browns',
    espresso: 'browns',

    // Neutrals
    nude: 'neutrals',
    neutral: 'neutrals',
    beige: 'neutrals',
    tan: 'neutrals',
    cream: 'neutrals',
    ivory: 'neutrals',
    off_white: 'neutrals',
    vanilla: 'neutrals',
    champagne: 'neutrals',
    sand: 'neutrals',

    // White still belongs to neutrals,
    // but colorMatcher should later prioritize name contains "white"
    white: 'neutrals',
    pearl: 'neutrals',

    // Blacks & grays
    black: 'blacks & grays',
    gray: 'blacks & grays',
    grey: 'blacks & grays',
    charcoal: 'blacks & grays',
    slate: 'blacks & grays',
    smoke: 'blacks & grays',
    silver_gray: 'blacks & grays',

    // Metallics
    gold: 'metallics',
    golden: 'metallics',
    silver: 'metallics',
    chrome: 'metallics',
    metallic: 'metallics',
    bronze: 'metallics',
    copper: 'metallics',
    rose_gold: 'metallics',

    // Clear / sheer
    clear: 'clear',
    sheer: 'sheer',
    jelly: 'jelly',
  };

  const out = new Set();

  for (const raw of safeArray(arr)) {
    const key = raw
      .replace(/-/g, '_')
      .replace(/\s+/g, '_')
      .trim();

    out.add(map[key] || raw);
  }

  return Array.from(out);
}

function fallbackIntentFromPrompt(prompt) {
  const p = String(prompt || '').toLowerCase();

  let shape = null;
  if (p.includes('coffin') || p.includes('ballerina')) shape = 'ballerina';
  else if (p.includes('stiletto')) shape = 'stiletto';
  else if (p.includes('almond')) shape = 'almond';
  else if (p.includes('oval')) shape = 'oval';
  else if (p.includes('square_mooncut')) shape = 'square_mooncut';
  else if (p.includes('ballerina_mooncut')) shape = 'ballerina_mooncut';
  else if (p.includes('duck_mooncut')) shape = 'duck_mooncut';
  else if (p.includes('lipstick_right')) shape = 'lipstick_right';
  else if (p.includes('lipstick_left')) shape = 'lipstick_left';
  else if (p.includes('duck')) shape = 'duck';
  else if (p.includes('square')) shape = 'square';

  let length = null;
  if (p.includes('extra long') || p.includes('extra-long') || p.includes('xl')) length = 'extra_long';
  else if (p.includes('long')) length = 'long';
  else if (p.includes('short')) length = 'short';
  else if (p.includes('medium')) length = 'medium';
  else if (p.includes('extra_short')) length = 'extra_short';

  let complexity = null;
  if (p.includes('basic') || p.includes('simple') || p.includes('minimal')) complexity = 'low';
  else if (p.includes('glam') || p.includes('cute glam')) complexity = 'medium';
  else if (p.includes('extra') || p.includes('maximal') || p.includes('each finger')) complexity = 'complex';

  const primaryKeywords = [];
  const secondaryKeywords = [];
  const colorFamilies = [];
  const charmKeywords = [];
  const patternKeywords = [];
  const styleTags = [];

  const addIf = (condition, arr, value) => {
    if (condition) arr.push(value);
  };

  addIf(p.includes('french'), primaryKeywords, 'french tip');
  addIf(p.includes('deep u'), primaryKeywords, 'deep u');
  addIf(p.includes('v cut') || p.includes('v-cut') || p.includes('chevron'), primaryKeywords, 'v cut');
  addIf(p.includes('zebra'), patternKeywords, 'zebra');
  addIf(p.includes('cheetah'), patternKeywords, 'cheetah');
  addIf(p.includes('leopard'), patternKeywords, 'leopard');
  addIf(p.includes('animal print'), patternKeywords, 'animal print');

  addIf(p.includes('bling'), charmKeywords, 'bling');
  addIf(p.includes('rhinestone'), charmKeywords, 'rhinestone');
  addIf(p.includes('sparkly') || p.includes('sparkle'), charmKeywords, 'crystal');
  addIf(p.includes('bow'), charmKeywords, 'bow');
  addIf(p.includes('heart'), charmKeywords, 'heart');
  addIf(p.includes('pearl'), charmKeywords, 'pearl');
  addIf(p.includes('gold'), charmKeywords, 'gold');
  addIf(p.includes('silver'), charmKeywords, 'silver');

  addIf(p.includes('coquette'), styleTags, 'coquette');
  addIf(p.includes('goth'), styleTags, 'goth');
  addIf(p.includes('luxury'), styleTags, 'luxury');
  addIf(p.includes('cute'), styleTags, 'cute');

  addIf(p.includes('pink'), colorFamilies, 'pinks');
  addIf(p.includes('red'), colorFamilies, 'reds');
  addIf(p.includes('black'), colorFamilies, 'blacks & grays');
  addIf(p.includes('white'), colorFamilies, 'whites');
  addIf(p.includes('nude'), colorFamilies, 'neutrals');
  addIf(p.includes('gold') || p.includes('silver') || p.includes('chrome'), colorFamilies, 'metallics');
  

  let finish = null;
  if (p.includes('matte')) finish = 'matte';
  else if (p.includes('glitter')) finish = 'glitter';
  else if (p.includes('chrome') || p.includes('metallic')) finish = 'metallic';
  else if (p.includes('glossy') || p.includes('shiny')) finish = 'glossy';

  const allKeywords = Array.from(new Set([
    ...primaryKeywords,
    ...secondaryKeywords,
    ...patternKeywords,
    ...charmKeywords,
    ...styleTags,
  ]));

  if (p.includes('red') && p.includes('glitter')) {
    required.push('red glitter');
    colorFamilies.push('reds');
    finish = 'glitter';
  }

  if (p.includes('zebra')) {
    required.push('zebra');
    patternKeywords.push('zebra');
    secondaryKeywords.push('animal print');
  } 

  if (p.includes('cherry')) {
    required.push('cherry charm');
    charmKeywords.push('cherry');
  }

  return {
    shape,
    length,
    complexity,
    complexityLabel: complexityLabelFromBackend(complexity),
    mirrorHands: null,
    primaryKeywords,
    secondaryKeywords,
    allKeywords,
    required,
    highPriority,
    preferred,
    optional,
    specificColorNames: [],
    specificCharmNames: [],
    specificPatternNames: [],
    specificStampNames: [],
    specificFrenchTipStyle: null,
    colorFamilies,
    finish,
    styleTags,
    charmKeywords,
    patternKeywords,
    frenchTipStyle: p.includes('deep u') ? 'deep_u' : p.includes('v cut') || p.includes('v-cut') ? 'v_cut' : p.includes('french') ? 'classic_u' : null,
    hydrationTargets: [],
    themeKeywords: allKeywords,
    colorHints: colorFamilies,
    motifs: [...patternKeywords, ...charmKeywords],
    finishes: finish ? [finish] : [],
    vibe: styleTags[0] || '',
  };
}

function normalizeIntent(json, prompt) {
  const fallback = fallbackIntentFromPrompt(prompt);

  const required = safeArray(json.required);
  const highPriority = safeArray(json.highPriority);
  const preferred = safeArray(json.preferred);
  const optional = safeArray(json.optional);

  const complexity = normalizeComplexity(json.complexity) || fallback.complexity;
  const finish = normalizeFinish(json.finish) || fallback.finish;

  const primaryKeywords = safeArray(json.primaryKeywords).length
    ? safeArray(json.primaryKeywords)
    : fallback.primaryKeywords;

  const secondaryKeywords = safeArray(json.secondaryKeywords).length
    ? safeArray(json.secondaryKeywords)
    : fallback.secondaryKeywords;

  const styleTags = safeArray(json.styleTags).length
    ? safeArray(json.styleTags)
    : fallback.styleTags;

  const charmKeywords = safeArray(json.charmKeywords).length
    ? safeArray(json.charmKeywords)
    : fallback.charmKeywords;

  const patternKeywords = safeArray(json.patternKeywords).length
    ? safeArray(json.patternKeywords)
    : fallback.patternKeywords;

  const allKeywords = Array.from(new Set([
    ...required,
    ...highPriority,
    ...preferred,
    ...optional,
    ...primaryKeywords,
    ...secondaryKeywords,
    ...styleTags,
    ...charmKeywords,
    ...patternKeywords,
    ...safeArray(json.synonyms),
  ]));

  const colorFamilies = normalizeColorFamilies(
    safeArray(json.colorFamilies).length ? json.colorFamilies : fallback.colorFamilies
  );

  return {
    shape: normalizeShape(json.shape) || fallback.shape,
    length: normalizeLength(json.length) || fallback.length,

    // Backend-safe complexity
    complexity,

    // Human-friendly label for debugging
    complexityLabel: complexityLabelFromBackend(complexity),

    mirrorHands:
      typeof json.mirrorHands === 'boolean'
        ? json.mirrorHands
        : fallback.mirrorHands,

    primaryKeywords,
    secondaryKeywords,
    synonyms: safeArray(json.synonyms),
    allKeywords,

    required,
    highPriority,
    preferred,
    optional,

    colorFamilies,
    finish,

    styleTags,
    charmKeywords,
    patternKeywords,

    frenchTipStyle:
      String(json.frenchTipStyle || fallback.frenchTipStyle || '').trim().toLowerCase() || null,

    hydrationTargets: safeArray(json.hydrationTargets),

    // Legacy fields so current code does not break yet
    themeKeywords: allKeywords,
    colorHints: colorFamilies,
    motifs: Array.from(new Set([...patternKeywords, ...charmKeywords])),
    finishes: finish ? [finish] : [],
    vibe: styleTags[0] || json.vibe || fallback.vibe || '',
  };
}

async function runNailAssistantLLM({ prompt }) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      reason: 'OPENAI_API_KEY missing',
      json: fallbackIntentFromPrompt(prompt),
    };
  }

  const system = `
You are Nailzotica AI Nail Assistant.

Return JSON only. No markdown. No extra commentary.

Your job is to extract nail-design intent from the user's prompt.

Use this exact schema:
{
  "shape": string|null,
  "length": string|null,
  "complexity": string|null,
  "mirrorHands": boolean|null,

  "required": string[],
  "highPriority": string[],
  "preferred": string[],
  "optional": string[],

  "primaryKeywords": string[],
  "secondaryKeywords": string[],
  "synonyms": string[],

  "colorFamilies": string[],
  "specificColorNames": string[],
  "finish": string|null,

  "styleTags": string[],
  "charmKeywords": string[],
  "specificCharmNames": string[],
  "patternKeywords": string[],
  "specificPatternNames": string[],

  "frenchTipStyle": string|null,
  "specificFrenchTipStyle": string|null,
  "hydrationTargets": string[],

  "vibe": string,
}

Allowed shape values:
square, ballerina, lipstick_left, lipstick_right, almond, stiletto, oval, duck, square_mooncut_ ballerina_mooncut, duck_mooncut

Allowed length values:
extra_short, short, medium, long, extra_long

Allowed complexity values:
basic, glam, extra

Important complexity meaning:
basic = simple, 1-2 accent fingers, cleaner design
glam = more decorated, 3-5 template variety
extra = maximal, every finger can be unique

Allowed finish values:
glossy, matte, glitter, metallic

Color family examples:
pinks, reds, blues, greens, purples, yellows, oranges, browns, neutrals, whites, blacks & grays, metallics

French tip style examples:
classic_u, deep_u, v_cut, straight

Rules:
- If user says "sparkly", include synonyms like bling, rhinestone, crystal, gem.
- If user says "animal print", include zebra, cheetah, leopard only if appropriate.
- If user says "coquette", include bow, pearl, heart, ribbon if appropriate.
- If user says gold or silver, include metallics in colorFamilies and include gold/silver in charmKeywords.
- Do not invent a shape or length if user did not mention one. Defaults happen in code later.
- Put the most important visual concepts in primaryKeywords.
- Put related/supporting concepts in secondaryKeywords.
- hydrationTargets should include any of: base, french_tip, paint_layers, patterns, stamps, charms.
- required = things the user clearly requested and the design should not compromise on, especially shape, length, specific print, specific charm type, or specific color/finish combo.
- highPriority = very important visual ideas, but slightly less strict than required.
- preferred = nice-to-have details.
- optional = weak related ideas that can help scoring but should not overpower exact matches.
- Do not put broad related terms like "animal print" in required if the user specifically asked for "zebra".
- If user asks for "zebra", required should include "zebra"; optional may include "animal print".
- If user asks for, for example, "red glitter", required should include "red glitter"; colorFamilies should include "reds"; finish should be "glitter".
- If user asks for "gold cherry charms", for example, required should include "cherry charm" and "gold"; charmKeywords should include "cherry" and "gold".
`.trim();

  try {
    const resp = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    });

    const text = resp.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }

    const json = normalizeIntent(parsed, prompt);

    return {
      ok: true,
      model: MODEL,
      json,
    };
  } catch (error) {
    console.warn('⚠️ runNailAssistantLLM failed, using fallback parser:', error?.message || error);

    return {
      ok: false,
      reason: error?.message || 'OpenAI request failed',
      model: MODEL,
      json: fallbackIntentFromPrompt(prompt),
    };
  }
}

module.exports = {
  runNailAssistantLLM,
};