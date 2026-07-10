// src/domain/matchers/charmMatcher.js

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function charmId(charm) {
  return (
    charm?.id ||
    charm?.charmId ||
    charm?.assetId ||
    charm?.docId ||
    charm?.documentId ||
    ''
  ).toString().trim();
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

function buildCharmIntent(promptOrIntent) {
  const isObj =
    promptOrIntent &&
    typeof promptOrIntent === 'object' &&
    !Array.isArray(promptOrIntent);

  const prompt = isObj
    ? String(promptOrIntent.prompt || promptOrIntent.rawPrompt || '')
    : String(promptOrIntent || '');

  const p = norm(prompt);

  const keywords = new Set();
  const specificCharmNames = new Set();

  const pushArr = (items) => {
    for (const item of arr(items)) {
      const s = norm(item);
      if (s) keywords.add(s);
    }
  };

  if (isObj) {
    pushArr(promptOrIntent.charmKeywords);
    pushArr(promptOrIntent.styleTags);
    pushArr(promptOrIntent.primaryKeywords);
    pushArr(promptOrIntent.secondaryKeywords);
    pushArr(promptOrIntent.synonyms);
    pushArr(promptOrIntent.motifs);

    for (const item of arr(promptOrIntent.specificCharmNames)) {
      const s = norm(item);
      if (s) specificCharmNames.add(s);
    }
  }

  const synonymGroups = {
    bling: ['bling', 'rhinestone', 'rhinestones', 'crystal', 'crystals', 'gem', 'gems', 'diamond', 'sparkly', 'sparkle'],
    sparkly: ['bling', 'rhinestone', 'crystal', 'gem', 'diamond', 'glitter'],
    rhinestone: ['bling', 'crystal', 'gem', 'diamond'],
    crystal: ['bling', 'rhinestone', 'gem', 'diamond'],

    coquette: ['bow', 'bows', 'pearl', 'pearls', 'heart', 'hearts', 'ribbon', 'girly'],
    cute: ['heart', 'star', 'bow', 'butterfly', 'flower', 'girly'],
    girly: ['heart', 'bow', 'butterfly', 'flower', 'pearl'],
    luxury: ['gold', 'golden', 'crystal', 'diamond', 'rhinestone', 'chain', 'bling'],
    glam: ['bling', 'rhinestone', 'crystal', 'gold', 'diamond'],

    celestial: ['star', 'stars', 'moon', 'planet', 'constellation'],
    goth: ['black', 'silver', 'cross', 'spike', 'skull', 'dark'],
    romantic: ['heart', 'rose', 'pearl', 'bow'],

    gold: ['gold', 'golden', 'metal', 'metallic'],
    silver: ['silver', 'chrome', 'metal', 'metallic'],
  };

  for (const [trigger, words] of Object.entries(synonymGroups)) {
    if (p.includes(trigger)) {
      for (const w of words) keywords.add(w);
    }
  }

  const directWords = [
    'bow',
    'bows',
    'heart',
    'hearts',
    'star',
    'stars',
    'moon',
    'butterfly',
    'butterflies',
    'flower',
    'flowers',
    'pearl',
    'pearls',
    'cross',
    'chain',
    'gold',
    'silver',
    'cherry',
    'letter',
    'alphabet',
  ];

  for (const word of directWords) {
    if (p.includes(word)) keywords.add(word);
  }

  // Specific charm name examples:
  // "golden bow", "gold bow", "pearl heart"
  const phraseCandidates = [
    'golden bow',
    'gold bow',
    'silver bow',
    'pearl heart',
    'gold heart',
    'silver heart',
    'crystal heart',
    'rhinestone heart',
    'butterfly charm',
    'star charm',
    'moon charm',
  ];

  for (const phrase of phraseCandidates) {
    if (p.includes(phrase)) specificCharmNames.add(phrase);
  }

  return {
    prompt: p,
    keywords: Array.from(keywords),
    specificCharmNames: Array.from(specificCharmNames),
  };
}

function scoreCharm(charm, intent) {
  if (!charm) return -999999;
  if (charm.isAvailable === false) return -999999;

  const text = charmSearchText(charm);
  const name = norm(charm.name);
  const tags = arr(charm.tags).map(norm);
  const tagSet = new Set(tags);

  let score = 0;

  for (const specific of intent.specificCharmNames) {
    if (!specific) continue;

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

  // Extra phrase boosts
  if (intent.prompt.includes('bling')) {
    if (text.includes('bling') || text.includes('rhinestone') || text.includes('crystal')) score += 18;
  }

  if (intent.prompt.includes('sparkly') || intent.prompt.includes('sparkle')) {
    if (text.includes('rhinestone') || text.includes('crystal') || text.includes('gem') || text.includes('diamond')) score += 16;
  }

  if (intent.prompt.includes('coquette')) {
    if (text.includes('bow') || text.includes('pearl') || text.includes('heart') || text.includes('ribbon')) score += 14;
  }

  if (intent.prompt.includes('gold')) {
    if (text.includes('gold') || text.includes('golden')) score += 14;
    if (text.includes('silver')) score -= 6;
  }

  if (intent.prompt.includes('silver')) {
    if (text.includes('silver') || text.includes('chrome')) score += 14;
    if (text.includes('gold') || text.includes('golden')) score -= 6;
  }

  if (charm.isTrending === true) score += 1.5;
  if (charm.isNew === true) score += 1;

  const trend = Number(charm.trendingScore);
  if (Number.isFinite(trend)) score += Math.min(5, trend / 20);

  return score;
}

function pickMatchingCharm({
  prompt,
  intent = null,
  charms,
  variantIndex = 0,
  excludeIds = [],
}) {
  const list = Array.isArray(charms) ? charms : [];
  if (!list.length) return null;

  const charmIntent = buildCharmIntent(intent || prompt);
  const excluded = new Set((excludeIds || []).map(String));

  const scored = list
    .map((charm) => ({
      charm,
      id: charmId(charm),
      score: scoreCharm(charm, charmIntent),
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

  console.log('💎 pickMatchingCharm:', {
    intent: charmIntent,
    picked: picked
      ? {
          id: picked.id,
          name: picked.charm?.name || null,
          score: picked.score,
        }
      : null,
    top: scored.slice(0, 5).map((x) => ({
      id: x.id,
      name: x.charm?.name || null,
      score: x.score,
    })),
  });

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
    albedoUrl: charm.albedoUrl || existingCharm.albedoUrl || '',
    normalUrl: charm.normalUrl || existingCharm.normalUrl || '',
    glossUrl: charm.glossUrl || existingCharm.glossUrl || '',
    emissionUrl: charm.emissionUrl || existingCharm.emissionUrl || '',
    roughnessUrl: charm.roughnessUrl || existingCharm.roughnessUrl || '',
    metallicUrl: charm.metallicUrl || existingCharm.metallicUrl || '',
    occlusionUrl: charm.occlusionUrl || existingCharm.occlusionUrl || '',

    tags: Array.isArray(charm.tags) ? charm.tags : [],

    // Preserve placement from template
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
  intent = null,
  charms,
  fingerKey,
  variantIndex = 0,
}) {
  if (!finger) return finger;

  const existingCharms = Array.isArray(finger.charms) ? finger.charms : [];

  // Template is source of truth:
  // if template has no charm slot, do not add charms.
  if (!existingCharms.length) return finger;

  const charmIntent = buildCharmIntent(intent || prompt);

  // If user did not ask for charm/style/color changes, keep template charms.
  if (!charmIntent.keywords.length && !charmIntent.specificCharmNames.length) {
    return finger;
  }

  const allCharms = Array.isArray(charms) ? charms : [];

  const nextCharms = existingCharms.map((existing, i) => {
    const existingVariantGroupId = String(existing?.variantGroupId || '').trim();

    // Safest path: only swap inside the same variantGroupId.
    const variantPool = existingVariantGroupId
      ? allCharms.filter((c) => String(c?.variantGroupId || '').trim() === existingVariantGroupId)
      : [];

    const poolToUse = variantPool.length ? variantPool : [];

    // If no safe variant pool exists, keep original charm.
    if (!poolToUse.length) return existing;

    const matchedCharm = pickMatchingCharm({
      prompt,
      intent,
      charms: poolToUse,
      variantIndex: variantIndex + i,
      excludeIds: [],
    });

    if (!matchedCharm) return existing;

    return buildCharmInstanceFromDoc({
      charm: matchedCharm,
      existingCharm: existing,
      fingerKey,
      variantIndex: variantIndex + i,
    });
  });

  return {
    ...finger,
    charms: nextCharms,
  };
}

module.exports = {
  buildCharmIntent,
  pickMatchingCharm,
  buildCharmInstanceFromDoc,
  applyPromptCharmToFinger,
};