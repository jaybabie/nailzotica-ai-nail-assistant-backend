// src/domain/matchers/stickerMatcher.js

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function tokenizePrompt(prompt) {
  const synonyms = {
    stickers: 'sticker',
    decals: 'sticker',
    butterflies: 'butterfly',
    flowers: 'flower',
    hearts: 'heart',
    stars: 'star',
    bows: 'bow',
    cherries: 'cherry',
  };

  return norm(prompt)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => synonyms[t] || t)
    .filter((t) => t.length >= 3);
}

function stickerId(sticker) {
  return String(
    sticker?.id ||
      sticker?.stickerId ||
      sticker?.docId ||
      sticker?.name ||
      ''
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function stickerSearchText(sticker) {
  return [
    sticker?.id,
    sticker?.name,
    sticker?.category,
    sticker?.finish,
    ...arr(sticker?.tags),
  ]
    .map(norm)
    .filter(Boolean)
    .join(' ');
}

function promptWantsSticker(prompt) {
  const p = norm(prompt);

  return (
    p.includes('sticker') ||
    p.includes('stickers') ||
    p.includes('decal') ||
    p.includes('decals')
  );
}

function scoreSticker(sticker, promptTokens, promptLower) {
  if (!sticker) return -999999;
  if (sticker.isActive === false) return -999999;

  const text = stickerSearchText(sticker);
  let score = 0;

  for (const token of promptTokens) {
    if (text.split(/\s+/).includes(token)) score += 8;
    else if (text.includes(token)) score += 3;
  }

  if (promptLower.includes('butterfly') && text.includes('butterfly')) score += 14;
  if (promptLower.includes('flower') && text.includes('flower')) score += 10;
  if (promptLower.includes('heart') && text.includes('heart')) score += 10;
  if (promptLower.includes('star') && text.includes('star')) score += 8;
  if (promptLower.includes('bow') && text.includes('bow')) score += 8;
  if (promptLower.includes('cherry') && text.includes('cherry')) score += 8;

  if (promptLower.includes('glossy') && text.includes('gloss')) score += 5;
  if (promptLower.includes('matte') && text.includes('matte')) score += 5;
  if (promptLower.includes('chrome') && text.includes('chrome')) score += 5;

  if (sticker.isTrending === true) score += 1.5;
  if (sticker.isNew === true) score += 1;

  return score;
}

function pickMatchingSticker({
  prompt,
  stickers,
  variantIndex = 0,
  excludeIds = [],
}) {
  const list = Array.isArray(stickers) ? stickers : [];
  if (!list.length) return null;

  const promptLower = norm(prompt);
  const promptTokens = tokenizePrompt(promptLower);
  const excluded = new Set((excludeIds || []).map(String));

  const scored = list
    .map((sticker) => ({
      sticker,
      id: stickerId(sticker),
      score: scoreSticker(sticker, promptTokens, promptLower),
    }))
    .filter((x) => x.id && !excluded.has(x.id) && x.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });

  if (!scored.length) return null;

  const topPool = scored.slice(0, Math.min(8, scored.length));
  return topPool[variantIndex % topPool.length]?.sticker || null;
}

function buildStickerLayerFromDoc({
  sticker,
  existingLayer = {},
  variantIndex = 0,
  index = 0,
}) {
  if (!sticker) return existingLayer;

  const id = stickerId(sticker);
  const now = Date.now();

  return {
    ...existingLayer,
    id: existingLayer.id || `sticker_${id}_${now}_${variantIndex}`,
    type: 'sticker',

    stickerId: id,
    stickerRef: id,
    assetRef: id,

    name: sticker.name || existingLayer.name || id,
    category: sticker.category || existingLayer.category || '',
    tags: Array.isArray(sticker.tags) ? sticker.tags : [],
    finish: sticker.finish || existingLayer.finish || '',

    thumbnailUi:
      sticker.thumbnailUrl ||
      sticker.previewUrl ||
      sticker.assetUrl ||
      existingLayer.thumbnailUi ||
      '',

    canvasUiUrl:
      sticker.assetUrl ||
      sticker.previewUrl ||
      sticker.thumbnailUrl ||
      existingLayer.canvasUiUrl ||
      '',

    uiImageUrl:
      sticker.assetUrl ||
      sticker.previewUrl ||
      sticker.thumbnailUrl ||
      existingLayer.uiImageUrl ||
      '',

    visible: true,
    index,

    widthNorm:
      typeof existingLayer.widthNorm === 'number'
        ? existingLayer.widthNorm
        : 0.35,

    heightNorm:
      typeof existingLayer.heightNorm === 'number'
        ? existingLayer.heightNorm
        : 0.35,

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

function applyPromptStickerToFinger({
  finger,
  prompt,
  stickers,
  variantIndex = 0,
}) {
  if (!finger) return finger;
  if (!promptWantsSticker(prompt)) return finger;

  const layers = Array.isArray(finger.layers) ? [...finger.layers] : [];

  const usedIds = layers
    .filter((l) => l?.type === 'sticker')
    .map((l) => l?.stickerId || l?.stickerRef || l?.assetRef)
    .filter(Boolean);

  const matchedSticker = pickMatchingSticker({
    prompt,
    stickers,
    variantIndex,
    excludeIds: variantIndex > 0 ? usedIds : [],
  });

  if (!matchedSticker) return finger;

  const stickerLayer = buildStickerLayerFromDoc({
    sticker: matchedSticker,
    variantIndex,
    index: layers.length,
  });

  return {
    ...finger,
    layers: [...layers, stickerLayer],
  };
}

module.exports = {
  promptWantsSticker,
  pickMatchingSticker,
  buildStickerLayerFromDoc,
  applyPromptStickerToFinger,
};