// src/domain/matchers/stampMatcher.js

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function tokenizePrompt(prompt) {
  const synonyms = {
    butterflies: 'butterfly',
    flowers: 'flower',
    florals: 'flower',
    cherries: 'cherry',
    stars: 'star',
    hearts: 'heart',
    bows: 'bow',
    painted: 'art',
    drawing: 'art',
    drawings: 'art',
    decals: 'decal',
  };

  return norm(prompt)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => synonyms[t] || t)
    .filter((t) => t.length >= 3);
}

function stampId(stamp) {
  return String(
    stamp?.stampId ||
      stamp?.id ||
      stamp?.docId ||
      ''
  ).trim();
}

function stampSearchText(stamp) {
  return [
    stamp?.stampId,
    stamp?.name,
    stamp?.description,
    stamp?.aiPrompt,
    ...arr(stamp?.tags),
    ...arr(stamp?.categories),
    ...arr(stamp?.subcategories),
  ]
    .map(norm)
    .filter(Boolean)
    .join(' ');
}

function promptWantsStamp(prompt) {
  const p = norm(prompt);

  return (
    p.includes('stamp') ||
    p.includes('stamped') ||
    p.includes('decal') ||
    p.includes('nail art') ||
    p.includes('painted') ||
    p.includes('drawing') ||
    p.includes('butterfly') ||
    p.includes('flower') ||
    p.includes('cherry') ||
    p.includes('heart') ||
    p.includes('star') ||
    p.includes('bow') ||
    p.includes('moon') ||
    p.includes('cloud') ||
    p.includes('flame') ||
    p.includes('cross') ||
    p.includes('letter') ||
    p.includes('alphabet')
  );
}

function scoreStamp(stamp, promptTokens, promptLower) {
  if (!stamp) return -999999;
  if (stamp.isAvailable === false) return -999999;

  const text = stampSearchText(stamp);
  let score = 0;

  for (const token of promptTokens) {
    if (text.split(/\s+/).includes(token)) score += 8;
    else if (text.includes(token)) score += 3;
  }

  if (promptLower.includes('butterfly') && text.includes('butterfly')) score += 16;
  if (promptLower.includes('flower') && text.includes('flower')) score += 12;
  if (promptLower.includes('heart') && text.includes('heart')) score += 12;
  if (promptLower.includes('star') && text.includes('star')) score += 10;
  if (promptLower.includes('cherry') && text.includes('cherry')) score += 12;
  if (promptLower.includes('bow') && text.includes('bow')) score += 10;
  if (promptLower.includes('letter') && text.includes('letter')) score += 10;
  if (promptLower.includes('alphabet') && text.includes('alphabet')) score += 10;

  if (stamp.isTrending === true) score += 1.5;
  if (stamp.isNew === true) score += 1;

  const trend = Number(stamp.trendingScore);
  if (Number.isFinite(trend)) score += Math.min(5, trend / 20);

  return score;
}

function pickMatchingStamp({
  prompt,
  stamps,
  variantIndex = 0,
  excludeIds = [],
}) {
  const list = Array.isArray(stamps) ? stamps : [];
  if (!list.length) return null;

  const promptLower = norm(prompt);
  const promptTokens = tokenizePrompt(promptLower);
  const excluded = new Set((excludeIds || []).map(String));

  const scored = list
    .map((stamp) => ({
      stamp,
      id: stampId(stamp),
      score: scoreStamp(stamp, promptTokens, promptLower),
    }))
    .filter((x) => x.id && !excluded.has(x.id) && x.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });

  if (!scored.length) return null;

  const topPool = scored.slice(0, Math.min(8, scored.length));
  return topPool[variantIndex % topPool.length]?.stamp || null;
}

function buildStampLayerFromDoc({
  stamp,
  existingLayer = {},
  variantIndex = 0,
  index = 0,
}) {
  if (!stamp) return existingLayer;

  const id = stampId(stamp);
  const now = Date.now();

  return {
    ...existingLayer,
    id: existingLayer.id || `stamp_${id}_${now}_${variantIndex}`,
    type: 'stamp',

    stampId: id,
    stampRef: id,
    assetRef: id,
    name: stamp.name || existingLayer.name || id,
    tags: Array.isArray(stamp.tags) ? stamp.tags : [],

    thumbnailUi:
      stamp.uiThumbnailUrl ||
      stamp.canvasUiUrl ||
      existingLayer.thumbnailUi ||
      '',

    canvasUiUrl:
      stamp.canvasUiUrl ||
      stamp.uiThumbnailUrl ||
      existingLayer.canvasUiUrl ||
      '',

    uiImageUrl:
      stamp.canvasUiUrl ||
      stamp.uiThumbnailUrl ||
      existingLayer.uiImageUrl ||
      '',

    canvasMaskUrl:
      existingLayer.canvasMaskUrl ||
      stamp.canvasMaskUrl ||
      '',

    unityMaskUrl:
      existingLayer.unityMaskUrl ||
      stamp.maskUnityUrl ||
      '',

    visible: true,
    index,

    widthNorm:
      typeof existingLayer.widthNorm === 'number'
        ? existingLayer.widthNorm
        : 0.45,

    heightNorm:
      typeof existingLayer.heightNorm === 'number'
        ? existingLayer.heightNorm
        : 0.45,

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

function applyPromptStampToFinger({
  finger,
  prompt,
  stamps,
  variantIndex = 0,
}) {
  if (!finger) return finger;
  if (!promptWantsStamp(prompt)) return finger;

  const layers = Array.isArray(finger.layers) ? [...finger.layers] : [];
  const usedIds = layers
    .filter((l) => l?.type === 'stamp')
    .map((l) => l?.stampId || l?.stampRef || l?.assetRef)
    .filter(Boolean);

  const matchedStamp = pickMatchingStamp({
    prompt,
    stamps,
    variantIndex,
    excludeIds: variantIndex > 0 ? usedIds : [],
  });

  if (!matchedStamp) return finger;

  const stampLayer = buildStampLayerFromDoc({
    stamp: matchedStamp,
    variantIndex,
    index: layers.length,
  });

  return {
    ...finger,
    layers: [...layers, stampLayer],
  };
}

module.exports = {
  promptWantsStamp,
  pickMatchingStamp,
  buildStampLayerFromDoc,
  applyPromptStampToFinger,
};