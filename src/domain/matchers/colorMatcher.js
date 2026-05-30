// src/domain/matchers/colorMatcher.js

/**
 * Try to match a base color doc from the color_library collection
 * using simple keyword matching against the prompt.
 *
 * This is tolerant of different field names in your JSON:
 * - name or colorName
 * - family or colorFamily
 * - tags: [] if present
 */
function safeLower(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').toLowerCase()).join(' ');
  }

  return String(value || '').toLowerCase();
}

function matchBaseColor(prompt, colorDocs) {
  if (!Array.isArray(colorDocs) || colorDocs.length === 0) {
    return null;
  }

  const lower = (prompt || '').toLowerCase();

  const wantsGlitter = lower.includes('glitter') || lower.includes('sparkle');
  const wantsChrome = lower.includes('chrome');
  const wantsMatte = lower.includes('matte');
  const wantsGlossy = lower.includes('glossy') || lower.includes('gloss');

  const wantedKeywords = [];
  if (lower.includes('hot pink')) wantedKeywords.push('hot pink');
  if (lower.includes('pink')) wantedKeywords.push('pink');
  if (lower.includes('magenta')) wantedKeywords.push('magenta');
  if (lower.includes('nude')) wantedKeywords.push('nude');
  if (lower.includes('red')) wantedKeywords.push('red');
  if (lower.includes('black')) wantedKeywords.push('black');
  if (lower.includes('white')) wantedKeywords.push('white');
  if (lower.includes('lilac')) wantedKeywords.push('lilac');
  if (lower.includes('purple')) wantedKeywords.push('purple');
  if (lower.includes('blue')) wantedKeywords.push('blue');
  if (lower.includes('green')) wantedKeywords.push('green');
  if (lower.includes('gold')) wantedKeywords.push('gold');
  if (lower.includes('silver')) wantedKeywords.push('silver');

  if (wantedKeywords.length === 0) {
    return null;
  }

  let bestDoc = null;
  let bestScore = -1;

  for (const doc of colorDocs) {
    const name = (doc.colorName || doc.name || '').toLowerCase();
    const family = safeLower(doc.colorFamily || doc.family);
    const tags = Array.isArray(doc.tags)
      ? doc.tags.map((t) => String(t).toLowerCase())
      : [];

    const finish = safeLower(doc.finish || doc.polishCode);
    const haystack = `${name} ${family} ${tags.join(' ')} ${finish}`;

    let score = 0;

    if (wantsGlitter && haystack.includes('glitter')) score += 8;
    if (wantsChrome && haystack.includes('chrome')) score += 8;
    if (wantsMatte && haystack.includes('matte')) score += 8;
    if (wantsGlossy && haystack.includes('gloss')) score += 6;

    for (const kw of wantedKeywords) {
      if (kw === 'hot pink' && name.includes('hot pink')) score += 6;

      if (name.includes(kw)) score += 4;
      if (family.includes(kw)) score += 3;
      if (tags.some((t) => t.includes(kw))) score += 2;
      if (finish.includes(kw)) score += 2;
    }

    // Extra combo boosts
    if (lower.includes('silver glitter') && haystack.includes('silver') && haystack.includes('glitter')) {
      score += 15;
    }

    if (lower.includes('gold glitter') && haystack.includes('gold') && haystack.includes('glitter')) {
      score += 15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDoc = doc;
    }
  }

  if (bestScore <= 0) {
    return null;
  }

  console.log('🎨 matchBaseColor result:', {
    prompt: lower,
    wantedKeywords,
    bestScore,
    bestDoc: bestDoc
      ? {
          id: bestDoc.id || bestDoc.docId || bestDoc.colorRef || null,
          name: bestDoc.colorName || bestDoc.name || null,
          finish: bestDoc.finish || bestDoc.polishCode || null,
          tags: bestDoc.tags || [],
          family: bestDoc.colorFamily || bestDoc.family || null,
        }
      : null,
  });

  return bestDoc;
}

/**
 * Convert a color doc into your base layer structure.
 * We make some assumptions and fall back if fields are missing.
 */
function buildBaseFromColorDoc(colorDoc) {
  if (!colorDoc) {
    return {
      type: 'solid',
      colorName: 'Soft Nude',
      colorFamily: ['nude'],
      colorRef: null,
      finish: 'glossy',
      opacity: 1,
      hexColor: '#E8C7B8',
      hexCode: '#E8C7B8',
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
    colorName.toLowerCase().replace(/\s+/g, '_');

  const hexColor =
    colorDoc.hexColor ||
    colorDoc.hex ||
    colorDoc.hex_code ||
    colorDoc.hexCode ||
    '#FF69B4';

  const finish = colorDoc.finish || colorDoc.polishCode || 'glossy';

  return {
    type: 'solid',
    colorName,
    colorFamily,
    colorRef,
    finish,
    opacity: typeof colorDoc.opacity === 'number' ? colorDoc.opacity : 1,
    hexColor,
    hexCode: colorDoc.hexCode || colorDoc.hex || colorDoc.hex_code || hexColor,
    polishCode: colorDoc.polishCode || finish,
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
};
