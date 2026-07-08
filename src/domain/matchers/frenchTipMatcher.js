// src/domain/matchers/frenchTipMatcher.js

function norm(v) {
  return String(v ?? '').trim().toLowerCase();
}

function frenchId(doc) {
  return String(doc?.id || doc?.frenchTipId || doc?.docId || '').trim();
}

function promptFrenchStyle(prompt, intent = {}) {
  const p = norm(prompt);

  const requested = norm(intent?.frenchTipStyle || intent?.specificFrenchTipStyle || '');
  if (requested) return requested;

  if (p.includes('double classic u')) return 'double_classic_u';

  if (p.includes('double diagonal left')) return 'double_diagonal_left';
  if (p.includes('double diagonal right')) return 'double_diagonal_right';

  if (p.includes('diagonal left')) return 'diagonal_left';
  if (p.includes('diagonal right')) return 'diagonal_right';

  if (p.includes('classic outlined')) return 'classic_outlined';

  if (p.includes('full outline')) return 'full_outline';
  if (p.includes('reverse outline')) return 'reverse_outline';
  if (p.includes('outline')) return 'outline';

  if (p.includes('deep u') || p.includes('deep-u')) return 'deep_u';
  if (p.includes('deep v') || p.includes('deep-v')) return 'deep_v';

  if (p.includes('classic v') || p.includes('v french') || p.includes('v-cut') || p.includes('v cut') || p.includes('chevron')) {
    return 'classic_v';
  }

  if (p.includes('classic u') || p.includes('classic french') || p.includes('u tip') || p.includes('u-tip')) {
    return 'classic_u';
  }

  if (p.includes('straight')) return 'straight';
  if (p.includes('reverse')) return 'reverse';

  if (p.includes('french')) return 'classic_u';

  return null;
}

function promptFrenchVariation(prompt) {
  const p = norm(prompt);

  if (p.includes('thin') || p.includes('skinny') || p.includes('micro')) return 'thin';
  if (p.includes('medium')) return 'medium';
  if (p.includes('thick') || p.includes('bold')) return 'thick';

  return null;
}

function scoreFrenchTip(doc, { prompt, shape, length }) {
  if (!doc) return -999999;

  const p = norm(prompt);
  const wantedStyle = promptFrenchStyle(p, arguments[1]?.intent || {});
  const wantedVariation = promptFrenchVariation(p);

  let score = 0;

  const docStyle = norm(doc.style);
  const docVariation = norm(doc.variation);
  const docShape = norm(doc.shape);
  const docLength = norm(doc.length);

  const text = [
    doc.id,
    doc.name,
    doc.label,
    doc.style,
    doc.variation,
    doc.shape,
    doc.length,
  ].map(norm).join(' ');

  if (docShape === norm(shape)) score += 10;
  if (docLength === norm(length)) score += 10;

  if (wantedStyle && docStyle === wantedStyle) score += 30;
  else if (wantedStyle && text.includes(wantedStyle.replace('_', ' '))) score += 15;

  if (wantedVariation && docVariation === wantedVariation) score += 12;

  if (p.includes('french') && text.includes('french')) score += 4;

  if (doc.isTrending === true) score += 1.5;

  const trend = Number(doc.trendingScore);
  if (Number.isFinite(trend)) score += Math.min(5, trend / 20);

  return score;
}

function pickMatchingFrenchTip({
  prompt,
  intent = {},
  frenchTips,
  shape,
  length,
  variantIndex = 0,
}) {
  const list = Array.isArray(frenchTips) ? frenchTips : [];
  if (!list.length) return null;

  const scored = list
    .map((doc) => ({
      doc,
      id: frenchId(doc),
      score: scoreFrenchTip(doc, { prompt, intent, shape, length }),
    }))
    .filter((x) => x.id && x.score > 0)
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });

  if (!scored.length) return null;

  const topPool = scored.slice(0, Math.min(5, scored.length));
  return topPool[variantIndex % topPool.length]?.doc || null;
}

function buildFrenchTipLayerFromDoc({
  frenchTip,
  existingLayer = {},
  base = null,
  index = 0,
}) {
  if (!frenchTip) return existingLayer;

  const id = frenchId(frenchTip);
  const style = norm(frenchTip.style) || norm(existingLayer.style) || 'classic_u';
  const variation = norm(frenchTip.variation) || norm(existingLayer.variant) || 'medium';

  return {
    ...existingLayer,
    id: existingLayer.id || `french_${style}_${variation}_${Date.now()}`,
    type: 'french_tip',
    style,
    variant: variation,
    thumbnailUi: frenchTip.thumbnailUrl || existingLayer.thumbnailUi || '',
    canvasMaskUrl: frenchTip.uiMaskUrl || existingLayer.canvasMaskUrl || '',
    unityMaskUrl: frenchTip.unityMaskUrl || existingLayer.unityMaskUrl || '',
    visible: true,
    index,
    base: base || existingLayer.base || null,
    widthNorm: typeof existingLayer.widthNorm === 'number' ? existingLayer.widthNorm : 1,
    heightNorm: typeof existingLayer.heightNorm === 'number' ? existingLayer.heightNorm : 1,
    x: typeof existingLayer.x === 'number' ? existingLayer.x : 0.5,
    y: typeof existingLayer.y === 'number' ? existingLayer.y : 0.5,
    scale: typeof existingLayer.scale === 'number' ? existingLayer.scale : 1,
    rotation: typeof existingLayer.rotation === 'number' ? existingLayer.rotation : 0,
  };
}

function applyPromptFrenchTipToFinger({
  finger,
  prompt,
  intent = {},
  frenchTips,
  shape,
  length,
  variantIndex = 0,
}) {
  if (!finger) return finger;

  const p = norm(prompt);
  const requestedStyle = norm(intent?.frenchTipStyle || intent?.specificFrenchTipStyle || '');
  const wantsFrench =
  requestedStyle ||
  p.includes('french') ||
  p.includes('tip') ||
  p.includes('v-cut') ||
  p.includes('v cut') ||
  p.includes('deep u');


  if (!wantsFrench) return finger;

  const matched = pickMatchingFrenchTip({
    prompt,
    intent,
    frenchTips,
    shape: finger.shape || shape,
    length: finger.length || length,
    variantIndex,
  });

  if (!matched) return finger;

  const layers = Array.isArray(finger.layers) ? [...finger.layers] : [];
  const existingIndex = layers.findIndex((l) => l?.type === 'french_tip');

  if (existingIndex >= 0) {
    layers[existingIndex] = buildFrenchTipLayerFromDoc({
      frenchTip: matched,
      existingLayer: layers[existingIndex],
      base: layers[existingIndex].base,
      index: existingIndex,
    });
  } else {
    layers.push(
      buildFrenchTipLayerFromDoc({
        frenchTip: matched,
        existingLayer: {},
        base: null,
        index: layers.length,
      })
    );
  }

  return {
    ...finger,
    layers,
  };
}

module.exports = {
  promptFrenchStyle,
  promptFrenchVariation,
  pickMatchingFrenchTip,
  buildFrenchTipLayerFromDoc,
  applyPromptFrenchTipToFinger,
};