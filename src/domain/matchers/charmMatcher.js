// src/domain/matchers/charmMatcher.js

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function tokenizePrompt(prompt) {
  const lower = norm(prompt);

  const synonyms = {
    butterflies: 'butterfly',
    rhinestones: 'rhinestone',
    gems: 'gem',
    crystals: 'crystal',
    letters: 'letter',
    alphabet: 'alphabet',
    blingy: 'bling',
  };

  return lower
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => synonyms[t] || t)
    .filter((t) => t.length >= 3);
}

function charmSearchText(charm) {
  return [
    charm?.id,
    charm?.name,
    charm?.description,
    charm?.category,
    charm?.family,
    charm?.variantGroupId,
    ...arr(charm?.subcategories),
    ...arr(charm?.tags),
  ]
    .map(norm)
    .filter(Boolean)
    .join(' ');
}

function charmId(charm) {
  return (
    charm?.id ||
    charm?.charmId ||
    charm?.assetId ||
    charm?.docId ||
    ''
  ).toString().trim();
}

function scoreCharm(charm, promptTokens, promptLower) {
  if (!charm) return -999999;

  if (charm.isAvailable === false) return -999999;

  const text = charmSearchText(charm);
  let score = 0;

  for (const token of promptTokens) {
    if (!token) continue;

    if (text.split(/\s+/).includes(token)) score += 8;
    else if (text.includes(token)) score += 3;
  }

  // Strong phrase boosts
  if (promptLower.includes('bling') && text.includes('bling')) score += 10;
  if (promptLower.includes('rhinestone') && text.includes('rhinestone')) score += 10;
  if (promptLower.includes('butterfly') && text.includes('butterfly')) score += 14;
  if (promptLower.includes('heart') && text.includes('heart')) score += 10;
  if (promptLower.includes('bow') && text.includes('bow')) score += 10;
  if (promptLower.includes('star') && text.includes('star')) score += 8;
  if (promptLower.includes('letter') && text.includes('letter')) score += 8;
  if (promptLower.includes('alphabet') && text.includes('alphabet')) score += 8;

  if (charm.isTrending === true) score += 1.5;
  if (charm.isNew === true) score += 1;

  const trend = Number(charm.trendingScore);
  if (Number.isFinite(trend)) score += Math.min(5, trend / 20);

  return score;
}

function pickMatchingCharm({
  prompt,
  charms,
  variantIndex = 0,
  excludeIds = [],
}) {
  const list = Array.isArray(charms) ? charms : [];
  if (!list.length) return null;

  const promptLower = norm(prompt);
  const promptTokens = tokenizePrompt(promptLower);
  const excluded = new Set((excludeIds || []).map(String));

  const scored = list
    .map((charm) => ({
      charm,
      id: charmId(charm),
      score: scoreCharm(charm, promptTokens, promptLower),
    }))
    .filter((x) => x.id && !excluded.has(x.id) && x.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });

  if (!scored.length) return null;

  const topPool = scored.slice(0, Math.min(8, scored.length));
  const picked = topPool[variantIndex % topPool.length];

  return picked?.charm || null;
}

function buildCharmInstanceFromDoc({
  charm,
  existingCharm = {},
  fingerKey = '',
  variantIndex = 0,
}) {
  if (!charm) return existingCharm;

  const id = charmId(charm);
  const now = Date.now();

  return {
    ...existingCharm,

    id,
    charmId: id,
    assetId: id,
    name: charm.name || existingCharm.name || id,

    instanceId:
      existingCharm.instanceId ||
      `${now}_${Math.floor(Math.random() * 99999)}_ai_${variantIndex}`,

    priceImpact:
      typeof charm.priceImpact === 'number'
        ? charm.priceImpact
        : existingCharm.priceImpact || 0,

    thumbnailUi: charm.thumbnailUi || charm.canvasUiUrl || existingCharm.thumbnailUi || '',
    canvasUiUrl: charm.canvasUiUrl || charm.thumbnailUi || existingCharm.canvasUiUrl || '',

    model3dUrl: charm.model3dUrl || existingCharm.model3dUrl || '',
    albedoUrl: charm.albedoUrl || '',
    normalUrl: charm.normalUrl || '',
    glossUrl: charm.glossUrl || '',
    emissionUrl: charm.emissionUrl || '',
    roughnessUrl: charm.roughnessUrl || '',
    metallicUrl: charm.metallicUrl || '',
    occlusionUrl: charm.occlusionUrl || '',

    tags: Array.isArray(charm.tags) ? charm.tags : [],

    x: typeof existingCharm.x === 'number' ? existingCharm.x : 0.5,
    y: typeof existingCharm.y === 'number' ? existingCharm.y : 0.45,
    offsetX: typeof existingCharm.offsetX === 'number' ? existingCharm.offsetX : 0.5,
    offsetY: typeof existingCharm.offsetY === 'number' ? existingCharm.offsetY : 0.45,

    rotation: typeof existingCharm.rotation === 'number' ? existingCharm.rotation : 0,
    scale: typeof existingCharm.scale === 'number' ? existingCharm.scale : 1,

    widthNorm:
      typeof charm.widthNorm === 'number'
        ? charm.widthNorm
        : existingCharm.widthNorm || 0.18,

    heightNorm:
      typeof charm.heightNorm === 'number'
        ? charm.heightNorm
        : existingCharm.heightNorm || 0.25,

    visible: true,
    fingerKey: existingCharm.fingerKey || fingerKey,

    collisionGrid: existingCharm.collisionGrid || charm.collisionGrid || [],
    collisionGridSize: existingCharm.collisionGridSize || charm.collisionGridSize || 32,

    collisionBoundsLeft: existingCharm.collisionBoundsLeft,
    collisionBoundsRight: existingCharm.collisionBoundsRight,
    collisionBoundsTop: existingCharm.collisionBoundsTop,
    collisionBoundsBottom: existingCharm.collisionBoundsBottom,

    version: existingCharm.version || 2,
  };
}

function applyPromptCharmToFinger({
  finger,
  prompt,
  charms,
  fingerKey,
  variantIndex = 0,
}) {
  if (!finger) return finger;

  const existingCharms = Array.isArray(finger.charms) ? finger.charms : [];
  const usedIds = existingCharms
    .map((c) => c?.id || c?.charmId || c?.assetId)
    .filter(Boolean);

  const matchedCharm = pickMatchingCharm({
    prompt,
    charms,
    variantIndex,
    excludeIds: variantIndex > 0 ? usedIds : [],
  });

  if (!matchedCharm) return finger;

  const existing = existingCharms[0] || {
    x: 0.5,
    y: 0.45,
    offsetX: 0.5,
    offsetY: 0.45,
    rotation: 0,
    scale: 1,
    fingerKey,
  };

  const newCharm = buildCharmInstanceFromDoc({
    charm: matchedCharm,
    existingCharm: existing,
    fingerKey,
    variantIndex,
  });

  return {
    ...finger,
    charms: [newCharm],
  };
}

module.exports = {
  pickMatchingCharm,
  buildCharmInstanceFromDoc,
  applyPromptCharmToFinger,
};