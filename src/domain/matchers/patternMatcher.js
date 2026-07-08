// src/domain/matchers/patternMatcher.js

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function patternId(pattern) {
  return String(pattern?.patternId || pattern?.id || pattern?.docId || '').trim();
}

function patternSearchText(pattern) {
  return [
    pattern?.patternId,
    pattern?.name,
    pattern?.description,
    pattern?.aiPrompt,
    ...arr(pattern?.tags),
    ...arr(pattern?.categories),
    ...arr(pattern?.subcategories),
  ]
    .map(norm)
    .filter(Boolean)
    .join(' ');
}

function buildPatternIntent(promptOrIntent) {
  const isObj =
    promptOrIntent &&
    typeof promptOrIntent === 'object' &&
    !Array.isArray(promptOrIntent);

  const prompt = isObj
    ? String(promptOrIntent.prompt || promptOrIntent.rawPrompt || '')
    : String(promptOrIntent || '');

  const p = norm(prompt);

  const keywords = new Set();
  const specificPatternNames = new Set();

  const pushArr = (items) => {
    for (const item of arr(items)) {
      const s = norm(item);
      if (s) keywords.add(s);
    }
  };

  if (isObj) {
    pushArr(promptOrIntent.patternKeywords);
    pushArr(promptOrIntent.primaryKeywords);
    pushArr(promptOrIntent.secondaryKeywords);
    pushArr(promptOrIntent.synonyms);
    pushArr(promptOrIntent.themeKeywords);
    pushArr(promptOrIntent.motifs);

    for (const item of arr(promptOrIntent.specificPatternNames)) {
      const s = norm(item);
      if (s) specificPatternNames.add(s);
    }
  }

  const synonymGroups = {
    zebra: ['zebra', 'animal print', 'print'],
    cheetah: ['cheetah', 'leopard', 'animal print', 'print'],
    leopard: ['leopard', 'cheetah', 'animal print', 'print'],
    cow: ['cow', 'cow print', 'animal print', 'print'],
    snake: ['snake', 'snakeskin', 'animal print', 'print'],
    snakeskin: ['snake', 'snakeskin', 'animal print', 'print'],

    floral: ['floral', 'flower', 'flowers'],
    flower: ['floral', 'flower', 'flowers'],

    checker: ['checker', 'checkered', 'checkers', 'plaid'],
    checkered: ['checker', 'checkered', 'checkers'],
    plaid: ['plaid', 'tartan', 'checker'],

    dot: ['dot', 'dots', 'polka dot', 'polka dots'],
    polka: ['dot', 'dots', 'polka dot', 'polka dots'],

    stripe: ['stripe', 'stripes', 'striped'],
    marble: ['marble', 'stone'],
    camo: ['camo', 'camouflage'],
  };

  for (const [trigger, words] of Object.entries(synonymGroups)) {
    if (p.includes(trigger)) {
      for (const w of words) keywords.add(w);
    }
  }

  const directWords = [
    'zebra',
    'cheetah',
    'leopard',
    'animal print',
    'cow print',
    'snake',
    'snakeskin',
    'floral',
    'flower',
    'checker',
    'checkered',
    'plaid',
    'tartan',
    'stripe',
    'stripes',
    'dot',
    'polka',
    'marble',
    'camo',
    'camouflage',
  ];

  for (const word of directWords) {
    if (p.includes(word)) keywords.add(word);
  }

  const phraseCandidates = [
    'zebra print',
    'cheetah print',
    'leopard print',
    'cow print',
    'snake print',
    'polka dot',
    'polka dots',
    'floral print',
    'checker print',
    'checkerboard',
  ];

  for (const phrase of phraseCandidates) {
    if (p.includes(phrase)) specificPatternNames.add(phrase);
  }

  return {
    prompt: p,
    keywords: Array.from(keywords),
    specificPatternNames: Array.from(specificPatternNames),
  };
}

function scorePattern(pattern, intent) {
  if (!pattern) return -999999;
  if (pattern.isAvailable === false) return -999999;

  const text = patternSearchText(pattern);
  const name = norm(pattern.name);
  const tags = arr(pattern.tags).map(norm);
  const tagSet = new Set(tags);

  let score = 0;

  for (const specific of intent.specificPatternNames) {
    if (name === specific) score += 60;
    else if (name.includes(specific)) score += 40;
    else if (text.includes(specific)) score += 20;
  }

  for (const keyword of intent.keywords) {
    if (!keyword) continue;

    if (name.includes(keyword)) score += 16;
    if (tagSet.has(keyword)) score += 12;
    else if (tags.some((t) => t.includes(keyword) || keyword.includes(t))) score += 5;
    else if (text.includes(keyword)) score += 3;
  }

  if (intent.prompt.includes('animal print')) {
    if (
      text.includes('animal') ||
      text.includes('leopard') ||
      text.includes('zebra') ||
      text.includes('cheetah') ||
      text.includes('cow') ||
      text.includes('snake')
    ) {
      score += 16;
    }
  }

  if (intent.prompt.includes('zebra') && text.includes('zebra')) score += 20;
  if (intent.prompt.includes('cheetah') && text.includes('cheetah')) score += 20;
  if (intent.prompt.includes('leopard') && text.includes('leopard')) score += 20;
  if (intent.prompt.includes('floral') || intent.prompt.includes('flower')) {
    if (text.includes('floral') || text.includes('flower')) score += 14;
  }

  if (pattern.isTrending === true) score += 1.5;
  if (pattern.isNew === true) score += 1;

  const trend = Number(pattern.trendingScore);
  if (Number.isFinite(trend)) score += Math.min(5, trend / 20);

  return score;
}

function pickMatchingPattern({
  prompt,
  intent = null,
  patterns,
  variantIndex = 0,
  excludeIds = [],
}) {
  const list = Array.isArray(patterns) ? patterns : [];
  if (!list.length) return null;

  const patternIntent = buildPatternIntent(intent || prompt);
  const excluded = new Set((excludeIds || []).map(String));

  const scored = list
    .map((pattern) => ({
      pattern,
      id: patternId(pattern),
      score: scorePattern(pattern, patternIntent),
    }))
    .filter((x) => x.id && !excluded.has(x.id) && x.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });

  if (!scored.length) return null;

  const topPool = scored.slice(0, Math.min(10, scored.length));
  const picked = topPool[variantIndex % topPool.length];

  console.log('🖼️ pickMatchingPattern:', {
    intent: patternIntent,
    picked: picked
      ? {
          id: picked.id,
          name: picked.pattern?.name || null,
          score: picked.score,
        }
      : null,
    top: scored.slice(0, 5).map((x) => ({
      id: x.id,
      name: x.pattern?.name || null,
      score: x.score,
    })),
  });

  return picked?.pattern || null;
}

function buildPatternLayerFromDoc({
  pattern,
  existingLayer = {},
  variantIndex = 0,
  index = 0,
}) {
  if (!pattern) return existingLayer;

  const id = patternId(pattern);
  const now = Date.now();

  return {
    ...existingLayer,
    id: existingLayer.id || `pattern_${id}_${now}_${variantIndex}`,
    type: 'pattern',
    patternId: id,
    patternRef: id,
    name: pattern.name || existingLayer.name || id,
    tags: Array.isArray(pattern.tags) ? pattern.tags : [],

    thumbnailUi:
      pattern.uiThumbnailUrl ||
      pattern.canvasUiUrl ||
      existingLayer.thumbnailUi ||
      '',

    canvasUiUrl:
      pattern.canvasUiUrl ||
      pattern.uiThumbnailUrl ||
      existingLayer.canvasUiUrl ||
      '',

    uiImageUrl:
      pattern.canvasUiUrl ||
      pattern.uiThumbnailUrl ||
      existingLayer.uiImageUrl ||
      '',

    canvasMaskUrl:
      existingLayer.canvasMaskUrl ||
      pattern.canvasMaskUrl ||
      '',

    unityMaskUrl:
      existingLayer.unityMaskUrl ||
      pattern.maskUnityUrl ||
      '',

    visible: true,
    index,

    widthNorm:
      typeof existingLayer.widthNorm === 'number'
        ? existingLayer.widthNorm
        : 1,

    heightNorm:
      typeof existingLayer.heightNorm === 'number'
        ? existingLayer.heightNorm
        : 1,

    x:
      typeof existingLayer.x === 'number'
        ? existingLayer.x
        : 0.5,

    y:
      typeof existingLayer.y === 'number'
        ? existingLayer.y
        : 0.5,

    scale:
      typeof existingLayer.scale === 'number'
        ? existingLayer.scale
        : 1,

    rotation:
      typeof existingLayer.rotation === 'number'
        ? existingLayer.rotation
        : 0,

    opacity:
      typeof existingLayer.opacity === 'number'
        ? existingLayer.opacity
        : 1,
  };
}

function promptWantsPattern(promptOrIntent) {
  const intent = buildPatternIntent(promptOrIntent);
  return intent.keywords.length > 0 || intent.specificPatternNames.length > 0;
}

function promptWantsPatternInsideFrench(promptOrIntent) {
  const isObj =
    promptOrIntent &&
    typeof promptOrIntent === 'object' &&
    !Array.isArray(promptOrIntent);

  const prompt = isObj
    ? String(promptOrIntent.prompt || promptOrIntent.rawPrompt || '')
    : String(promptOrIntent || '');

  const p = norm(prompt);

  const hasFrench =
    p.includes('french') ||
    p.includes('french tip') ||
    p.includes('tip') ||
    norm(isObj ? promptOrIntent.frenchTipStyle : '').length > 0;

  return hasFrench && promptWantsPattern(promptOrIntent);
}

function applyPromptPatternToFinger({
  finger,
  prompt,
  intent = null,
  patterns,
  variantIndex = 0,
}) {
  if (!finger) return finger;

  const patternIntentSource = intent || prompt;

  if (!promptWantsPattern(patternIntentSource)) return finger;

  const matchedPattern = pickMatchingPattern({
    prompt,
    intent,
    patterns,
    variantIndex,
  });

  if (!matchedPattern) return finger;

  const layers = Array.isArray(finger.layers) ? [...finger.layers] : [];

  if (promptWantsPatternInsideFrench(patternIntentSource)) {
    const frenchIndex = layers.findIndex((l) => l?.type === 'french_tip');

    if (frenchIndex >= 0) {
      layers[frenchIndex] = {
        ...layers[frenchIndex],
        pattern: buildPatternLayerFromDoc({
          pattern: matchedPattern,
          existingLayer: layers[frenchIndex].pattern || {},
          variantIndex,
          index: frenchIndex,
        }),
      };

      return {
        ...finger,
        layers,
      };
    }
  }

  const patternLayer = buildPatternLayerFromDoc({
    pattern: matchedPattern,
    variantIndex,
    index: layers.length,
  });

  return {
    ...finger,
    layers: [...layers, patternLayer],
  };
}

module.exports = {
  buildPatternIntent,
  pickMatchingPattern,
  buildPatternLayerFromDoc,
  promptWantsPattern,
  promptWantsPatternInsideFrench,
  applyPromptPatternToFinger,
};