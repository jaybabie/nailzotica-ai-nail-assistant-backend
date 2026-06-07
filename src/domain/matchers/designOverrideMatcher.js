// src/domain/matchers/designOverrideMatcher.js

const { matchBaseColor, buildBaseFromColorDoc } = require('./colorMatcher');
const { applyPromptCharmToFinger } = require('./charmMatcher');
const { pickMatchingPattern, buildPatternLayerFromDoc } = require('./patternMatcher');
const { decidePatternPlacement, applyPatternPlacement } = require('./patternPlacementMatcher');
const { applyPromptFrenchTipToFinger } = require('./frenchTipMatcher');
const { applyPromptStampToFinger } = require('./stampMatcher');
const { applyPromptGelArtToFinger } = require('./gelArtMatcher');
const { applyPromptStickerToFinger } = require('./stickerMatcher');

function norm(v) {
  return String(v ?? '').trim().toLowerCase();
}

function promptWantsFrench(promptLower) {
  return (
    promptLower.includes('french') ||
    promptLower.includes('tip') ||
    promptLower.includes('v-cut') ||
    promptLower.includes('v cut') ||
    promptLower.includes('chevron')
  );
}

function getAccentFingerKeys({ complexity, variantIndex }) {
  const sets = [
    ['left_ring', 'right_ring'],
    ['left_middle', 'right_middle'],
    ['left_thumb', 'right_thumb'],
  ];

  if (String(complexity || '').toLowerCase() === 'basic') {
    return sets[variantIndex % sets.length];
  }

  return null; // null = apply to all fingers
}

function shouldApplyToFinger(fingerKey, accentKeys) {
  if (!accentKeys) return true;
  return accentKeys.includes(fingerKey);
}

function applyColorToFrenchTips(finger, matchedColor) {
  if (!finger || !matchedColor) return finger;

  const layers = Array.isArray(finger.layers) ? [...finger.layers] : [];

  return {
    ...finger,
    layers: layers.map((layer) => {
      if (layer?.type !== 'french_tip') return layer;

      return {
        ...layer,
        base: buildBaseFromColorDoc(matchedColor),
      };
    }),
  };
}

function applyPatternToBestPlacement({
  finger,
  prompt,
  patterns,
  variantIndex,
}) {
  if (!finger) return finger;

  const matchedPattern = pickMatchingPattern({
    prompt,
    patterns,
    variantIndex,
  });

  if (!matchedPattern) return finger;

  const patternLayer = buildPatternLayerFromDoc({
    pattern: matchedPattern,
    variantIndex,
  });

  const placement = decidePatternPlacement(prompt);

  return applyPatternPlacement({
    finger,
    patternLayer,
    placement,
  });
}

function ensureFrenchTipLayer({ finger, shape, length, matchedColor, variantIndex = 0 }) {
  if (!finger) return finger;

  const layers = Array.isArray(finger.layers) ? [...finger.layers] : [];
  const hasFrench = layers.some((layer) => layer?.type === 'french_tip');

  if (hasFrench) return finger;

  const safeShape = String(finger.shape || shape || 'almond').toLowerCase();
  const safeLength = String(finger.length || length || 'short').toLowerCase();

  const variants = ['medium', 'thin', 'thick'];
  const variant = variants[variantIndex % variants.length];

  layers.push({
    id: `french_v_cut_${variant}_${Date.now()}_${variantIndex}`,
    type: 'french_tip',
    style: 'v_cut',
    variant,
    thumbnailUi:
      'https://nailzotica.s3.us-east-2.amazonaws.com/design_assets/nails/french_tip/thumbnail_french_tip_v_cut.png',
    canvasMaskUrl:
      `https://nailzotica.s3.us-east-2.amazonaws.com/design_assets/nails/french_tip/${safeShape}_${safeLength}/ui_mask_nail_${safeShape}_${safeLength}_french_tip_v_cut_${variant}.png`,
    unityMaskUrl:
      `https://nailzotica.s3.us-east-2.amazonaws.com/design_assets/nails/french_tip/${safeShape}_${safeLength}/unity_mask_nail_${safeShape}_${safeLength}_french_tip_v_cut_${variant}.png`,
    visible: true,
    index: layers.length,
    base: matchedColor ? buildBaseFromColorDoc(matchedColor) : null,
    widthNorm: 1,
    heightNorm: 1,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
  });

  return {
    ...finger,
    layers,
  };
}

function applyPromptOverridesToDesign({
  design,
  prompt,
  complexity = '',
  colorLibrary = [],
  charms = [],
  frenchTips = [],
  patterns = [],
  stamps = [],
  gelArt3D = [],
  stickers = [],
  variantIndex = 0,
}) {
  if (!design || !design.fingers) return design;

  const promptLower = norm(prompt);

  const matchedColor = matchBaseColor(promptLower, colorLibrary);

  const wantsFrench = promptWantsFrench(promptLower);
  const accentKeys = getAccentFingerKeys({ complexity, variantIndex });

  const fingerOrder = [
    'left_thumb',
    'left_index',
    'left_middle',
    'left_ring',
    'left_pinky',
    'right_thumb',
    'right_index',
    'right_middle',
    'right_ring',
    'right_pinky',
  ];

  const originalFingers = design.fingers;

  let normalizedFingers = {};

  if (Array.isArray(originalFingers)) {
    for (let i = 0; i < fingerOrder.length; i++) {
      if (originalFingers[i]) {
        normalizedFingers[fingerOrder[i]] = originalFingers[i];
      }
    }
  } else if (originalFingers && typeof originalFingers === 'object') {
    normalizedFingers = { ...originalFingers };
  }

  const nextDesign = {
    ...design,
    fingers: normalizedFingers,
  };

  for (const fingerKey of fingerOrder) {
    let finger = nextDesign.fingers[fingerKey];
    if (!finger) continue;

    // 1. French tip style/mask correction
    finger = applyPromptFrenchTipToFinger({
      finger,
      prompt: promptLower,
      frenchTips,
      shape: finger.shape || design.shape,
      length: finger.length || design.length,
      variantIndex,
    });

    if (wantsFrench) {
      finger = ensureFrenchTipLayer({
        finger,
        shape: finger.shape || design.shape,
        length: finger.length || design.length,
        matchedColor,
        variantIndex,
      });
    }

    // 2. Color correction for French tips/base
    if (matchedColor) {
    if (wantsFrench) {
      // Put silver glitter inside the French tip, not the whole nail.
      finger = applyColorToFrenchTips(finger, matchedColor);
    } else {
      finger = {
        ...finger,
        base: buildBaseFromColorDoc(matchedColor),
      };
    }
  }

    // 3. Pattern placement: inside french tip, inside stamp, or flat layer
    if (shouldApplyToFinger(fingerKey, accentKeys)) {
      finger = applyPatternToBestPlacement({
        finger,
        prompt: promptLower,
        patterns,
        variantIndex,
      });

      // 4. Stamp matching
      finger = applyPromptStampToFinger({
        finger,
        prompt: promptLower,
        stamps,
        variantIndex,
      });

      // 5. Charm matching
      finger = applyPromptCharmToFinger({
        finger,
        prompt: promptLower,
        charms,
        fingerKey,
        variantIndex,
      });

      // 6. Gel art
      finger = applyPromptGelArtToFinger({
        finger,
        prompt: promptLower,
        gelArt3D,
        fingerKey,
        shape: finger.shape || design.shape,
        length: finger.length || design.length,
        variantIndex,
      });

      // 7. Stickers, future update
      finger = applyPromptStickerToFinger({
        finger,
        prompt: promptLower,
        stickers,
        variantIndex,
      });
    }

    nextDesign.fingers[fingerKey] = finger;
  }

  return nextDesign;
}

module.exports = {
  applyPromptOverridesToDesign,
};