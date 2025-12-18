// src/domain/matchers/templateMatcher.js

/**
 * Very simple, predictable template picker.
 * - If templateId is provided, use that.
 * - Else, filter by exact shape + length.
 * - Then, if prompt contains special keywords, prefer those.
 * - Else, return the first candidate.
 */

function pickFingerTemplate({ prompt, shape, length, templateId, templates = [] }) {
  if (!Array.isArray(templates) || templates.length === 0) {
    console.warn('⚠️ pickFingerTemplate: templates array is empty.');
    return null;
  }

  const safePrompt = (prompt || '').toString();
  const lowerPrompt = safePrompt.toLowerCase();

  // 1) If caller explicitly requested a templateId, try to match that first
  if (templateId) {
    const byId = templates.find(
      (t) =>
        t.id === templateId ||
        t.templateId === templateId
    );

    if (byId) {
      console.log('🎯 pickFingerTemplate: matched explicit templateId =', byId.id);
      return byId;
    }
  }

  // 2) Filter by exact shape + length first
  let candidates = templates.filter(
    (t) => t.shape === shape && t.length === length
  );

  console.log(
    `🔍 pickFingerTemplate: ${templates.length} total templates, ${candidates.length} matched shape="${shape}" length="${length}"`
  );

  // If nothing matches shape/length, fall back to all templates
  if (candidates.length === 0) {
    console.warn(
      '⚠️ pickFingerTemplate: no exact shape/length match, falling back to all templates.'
    );
    candidates = templates;
  }

  // 3) If the prompt mentions certain keywords, try to prefer templates whose
  //    name/label/tags include the same keywords.
  const keywordPrefs = [
    'butterfly',
    'chrome',
    'french',
    'ombre',
    'glitter',
    'rhinestone',
    'y2k',
    'marble',
    'heart',
    'bling',
  ];

  const keywordMatched = candidates.filter((t) => {
    const nameLower = (t.name || '').toLowerCase();
    const labelLower = (t.label || '').toLowerCase();
    const tagsLower = Array.isArray(t.tags)
      ? t.tags.map((tag) => String(tag).toLowerCase())
      : [];

    return keywordPrefs.some((kw) => {
      if (!lowerPrompt.includes(kw)) return false;
      return (
        nameLower.includes(kw) ||
        labelLower.includes(kw) ||
        tagsLower.some((tag) => tag.includes(kw))
      );
    });
  });

  if (keywordMatched.length > 0) {
    console.log(
      '🎯 pickFingerTemplate: keyword-based choice =',
      keywordMatched[0].id
    );
    return keywordMatched[0];
  }

  // 4) Fallback: just pick the first candidate
  console.log(
    'ℹ️ pickFingerTemplate: using first candidate =',
    candidates[0].id
  );
  return candidates[0];
}

module.exports = {
  pickFingerTemplate,
};
