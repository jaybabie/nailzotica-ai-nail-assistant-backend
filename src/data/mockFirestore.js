// src/data/mockFirestore.js

const fs = require('fs');
const path = require('path');

/**
 * Base directory where all mock collections live.
 * This assumes your JSON files are in:
 *   src/data/mock/<collectionName>.json
 */
const mockDir = path.join(__dirname, 'mock');

/**
 * Load a mock collection by name.
 * Example: getCollection('finger_templates') →
 *   reads src/data/mock/finger_templates.json
 */
function getCollection(collectionName) {
  const filePath = path.join(mockDir, `${collectionName}.json`);

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      console.warn(
        `⚠️ Collection "${collectionName}" in ${filePath} is not an array. Returning []`
      );
      return [];
    }

    return data;
  } catch (err) {
    console.error(
      `❌ Error loading mock collection "${collectionName}" from ${filePath}:`,
      err.message
    );
    return [];
  }
}

module.exports = {
  getCollection,
};
