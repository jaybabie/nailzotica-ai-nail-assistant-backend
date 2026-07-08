// src/domain/matchers/colorMatcher.js

function safeLower(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').toLowerCase()).join(' ');
  }
  return String(value || '').toLowerCase();
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeFinish(v) {
  const s = String(v || '').trim().toLowerCase();

  if (['glossy', 'gloss', 'shiny'].includes(s)) return 'glossy';
  if (s === 'matte') return 'matte';
  if (['glitter', 'sparkle', 'sparkly'].includes(s)) return 'glitter';
  if (['metallic', 'chrome', 'gold', 'silver'].includes(s)) return 'metallic';

  return null;
}

function normalizeColorWord(word) {
  return String(word || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
}

function getColorIntent(promptOrIntent) {
  const isObj =
    promptOrIntent &&
    typeof promptOrIntent === 'object' &&
    !Array.isArray(promptOrIntent);

  const prompt = isObj
    ? String(promptOrIntent.prompt || promptOrIntent.rawPrompt || '')
    : String(promptOrIntent || '');

  const lower = prompt.toLowerCase();

  const colorFamilies = new Set(arr(isObj ? promptOrIntent.colorFamilies : []));
  const specificColorNames = new Set(arr(isObj ? promptOrIntent.specificColorNames : []));
  const finishes = new Set();

  if (isObj && promptOrIntent.finish) {
    const f = normalizeFinish(promptOrIntent.finish);
    if (f) finishes.add(f);
  }

  for (const f of arr(isObj ? promptOrIntent.finishes : [])) {
    const nf = normalizeFinish(f);
    if (nf) finishes.add(nf);
  }

  const colorMap = {
    pink: 'pinks',
    hot_pink: 'pinks',
    baby_pink: 'pinks',
    blush: 'pinks',
    rose: 'pinks',
    fuchsia: 'pinks',
    magenta: 'pinks',
    mauve: 'pinks',
    coral: 'pinks',

    red: 'reds',
    cherry: 'reds',
    burgundy: 'reds',
    wine: 'reds',
    maroon: 'reds',
    crimson: 'reds',

    orange: 'oranges',
    peach: 'oranges',
    apricot: 'oranges',
    tangerine: 'oranges',
    rust: 'oranges',

    yellow: 'yellows',
    lemon: 'yellows',
    butter: 'yellows',
    mustard: 'yellows',
    honey: 'yellows',

    green: 'greens',
    lime: 'greens',
    mint: 'greens',
    sage: 'greens',
    olive: 'greens',
    emerald: 'greens',
    forest: 'greens',

    blue: 'blues',
    baby_blue: 'blues',
    sky_blue: 'blues',
    navy: 'blues',
    cobalt: 'blues',
    teal: 'blues',
    turquoise: 'blues',
    aqua: 'blues',
    aquamarine: 'blues',

    purple: 'purples',
    lavender: 'purples',
    lilac: 'purples',
    violet: 'purples',
    plum: 'purples',
    grape: 'purples',

    brown: 'browns',
    chocolate: 'browns',
    mocha: 'browns',
    coffee: 'browns',
    caramel: 'browns',
    camel: 'browns',
    taupe: 'browns',
    espresso: 'browns',

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
    white: 'neutrals',
    pearl: 'neutrals',

    black: 'blacks & grays',
    gray: 'blacks & grays',
    grey: 'blacks & grays',
    charcoal: 'blacks & grays',
    slate: 'blacks & grays',
    smoke: 'blacks & grays',

    gold: 'metallics',
    golden: 'metallics',
    silver: 'metallics',
    chrome: 'metallics',
    metallic: 'metallics',
    bronze: 'metallics',
    copper: 'metallics',
    rose_gold: 'metallics',
  };

  for (const [word, family] of Object.entries(colorMap)) {
    const phrase = word.replace(/_/g, ' ');
    if (lower.includes(phrase)) {
      colorFamilies.add(family);

      // Important: white/black should still be family-based,
      // but color_library should prefer docs with white/black in name.
      if (['white', 'black'].includes(word)) {
        specificColorNames.add(word);
      }

      // Also preserve specific shade words like aqua, beige, tan, mocha.
      if (!['pink', 'red', 'blue', 'green', 'purple', 'yellow', 'orange', 'brown'].includes(word)) {
        specificColorNames.add(phrase);
      }
    }
  }

  if (lower.includes('matte')) finishes.add('matte');
  if (lower.includes('glossy') || lower.includes('shiny') || lower.includes('gloss')) finishes.add('glossy');
  if (lower.includes('glitter') || lower.includes('sparkly') || lower.includes('sparkle')) finishes.add('glitter');
  if (lower.includes('metallic') || lower.includes('chrome')) finishes.add('metallic');

  return {
    prompt: lower,
    colorFamilies: Array.from(colorFamilies).map((x) => String(x).toLowerCase()),
    specificColorNames: Array.from(specificColorNames).map((x) => String(x).toLowerCase()),
    finishes: Array.from(finishes),
  };
}

function colorDocId(colorDoc) {
  return (
    colorDoc?.colorRef ||
    colorDoc?.id ||
    colorDoc?.docId ||
    colorDoc?.documentId ||
    ''
  ).toString().trim();
}

function colorDocName(colorDoc) {
  return String(colorDoc?.colorName || colorDoc?.name || '').trim();
}

function scoreColorDoc(colorDoc, intent) {
  if (!colorDoc) return -999999;

  const name = colorDocName(colorDoc).toLowerCase();
  const family = safeLower(colorDoc.colorFamily || colorDoc.family);
  const finish = safeLower(colorDoc.finish || '');
  const polishCode = safeLower(colorDoc.polishCode || '');
  const tags = arr(colorDoc.tags).map((t) => String(t).toLowerCase());

  const haystack = `${name} ${family} ${finish} ${polishCode} ${tags.join(' ')}`;

  let score = 0;

  for (const specific of intent.specificColorNames) {
    const s = specific.toLowerCase();

    if (name === s) score += 40;
    else if (name.includes(s)) score += 28;
    else if (haystack.includes(s)) score += 12;
  }

  for (const wantedFamily of intent.colorFamilies) {
    if (family.includes(wantedFamily)) score += 18;
  }

  for (const wantedFinish of intent.finishes) {
    if (finish === wantedFinish) score += 15;
    else if (finish.includes(wantedFinish)) score += 8;
    else if (polishCode.includes(wantedFinish)) score += 4;
  }

  // Strong special-case behavior
  if (intent.specificColorNames.includes('white')) {
    if (name.includes('white')) score += 35;
    if (name.includes('black')) score -= 20;
  }

  if (intent.specificColorNames.includes('black')) {
    if (name.includes('black')) score += 35;
    if (name.includes('white')) score -= 20;
  }

  // Avoid transparent unless user asks for sheer/clear/jelly.
  const wantsClear =
    intent.prompt.includes('clear') ||
    intent.prompt.includes('sheer') ||
    intent.prompt.includes('jelly');

  if (colorDoc.isTransparent === true && !wantsClear) {
    score -= 10;
  }

  return score;
}

function matchBaseColor(promptOrIntent, colorDocs) {
  if (!Array.isArray(colorDocs) || colorDocs.length === 0) {
    return null;
  }

  const intent = getColorIntent(promptOrIntent);

  if (!intent.colorFamilies.length && !intent.specificColorNames.length && !intent.finishes.length) {
    return null;
  }

  const scored = colorDocs
    .map((doc) => ({
      doc,
      id: colorDocId(doc),
      name: colorDocName(doc),
      score: scoreColorDoc(doc, intent),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return String(a.name).localeCompare(String(b.name));
    });

  if (!scored.length) return null;

  const topPool = scored.slice(0, Math.min(8, scored.length));

  // Random-ish but safe variety from top matches.
  const picked = topPool[Math.floor(Math.random() * topPool.length)];

  console.log('🎨 matchBaseColor result:', {
    intent,
    picked: {
      id: picked.id,
      name: picked.name,
      score: picked.score,
      family: picked.doc.colorFamily || picked.doc.family || null,
      finish: picked.doc.finish || null,
    },
    top: scored.slice(0, 5).map((x) => ({
      id: x.id,
      name: x.name,
      score: x.score,
    })),
  });

  return picked.doc;
}

function buildBaseFromColorDoc(colorDoc) {
  if (!colorDoc) {
    return {
      type: 'solid',
      colorName: 'Soft Nude',
      colorFamily: ['neutrals'],
      colorRef: null,
      finish: 'glossy',
      opacity: 1,
      hexColor: '#E8C7B8',
      hexCode: '#E8C7B8',
      polishCode: null,
      uiTextureUrl: '',
      canvasUiUrl: '',
      builderUiImage: '',
      uiImageUrl: '',
      gradient: null,
      visible: true,
    };
  }

  const colorName = colorDoc.colorName || colorDoc.name || 'Unnamed Color';
  const colorFamily = colorDoc.colorFamily || colorDoc.family || [];
  const colorRef =
    colorDoc.colorRef ||
    colorDoc.id ||
    colorDoc.docId ||
    colorDoc.documentId ||
    `color_library/${String(colorName).toLowerCase().replace(/\s+/g, '_')}`;

  const hexColor =
    colorDoc.hexColor ||
    colorDoc.hex ||
    colorDoc.hex_code ||
    colorDoc.hexCode ||
    '#FF69B4';

  const finish = colorDoc.finish || 'glossy';

  return {
    type: 'solid',
    colorName,
    colorFamily,
    colorRef,
    finish,
    opacity: typeof colorDoc.opacity === 'number' ? colorDoc.opacity : 1,
    hexColor,
    hexCode: colorDoc.hexCode || colorDoc.hex || colorDoc.hex_code || hexColor,
    polishCode: colorDoc.polishCode || null,
    uiTextureUrl: colorDoc.uiTextureUrl || colorDoc.builderUiImage || colorDoc.uiImageUrl || '',
    canvasUiUrl: colorDoc.canvasUiUrl || colorDoc.uiTextureUrl || colorDoc.builderUiImage || colorDoc.uiImageUrl || '',
    builderUiImage: colorDoc.builderUiImage || colorDoc.uiTextureUrl || colorDoc.uiImageUrl || '',
    uiImageUrl: colorDoc.uiImageUrl || colorDoc.builderUiImage || colorDoc.uiTextureUrl || '',
    gradient: colorDoc.gradient || null,
    visible: true,
  };
}

module.exports = {
  matchBaseColor,
  buildBaseFromColorDoc,
  getColorIntent,
  scoreColorDoc,
};