// src/domain/matchers/patternMatcher.js

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function tokenizePrompt(prompt) {
  const synonyms = {
    flowers: 'floral',
    flower: 'floral',
    florals: 'floral',
    plaid: 'tartan',
    checkered: 'checker',
    checkers: 'checker',
    dots: 'dot',
    polka: 'dot',
    stripes: 'stripe',
    snakeskin: 'snake',
    leopardprint: 'leopard',
    cowprint: 'cow',
  };

  return norm(prompt)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => synonyms[t] || t)
    .filter((t) => t.length >= 3);
}

function patternId(pattern) {
  return String(
    pattern?.patternId ||
      pattern?.id ||
      pattern?.docId ||
      ''
  ).trim();
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

function scorePattern(pattern, promptTokens, promptLower) {
  if (!pattern) return -999999;
  if (pattern.isAvailable === false) return -999999;

  const text = patternSearchText(pattern);
  let score = 0;

  for (const token of promptTokens) {
    if (text.split(/\s+/).includes(token)) score += 8;
    else if (text.includes(token)) score += 3;
  }

  if (promptLower.includes('animal print')) {
    if (
      text.includes('animal') ||
      text.includes('leopard') ||
      text.includes('zebra') ||
      text.includes('cow') ||
      text.includes('snake')
    ) {
      score += 12;
    }
  }

  if (promptLower.includes('floral') || promptLower.includes('flower')) {
    if (text.includes('floral') || text.includes('flower')) score += 12;
  }

  if (promptLower.includes('checker') || promptLower.includes('checkered')) {
    if (text.includes('checker') || text.includes('checkered')) score += 12;
  }

  if (promptLower.includes('stripe')) {
    if (text.includes('stripe')) score += 10;
  }

  if (promptLower.includes('dot') || promptLower.includes('polka')) {
    if (text.includes('dot') || text.includes('polka')) score += 10;
  }

  if (pattern.isTrending === true) score += 1.5;
  if (pattern.isNew === true) score += 1;

  const trend = Number(pattern.trendingScore);
  if (Number.isFinite(trend)) score += Math.min(5, trend / 20);

  return score;
}

function pickMatchingPattern({
  prompt,
  patterns,
  variantIndex = 0,
  excludeIds = [],
}) {
  const list = Array.isArray(patterns) ? patterns : [];
  if (!list.length) return null;

  const promptLower = norm(prompt);
  const promptTokens = tokenizePrompt(promptLower);
  const excluded = new Set((excludeIds || []).map(String));

  const scored = list
    .map((pattern) => ({
      pattern,
      id: patternId(pattern),
      score: scorePattern(pattern, promptTokens, promptLower),
    }))
    .filter((x) => x.id && !excluded.has(x.id) && x.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });

  if (!scored.length) return null;

  const topPool = scored.slice(0, Math.min(8, scored.length));
  return topPool[variantIndex % topPool.length]?.pattern || null;
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

function promptWantsPattern(prompt) {
  const p = norm(prompt);

  return (
    p.includes('pattern') ||
    p.includes('print') ||
    p.includes('floral') ||
    p.includes('flower') ||
    p.includes('checker') ||
    p.includes('checkered') ||
    p.includes('stripe') ||
    p.includes('dot') ||
    p.includes('polka') ||
    p.includes('leopard') ||
    p.includes('zebra') ||
    p.includes('cow') ||
    p.includes('snake') ||
    p.includes('plaid') ||
    p.includes('tartan') ||
    p.includes('marble') ||
    p.includes('camo')
  );
}

function promptWantsPatternInsideFrench(prompt) {
  const p = norm(prompt);

  const hasFrench =
    p.includes('french') ||
    p.includes('french tip') ||
    p.includes('tip');

  const hasPattern = promptWantsPattern(p);

  return hasFrench && hasPattern;
}

function applyPromptPatternToFinger({
  finger,
  prompt,
  patterns,
  variantIndex = 0,
}) {
  if (!finger) return finger;
  if (!promptWantsPattern(prompt)) return finger;

  const matchedPattern = pickMatchingPattern({
    prompt,
    patterns,
    variantIndex,
  });

  if (!matchedPattern) return finger;

  const layers = Array.isArray(finger.layers) ? [...finger.layers] : [];

  if (promptWantsPatternInsideFrench(prompt)) {
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
  pickMatchingPattern,
  buildPatternLayerFromDoc,
  promptWantsPattern,
  promptWantsPatternInsideFrench,
  applyPromptPatternToFinger,
};