// src/domain/parsers/keywordParser.js

function parseKeywords(promptText) {
  const raw = promptText || '';
  const lower = raw.toLowerCase();

  const tokens = lower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // Shape keywords
  let shape = null;
  if (lower.includes('coffin')) shape = 'coffin';
  else if (lower.includes('almond')) shape = 'almond';
  else if (lower.includes('stiletto')) shape = 'stiletto';
  else if (lower.includes('square')) shape = 'square';
  else if (lower.includes('oval')) shape = 'oval';

  // Length keywords
  let length = null;
  if (lower.includes('extra long') || lower.includes('xl')) {
    length = 'extra-long';
  } else if (lower.includes('very long') || lower.includes('xxl')) {
    length = 'xxl';
  } else if (lower.includes('short')) {
    length = 'short';
  } else if (lower.includes('medium')) {
    length = 'medium';
  } else if (lower.includes('long')) {
    length = 'long';
  }

  // Colors (simple version; we’ll grow this later)
  const colors = [];
  if (lower.includes('hot pink')) colors.push('hot pink');
  if (lower.includes('baby pink')) colors.push('baby pink');
  if (lower.includes('pink') && !colors.length) colors.push('pink');
  if (lower.includes('nude')) colors.push('nude');
  if (lower.includes('black')) colors.push('black');
  if (lower.includes('white')) colors.push('white');

  // Finishes
  const finishes = [];
  if (lower.includes('matte')) finishes.push('matte');
  if (lower.includes('glossy') || lower.includes('shiny')) finishes.push('glossy');
  if (!finishes.length) finishes.push('glossy');

  // Patterns / effects
  const patterns = [];
  const effects = [];

  if (lower.includes('french tip') || lower.includes('french')) {
    patterns.push('french_tip');
  }
  if (lower.includes('ombre') || lower.includes('gradient')) {
    patterns.push('ombre');
  }
  if (lower.includes('marble')) patterns.push('marble');

  if (lower.includes('chrome')) effects.push('chrome');
  if (lower.includes('glitter')) effects.push('glitter');

  // Charms
  const charms = [];
  if (lower.includes('butterfly') || lower.includes('butterflies')) {
    charms.push('butterfly');
  }
  if (lower.includes('heart')) charms.push('heart');
  if (lower.includes('star')) charms.push('star');

  return {
    raw,
    tokens,
    shape,    // may be null
    length,   // may be null
    colors,
    finishes,
    patterns,
    effects,
    charms,
  };
}

module.exports = {
  parseKeywords,
};
