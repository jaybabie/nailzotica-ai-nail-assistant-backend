// src/domain/matchers/templateMatcher.js

function norm(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, ' ');
}

function normToken(v) {
  return norm(v).replace(/_/g, ' ');
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function templateId(t) {
  return String(t?.templateId || t?.id || t?.docId || '').trim();
}

function templateName(t) {
  return String(t?.name || t?.label || '').trim();
}

function normalizeComplexity(v) {
  const s = norm(v);
  if (s === 'basic' || s === 'low') return 'low';
  if (s === 'glam' || s === 'medium' || s === 'med') return 'medium';
  if (s === 'extra' || s === 'complex' || s === 'high') return 'complex';
  return '';
}

function tokenizeText(text) {
  return normToken(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
}

function buildIntentKeywords({ prompt = '', intent = {} }) {
  const out = new Set();
  const add = (x) => {
    const s = normToken(x);
    if (s) out.add(s);
  };

  for (const x of tokenizeText(prompt)) add(x);

  for (const key of [
    'primaryKeywords',
    'secondaryKeywords',
    'synonyms',
    'allKeywords',
    'styleTags',
    'charmKeywords',
    'patternKeywords',
    'motifs',
    'themeKeywords',
    'colorHints',
    'finishes',
    'required',
    'highPriority',
    'preferred',
    'optional',
  ]) {
    for (const x of arr(intent[key])) add(x);
  }

  if (intent.frenchTipStyle) {
    add(intent.frenchTipStyle);
    add(String(intent.frenchTipStyle).replace(/_/g, ' '));
  }

  const stop = new Set([
    'nail', 'nails', 'set', 'with', 'and', 'the', 'for',
    'please', 'make', 'want', 'like', 'give', 'me',
  ]);

  return Array.from(out).filter((x) => !stop.has(x));
}

function expandKeyword(keyword) {
  const k = normToken(keyword);
  const out = new Set([k]);

  const groups = {
    sparkly: ['bling', 'rhinestone', 'crystal', 'gem', 'glitter'],
    sparkle: ['bling', 'rhinestone', 'crystal', 'gem', 'glitter'],
    bling: ['sparkly', 'rhinestone', 'crystal', 'gem', 'glitter'],
    rhinestone: ['bling', 'sparkly', 'crystal', 'gem'],
    crystal: ['bling', 'sparkly', 'rhinestone', 'gem'],

    coquette: ['bow', 'pearl', 'heart', 'ribbon', 'girly'],
    cute: ['girly', 'heart', 'bow', 'star'],
    luxury: ['gold', 'crystal', 'diamond', 'rhinestone', 'bling'],
    celestial: ['star', 'moon', 'planet', 'constellation'],
    goth: ['black', 'chrome', 'silver', 'cross', 'dark'],

    french: ['french tip'],
    tip: ['french tip'],
    'deep u': ['deep u', 'deep_u', 'french tip'],
    deep_u: ['deep u', 'french tip'],
    v_cut: ['v cut', 'chevron', 'french tip'],
    'v cut': ['v_cut', 'chevron', 'french tip'],

    zebra: ['zebra'],
    cheetah: ['cheetah', 'leopard', 'animal print'],
    leopard: ['leopard', 'cheetah', 'animal print'],
    cow: ['cow', 'cow print', 'animal print'],
    snake: ['snake', 'snakeskin', 'animal print'],
  };

  for (const x of groups[k] || []) out.add(normToken(x));
  return Array.from(out);
}

function buildSearchTerms({ prompt = '', intent = {} }) {
  const base = buildIntentKeywords({ prompt, intent });
  const expanded = new Set();

  for (const k of base) {
    for (const x of expandKeyword(k)) expanded.add(x);
  }

  return Array.from(expanded).filter(Boolean);
}

function weightedIntentGroups(intent = {}) {
  return {
    required: arr(intent.required).map(normToken).filter(Boolean),
    highPriority: arr(intent.highPriority).map(normToken).filter(Boolean),
    preferred: arr(intent.preferred).map(normToken).filter(Boolean),
    optional: arr(intent.optional).map(normToken).filter(Boolean),
    synonyms: arr(intent.synonyms).map(normToken).filter(Boolean),
  };
}

function scoreTermsAgainstTemplate({
  terms,
  name,
  tagSet,
  tags,
  category,
  weight,
  missingPenalty = 0,
}) {
  let score = 0;
  const matched = [];
  const missing = [];

  for (const term of terms) {
    let didMatch = false;

    if (name.includes(term)) {
      score += weight;
      matched.push(term);
      didMatch = true;
    } else if (tagSet.has(term)) {
      score += Math.round(weight * 0.75);
      matched.push(term);
      didMatch = true;
    } else if (tags.some((t) => t.includes(term) || term.includes(t))) {
      score += Math.round(weight * 0.35);
      matched.push(term);
      didMatch = true;
    } else if (category && category.includes(term)) {
      score += Math.round(weight * 0.35);
      matched.push(term);
      didMatch = true;
    }

    if (!didMatch) {
      missing.push(term);
      score -= missingPenalty;
    }
  }

  return { score, matched, missing };
}

function scoreTemplate({
  template,
  prompt = '',
  intent = {},
  shape,
  length,
  complexity,
  seed = 0,
}) {
  if (!template) return null;

  const id = templateId(template);
  if (!id) return null;
  if (norm(template.status || 'active') !== 'active') return null;

  const wantedShape = norm(shape || intent.shape);
  const wantedLength = norm(length || intent.length);

  const tShape = norm(template.shape || template.nailShape);
  const tLength = norm(template.length || template.nailLength);

  let shapeLengthScore = 0;
  let adaptationCost = 0;
  let shapeAdapted = false;
  let lengthAdapted = false;

  if (wantedLength && tLength) {
    if (wantedLength === tLength) shapeLengthScore += 45;
    else {
      shapeLengthScore -= 18;
      adaptationCost += 18;
      lengthAdapted = true;
    }
  }

  if (wantedShape && tShape) {
    if (wantedShape === tShape) shapeLengthScore += 35;
    else {
      shapeLengthScore -= 8;
      adaptationCost += 8;
      shapeAdapted = true;
    }
  }

  if (wantedLength && tLength && wantedLength === tLength && wantedShape && tShape && wantedShape !== tShape) {
    shapeLengthScore += 20;
  }

  if (lengthAdapted && shapeAdapted) {
    adaptationCost += 12;
    shapeLengthScore -= 12;
  }

  const wantedComplexity = normalizeComplexity(complexity || intent.complexity);
  const templateComplexity = normalizeComplexity(template.complexity);

  const name = normToken(templateName(template));
  const tags = arr(template.tags).map(normToken).filter(Boolean);
  const tagSet = new Set(tags);
  const category = normToken(template.category);

  const terms = buildSearchTerms({ prompt, intent });
  const groups = weightedIntentGroups(intent);

  const requiredScore = scoreTermsAgainstTemplate({
    terms: groups.required,
    name,
    tagSet,
    tags,
    category,
    weight: 35,
    missingPenalty: 45,
  });

  const highPriorityScore = scoreTermsAgainstTemplate({
    terms: groups.highPriority,
    name,
    tagSet,
    tags,
    category,
    weight: 22,
    missingPenalty: 12,
  });

  const preferredScore = scoreTermsAgainstTemplate({
    terms: groups.preferred,
    name,
    tagSet,
    tags,
    category,
    weight: 10,
  });

  const optionalScore = scoreTermsAgainstTemplate({
    terms: groups.optional,
    name,
    tagSet,
    tags,
    category,
    weight: 3,
  });

  const synonymScore = scoreTermsAgainstTemplate({
    terms: groups.synonyms,
    name,
    tagSet,
    tags,
    category,
    weight: 5,
  });

  const weightedIntentScore =
    requiredScore.score +
    highPriorityScore.score +
    preferredScore.score +
    optionalScore.score +
    synonymScore.score;

  const matched = Array.from(new Set([
    ...requiredScore.matched,
    ...highPriorityScore.matched,
    ...preferredScore.matched,
    ...optionalScore.matched,
    ...synonymScore.matched,
  ]));

  const missing = Array.from(new Set([
    ...requiredScore.missing,
    ...highPriorityScore.missing,
  ]));

  let titleScore = 0;
  let tagScore = 0;
  let categoryScore = 0;
  let exactPhraseScore = 0;

  for (const term of terms) {
    if (!term) continue;

    if (name.includes(term)) titleScore += term.includes(' ') ? 18 : 10;
    if (tagSet.has(term)) tagScore += term.includes(' ') ? 9 : 6;
    else if (tags.some((t) => t.includes(term) || term.includes(t))) tagScore += 2;
    if (category && category.includes(term)) categoryScore += 3;
  }

  const promptLower = normToken(prompt);

  if (promptLower.includes('animal print') && (name.includes('zebra') || name.includes('cheetah') || name.includes('leopard'))) {
    exactPhraseScore += 8;
  }

  if (promptLower.includes('french') && (name.includes('french') || tagSet.has('french tip') || tagSet.has('french_tip'))) {
    exactPhraseScore += 8;
  }

  if (promptLower.includes('bling') && (name.includes('bling') || tagSet.has('bling') || tagSet.has('rhinestone'))) {
    exactPhraseScore += 6;
  }

  let complexityScore = 0;
  if (wantedComplexity && templateComplexity) {
    if (wantedComplexity === templateComplexity) complexityScore += 8;
    else complexityScore -= 2;
  }

  const trend = Number(template.trendingScore);
  const trendScore = Number.isFinite(trend) ? Math.min(3, trend / 50) : 0;

  const useCount = Number(template.useCount);
  const useScore = Number.isFinite(useCount) ? Math.min(1.5, useCount / 100) : 0;

  const randomScore = seededTinyScore(`${seed}_${id}`);

  const finalScore =
    shapeLengthScore +
    weightedIntentScore +
    titleScore +
    tagScore +
    categoryScore +
    exactPhraseScore +
    complexityScore +
    trendScore +
    useScore +
    randomScore -
    adaptationCost;

  return {
    template,
    id,
    name: templateName(template),
    score: finalScore,
    confidence: Math.max(0, Math.min(100, Math.round(finalScore))),
    matched,
    missing,
    adaptation: {
      shapeAdapted,
      lengthAdapted,
      adaptationCost,
      requestedShape: wantedShape || null,
      requestedLength: wantedLength || null,
      templateShape: tShape || null,
      templateLength: tLength || null,
    },
    breakdown: {
      shapeLengthScore,
      weightedIntentScore,
      requiredScore: requiredScore.score,
      highPriorityScore: highPriorityScore.score,
      preferredScore: preferredScore.score,
      optionalScore: optionalScore.score,
      synonymScore: synonymScore.score,
      adaptationPenalty: -adaptationCost,
      titleScore,
      tagScore,
      categoryScore,
      exactPhraseScore,
      complexityScore,
      trendScore,
      useScore,
      randomScore,
    },
  };
}

function seededTinyScore(input) {
  let h = 2166136261;
  const s = String(input || '');

  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return ((h >>> 0) % 1000) / 1000;
}

function rankFingerTemplates({
  prompt = '',
  intent = {},
  shape,
  length,
  complexity,
  templates = [],
  seed = 0,
  limit = 30,
}) {
  const scored = arr(templates)
    .map((template) =>
      scoreTemplate({
        template,
        prompt,
        intent,
        shape,
        length,
        complexity,
        seed,
      })
    )
    .filter(Boolean)
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return String(a.id).localeCompare(String(b.id));
    });

  return scored.slice(0, limit);
}

function pickFromRanked(ranked, seed = 0, variantIndex = 0) {
  if (!ranked.length) return null;

  const best = ranked[0].score;
  const threshold = Math.max(1, best * 0.65);

  const pool = ranked
    .filter((x) => x.score >= threshold)
    .slice(0, 12);

  const index = Math.abs(Number(seed || 0) + Number(variantIndex || 0)) % pool.length;

  return pool[index]?.template || ranked[0]?.template || null;
}

function pickFingerTemplate({
  prompt,
  shape,
  length,
  complexity,
  templateId,
  templates = [],
  intent = {},
  seed = 0,
  variantIndex = 0,
}) {
  const list = arr(templates);

  if (!list.length) {
    console.warn('⚠️ pickFingerTemplate: templates array is empty.');
    return null;
  }

  if (templateId) {
    const wanted = String(templateId).trim();
    const byId = list.find((t) => String(t?.id || t?.templateId || t?.docId || '').trim() === wanted);

    if (byId) {
      console.log('🎯 pickFingerTemplate: matched explicit templateId =', wanted);
      return byId;
    }
  }

  const ranked = rankFingerTemplates({
    prompt,
    intent,
    shape,
    length,
    complexity,
    templates: list,
    seed,
    limit: 30,
  });

  if (ranked.length) {
    console.log('🎯 pickFingerTemplate ranked top:', ranked.slice(0, 5).map((x) => ({
      id: x.id,
      name: x.name,
      score: Number(x.score.toFixed(2)),
      confidence: x.confidence,
      matched: x.matched,
      missing: x.missing,
      adaptation: x.adaptation,
      breakdown: x.breakdown,
    })));

    return pickFromRanked(ranked, seed, variantIndex);
  }

  const s = norm(shape || intent.shape);
  const l = norm(length || intent.length);

  const fallback = list.find((t) => {
    const ts = norm(t?.shape || t?.nailShape);
    const tl = norm(t?.length || t?.nailLength);
    return (!s || !ts || ts === s) && (!l || !tl || tl === l);
  });

  if (fallback) return fallback;

  return list[0] || null;
}

module.exports = {
  pickFingerTemplate,
  rankFingerTemplates,
  scoreTemplate,
  buildSearchTerms,
};