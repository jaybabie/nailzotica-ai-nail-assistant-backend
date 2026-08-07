// src/catalogs/localNailCatalog.js
// Static catalogs loaded once when the Render process starts.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../../assets/data');

function normalizeCatalogValue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');
}

function makeFrenchTipKey(style, variation, shape, length) {
  return [style, variation, shape, length]
    .map(normalizeCatalogValue)
    .join('|');
}

function makeShapeLengthKey(shape, length) {
  return [shape, length]
    .map(normalizeCatalogValue)
    .join('|');
}

function loadJsonArray(filename) {
  const filePath = path.join(DATA_DIR, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `[localNailCatalog] Missing required file: ${filePath}. ` +
      `Commit assets/data/${filename} to the GitHub repository deployed by Render.`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `[localNailCatalog] Invalid JSON in ${filePath}: ${error.message}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `[localNailCatalog] ${filePath} must contain a top-level JSON array.`
    );
  }

  if (parsed.length === 0) {
    throw new Error(`[localNailCatalog] ${filePath} contains no records.`);
  }

  return parsed;
}

function assertObject(record, catalogName, index) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(
      `[localNailCatalog] ${catalogName}[${index}] must be a JSON object.`
    );
  }
}

function assertNonEmpty(record, fields, catalogName, index) {
  for (const field of fields) {
    if (String(record[field] ?? '').trim() === '') {
      throw new Error(
        `[localNailCatalog] ${catalogName}[${index}] is missing required field "${field}".`
      );
    }
  }
}

function validateColorLibrary(records) {
  records.forEach((record, index) => {
    assertObject(record, 'color_library.json', index);
    assertNonEmpty(record, ['id', 'name'], 'color_library.json', index);

    const hasUsableColorValue =
      String(record.hexCode ?? record.hexColor ?? record.hex ?? '').trim() !== '' ||
      String(record.polishCode ?? '').trim() !== '' ||
      String(record.builderUiImage ?? record.uiTextureUrl ?? record.uiImageUrl ?? '').trim() !== '';

    if (!hasUsableColorValue) {
      throw new Error(
        `[localNailCatalog] color_library.json[${index}] (${record.id}) has no hex, polish code, or texture asset.`
      );
    }
  });
}

function validateFrenchTips(records) {
  records.forEach((record, index) => {
    assertObject(record, 'french_tip.json', index);
    assertNonEmpty(
      record,
      ['style', 'variation', 'shape', 'length', 'thumbnailUrl', 'uiMaskUrl', 'unityMaskUrl'],
      'french_tip.json',
      index
    );
  });
}

function validateNails(records) {
  records.forEach((record, index) => {
    assertObject(record, 'nails.json', index);
    assertNonEmpty(
      record,
      ['id', 'shape', 'length', 'previewImageUrl', 'canvasImageUrl', 'clippingMaskUrl'],
      'nails.json',
      index
    );
  });
}

const colorLibrary = loadJsonArray('color_library.json');
const frenchTips = loadJsonArray('french_tip.json');
const nails = loadJsonArray('nails.json');

validateColorLibrary(colorLibrary);
validateFrenchTips(frenchTips);
validateNails(nails);

const colorById = new Map();
for (const color of colorLibrary) {
  colorById.set(String(color.id).trim(), color);
}

const frenchTipLookup = new Map();
const frenchTipsByShapeLength = new Map();

for (const tip of frenchTips) {
  const exactKey = makeFrenchTipKey(
    tip.style,
    tip.variation,
    tip.shape,
    tip.length
  );

  if (frenchTipLookup.has(exactKey)) {
    throw new Error(
      `[localNailCatalog] Duplicate French-tip lookup key: ${exactKey}`
    );
  }
  frenchTipLookup.set(exactKey, tip);

  const shapeLengthKey = makeShapeLengthKey(tip.shape, tip.length);
  const pool = frenchTipsByShapeLength.get(shapeLengthKey) || [];
  pool.push(tip);
  frenchTipsByShapeLength.set(shapeLengthKey, pool);
}

const nailLookup = new Map();
for (const nail of nails) {
  const key = makeShapeLengthKey(nail.shape, nail.length);
  if (nailLookup.has(key)) {
    throw new Error(`[localNailCatalog] Duplicate nail lookup key: ${key}`);
  }
  nailLookup.set(key, nail);
}

function findFrenchTip({ style, variation, shape, length }) {
  return frenchTipLookup.get(
    makeFrenchTipKey(style, variation, shape, length)
  ) || null;
}

function getFrenchTipsForShapeLength(shape, length) {
  return frenchTipsByShapeLength.get(makeShapeLengthKey(shape, length)) || [];
}

function getNailAsset(shape, length) {
  return nailLookup.get(makeShapeLengthKey(shape, length)) || null;
}

console.log('✅ Local Nailzotica catalogs loaded:', {
  dataDir: DATA_DIR,
  colors: colorLibrary.length,
  frenchTips: frenchTips.length,
  nails: nails.length,
});

module.exports = {
  DATA_DIR,
  normalizeCatalogValue,
  makeFrenchTipKey,
  makeShapeLengthKey,
  colorLibrary,
  colorById,
  frenchTips,
  frenchTipLookup,
  frenchTipsByShapeLength,
  findFrenchTip,
  getFrenchTipsForShapeLength,
  nails,
  nailLookup,
  getNailAsset,
};
