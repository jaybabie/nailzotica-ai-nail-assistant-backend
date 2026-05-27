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

  // crude color keywords – we can expand this later
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
    // nothing color-ish in the prompt – just let the caller use a default
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

    let score = 0;

    for (const kw of wantedKeywords) {
      if (kw === 'hot pink') {
        if (name.includes('hot pink')) score += 6;
      }

      if (name.includes(kw)) score += 4;
      if (family.includes(kw)) score += 3;
      if (tags.some((t) => t.includes(kw))) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDoc = doc;
    }
  }

  if (bestScore <= 0) {
    return null;
  }

  return bestDoc;
}

/**
 * Convert a color doc into your base layer structure.
 * We make some assumptions and fall back if fields are missing.
 */
function buildBaseFromColorDoc(colorDoc) {
  if (!colorDoc) {
    // fallback Hot Pink (same as before)
    return {
      type: 'solid',
      colorName,
      colorFamily,
      colorRef,
      finish,
      opacity: typeof colorDoc.opacity === 'number' ? colorDoc.opacity : 1,
      hexColor,
      hexCode: colorDoc.hexCode || colorDoc.hex || colorDoc.hex_code || hexColor,

      uiTextureUrl: colorDoc.uiTextureUrl || '',
      canvasUiUrl: colorDoc.canvasUiUrl || colorDoc.uiTextureUrl || '',
      builderUiImage: colorDoc.builderUiImage || colorDoc.uiTextureUrl || '',
      uiImageUrl: colorDoc.uiImageUrl || colorDoc.uiTextureUrl || '',

      gradient: colorDoc.gradient || null,
      visible: true,
    };
  }

  const colorName = colorDoc.colorName || colorDoc.name || 'Unnamed Color';
  const colorFamily = colorDoc.colorFamily || colorDoc.family || '';
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
  const finish = colorDoc.finish || 'glossy';

  return {
    type: 'solid',
    colorName,
    colorFamily,
    colorRef,
    finish,
    opacity: 1,
    hexColor,
    gradient: null,
    visible: true,
  };
}

module.exports = {
  matchBaseColor,
  buildBaseFromColorDoc,
};
