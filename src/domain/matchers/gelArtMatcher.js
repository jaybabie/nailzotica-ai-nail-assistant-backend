// src/domain/matchers/gelArtMatcher.js

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function tokenizePrompt(prompt) {
  const synonyms = {
    blobs: 'blob',
    bubbles: 'bubble',
    flowers: 'flower',
    florals: 'flower',
    hearts: 'heart',
    bows: 'bow',
    charms: 'charm',
    raised: '3d',
    sculpted: '3d',
    textured: '3d',
    jelly: 'gel',
  };

  return norm(prompt)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => synonyms[t] || t)
    .filter((t) => t.length >= 3);
}

function gelArtId(item) {
  return String(
    item?.id ||
      item?.gelArtId ||
      item?.gelArt3DId ||
      item?.variantId ||
      item?.docId ||
      ''
  ).trim();
}

function gelSearchText(item) {
  return [
    item?.id,
    item?.name,
    item?.description,
    item?.category,
    item?.variantGroupId,
    item?.variantId,
    item?.baseMaterialType,
    item?.defaultRenderMode,
    ...arr(item?.tags),
    ...arr(item?.subcategories),
    ...arr(item?.variants),
    ...arr(item?.sizeOptions),
  ]
    .map(norm)
    .filter(Boolean)
    .join(' ');
}

function promptWantsGelArt(prompt) {
  const p = norm(prompt);

  return (
    p.includes('3d') ||
    p.includes('gel art') ||
    p.includes('raised') ||
    p.includes('sculpted') ||
    p.includes('texture') ||
    p.includes('textured') ||
    p.includes('bubble') ||
    p.includes('blob') ||
    p.includes('jelly') ||
    p.includes('embossed')
  );
}

function scoreGelArt(item, promptTokens, promptLower, shape, length) {
  if (!item) return -999999;
  if (item.isAvailable === false) return -999999;

  const text = gelSearchText(item);
  let score = 0;

  for (const token of promptTokens) {
    if (text.split(/\s+/).includes(token)) score += 8;
    else if (text.includes(token)) score += 3;
  }

  if (promptLower.includes('3d') && text.includes('3d')) score += 12;
  if (promptLower.includes('raised') && text.includes('raised')) score += 10;
  if (promptLower.includes('bubble') && text.includes('bubble')) score += 10;
  if (promptLower.includes('blob') && text.includes('blob')) score += 10;
  if (promptLower.includes('flower') && text.includes('flower')) score += 10;
  if (promptLower.includes('heart') && text.includes('heart')) score += 10;
  if (promptLower.includes('bow') && text.includes('bow')) score += 10;

  const compatibleShapes = arr(item.compatibleShapes).map(norm);
  const compatibleLengths = arr(item.compatibleLengths).map(norm);

  if (compatibleShapes.length && compatibleShapes.includes(norm(shape))) score += 6;
  if (compatibleLengths.length && compatibleLengths.includes(norm(length))) score += 6;

  if (item.isTrending === true) score += 1.5;
  if (item.isNew === true) score += 1;

  const trend = Number(item.trendingScore);
  if (Number.isFinite(trend)) score += Math.min(5, trend / 20);

  return score;
}

function pickMatchingGelArt({
  prompt,
  gelArt3D,
  shape,
  length,
  variantIndex = 0,
  excludeIds = [],
}) {
  const list = Array.isArray(gelArt3D) ? gelArt3D : [];
  if (!list.length) return null;

  const promptLower = norm(prompt);
  const promptTokens = tokenizePrompt(promptLower);
  const excluded = new Set((excludeIds || []).map(String));

  const scored = list
    .map((item) => ({
      item,
      id: gelArtId(item),
      score: scoreGelArt(item, promptTokens, promptLower, shape, length),
    }))
    .filter((x) => x.id && !excluded.has(x.id) && x.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });

  if (!scored.length) return null;

  const topPool = scored.slice(0, Math.min(8, scored.length));
  return topPool[variantIndex % topPool.length]?.item || null;
}

function buildGelArtInstanceFromDoc({
  gel,
  existingGel = {},
  fingerKey = '',
  variantIndex = 0,
}) {
  if (!gel) return existingGel;

  const id = gelArtId(gel);
  const now = Date.now();

  return {
    ...existingGel,

    id,
    gelArtId: id,
    gelArt3DId: id,
    assetId: id,
    name: gel.name || existingGel.name || id,

    instanceId:
      existingGel.instanceId ||
      `${now}_${Math.floor(Math.random() * 99999)}_gel_${variantIndex}`,

    description: gel.description || existingGel.description || '',
    category: gel.category || existingGel.category || '',
    tags: Array.isArray(gel.tags) ? gel.tags : [],

    thumbnailUrl: gel.thumbnailUrl || existingGel.thumbnailUrl || '',
    thumbnailUi: gel.thumbnailUrl || gel.canvasUiUrl || existingGel.thumbnailUi || '',
    canvasUiUrl: gel.canvasUiUrl || gel.thumbnailUrl || existingGel.canvasUiUrl || '',

    baseRenderUrl: gel.baseRenderUrl || existingGel.baseRenderUrl || '',
    fillMaskUrl: gel.fillMaskUrl || existingGel.fillMaskUrl || '',

    model3dUrl: gel.model3dUrl || existingGel.model3dUrl || '',

    albedoUrl: gel.albedoUrl || '',
    normalUrl: gel.normalUrl || '',
    glossUrl: gel.glossUrl || '',
    uiGlossUrl: gel.uiGlossUrl || '',
    roughnessUrl: gel.roughnessUrl || '',
    occlusionUrl: gel.occlusionUrl || '',
    metallicUrl: gel.metallicUrl || '',
    emissionUrl: gel.emissionUrl || '',

    supportsClearMode: gel.supportsClearMode === true,
    supportsColorFill: gel.supportsColorFill === true,
    supportsImageFill: gel.supportsImageFill === true,

    defaultRenderMode: gel.defaultRenderMode || existingGel.defaultRenderMode || '',
    baseMaterialType: gel.baseMaterialType || existingGel.baseMaterialType || '',
    defaultOpacity:
      typeof gel.defaultOpacity === 'number'
        ? gel.defaultOpacity
        : existingGel.defaultOpacity ?? 1,

    defaultTintStrength:
      typeof gel.defaultTintStrength === 'number'
        ? gel.defaultTintStrength
        : existingGel.defaultTintStrength ?? 0,

    maxHeight:
      typeof gel.maxHeight === 'number'
        ? gel.maxHeight
        : existingGel.maxHeight ?? 0,

    priceImpact:
      typeof gel.priceImpact === 'number'
        ? gel.priceImpact
        : existingGel.priceImpact || 0,

    x: typeof existingGel.x === 'number' ? existingGel.x : 0.5,
    y: typeof existingGel.y === 'number' ? existingGel.y : 0.45,
    offsetX: typeof existingGel.offsetX === 'number' ? existingGel.offsetX : 0.5,
    offsetY: typeof existingGel.offsetY === 'number' ? existingGel.offsetY : 0.45,

    rotation: typeof existingGel.rotation === 'number' ? existingGel.rotation : 0,
    scale: typeof existingGel.scale === 'number' ? existingGel.scale : 1,

    widthNorm:
      typeof existingGel.widthNorm === 'number'
        ? existingGel.widthNorm
        : 0.22,

    heightNorm:
      typeof existingGel.heightNorm === 'number'
        ? existingGel.heightNorm
        : 0.22,

    visible: true,
    fingerKey: existingGel.fingerKey || fingerKey,

    isMovable: gel.isMovable !== false,
    isRotatable: gel.isRotatable !== false,
    isScalable: gel.isScalable !== false,

    variantGroupId: gel.variantGroupId || existingGel.variantGroupId || '',
    variantId: gel.variantId || existingGel.variantId || '',

    version: existingGel.version || 2,
  };
}

function applyPromptGelArtToFinger({
  finger,
  prompt,
  gelArt3D,
  fingerKey,
  shape,
  length,
  variantIndex = 0,
}) {
  if (!finger) return finger;
  if (!promptWantsGelArt(prompt)) return finger;

  const existingGelArt = Array.isArray(finger.gelArt3D) ? finger.gelArt3D : [];
  const usedIds = existingGelArt
    .map((g) => g?.id || g?.gelArtId || g?.gelArt3DId || g?.assetId)
    .filter(Boolean);

  const matchedGel = pickMatchingGelArt({
    prompt,
    gelArt3D,
    shape: finger.shape || shape,
    length: finger.length || length,
    variantIndex,
    excludeIds: variantIndex > 0 ? usedIds : [],
  });

  if (!matchedGel) return finger;

  const existing = existingGelArt[0] || {
    x: 0.5,
    y: 0.45,
    offsetX: 0.5,
    offsetY: 0.45,
    rotation: 0,
    scale: 1,
    fingerKey,
  };

  const newGel = buildGelArtInstanceFromDoc({
    gel: matchedGel,
    existingGel: existing,
    fingerKey,
    variantIndex,
  });

  return {
    ...finger,
    gelArt3D: [newGel],
  };
}

module.exports = {
  promptWantsGelArt,
  pickMatchingGelArt,
  buildGelArtInstanceFromDoc,
  applyPromptGelArtToFinger,
};