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

function promptWantsFrench(promptLower, intent = {}) {
  return (
    intent?.frenchTipStyle ||
    intent?.specificFrenchTipStyle ||
    promptLower.includes('french') ||
    promptLower.includes('tip') ||
    promptLower.includes('v-cut') ||
    promptLower.includes('v cut') ||
    promptLower.includes('deep u') ||
    promptLower.includes('deep v') ||
    promptLower.includes('classic u') ||
    promptLower.includes('classic v') ||
    promptLower.includes('straight') ||
    promptLower.includes('diagonal') ||
    promptLower.includes('outline') ||
    promptLower.includes('reverse') 
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

function recolorPaintLayer(paintLayer, matchedColor) {
  if (!paintLayer || !matchedColor) return paintLayer;

  const newBase = buildBaseFromColorDoc(matchedColor);

  return {
    ...paintLayer,
    base: {
      ...(paintLayer.base || {}),
      ...newBase,
      name: newBase.colorName,
    },
    color: {
      ...(paintLayer.color || {}),
      ...newBase,
      name: newBase.colorName,
    },
  };
}

function applyMatchedColorToFingerArt(finger, matchedColor, { wantsFrench = false } = {}) {
  if (!finger || !matchedColor) return finger;

  const newBase = buildBaseFromColorDoc(matchedColor);

  const layers = Array.isArray(finger.layers) ? [...finger.layers] : [];

  const recoloredLayers = layers.map((layer) => {
    if (!layer) return layer;

    // French tip color
    if (layer.type === 'french_tip') {
      return {
        ...layer,
        base: newBase,
        paintLayers: Array.isArray(layer.paintLayers)
          ? layer.paintLayers.map((p) => recolorPaintLayer(p, matchedColor))
          : layer.paintLayers,
      };
    }

    // Normal paint layer
    if (layer.type === 'paint') {
      return recolorPaintLayer(layer, matchedColor);
    }

    // Any layer that has nested paintLayers
    if (Array.isArray(layer.paintLayers)) {
      return {
        ...layer,
        paintLayers: layer.paintLayers.map((p) => recolorPaintLayer(p, matchedColor)),
      };
    }

    return layer;
  });

  return {
    ...finger,

    // If user asked french/pattern color, don't always recolor the whole base.
    base: wantsFrench ? finger.base : newBase,

    layers: recoloredLayers,
  };
}

function applyPatternToExistingTemplatePattern({
  finger,
  prompt,
  intent = {},
  patterns,
  variantIndex,
}) {
  if (!finger) return finger;

  const layers = Array.isArray(finger.layers) ? [...finger.layers] : [];

  const matchedPattern = pickMatchingPattern({
    prompt,
    intent,
    patterns,
    variantIndex,
  });

  if (!matchedPattern) return finger;

  let changed = false;

  const nextLayers = layers.map((layer) => {
    if (!layer) return layer;

    // Case 1: existing flat pattern layer
    if (layer.type === 'pattern') {
      changed = true;
      return buildPatternLayerFromDoc({
        pattern: matchedPattern,
        existingLayer: layer,
        variantIndex,
        index: layer.index ?? 0,
      });
    }

    // Case 2: pattern inside french tip
    if (layer.type === 'french_tip' && layer.pattern) {
      changed = true;
      return {
        ...layer,
        pattern: buildPatternLayerFromDoc({
          pattern: matchedPattern,
          existingLayer: layer.pattern,
          variantIndex,
          index: layer.index ?? 0,
        }),
      };
    }

    // Case 3: patternFill inside paint layer
    if (layer.patternFill) {
      changed = true;
      return {
        ...layer,
        patternFill: {
          ...(layer.patternFill || {}),
          patternId: matchedPattern.patternId || matchedPattern.id || matchedPattern.docId,
          patternRef: matchedPattern.patternId || matchedPattern.id || matchedPattern.docId,
          name: matchedPattern.name || layer.patternFill?.name || '',
          tags: Array.isArray(matchedPattern.tags) ? matchedPattern.tags : [],
          thumbnailUi: matchedPattern.uiThumbnailUrl || matchedPattern.canvasUiUrl || '',
          canvasUiUrl: matchedPattern.canvasUiUrl || matchedPattern.uiThumbnailUrl || '',
          uiImageUrl: matchedPattern.canvasUiUrl || matchedPattern.uiThumbnailUrl || '',
        },
      };
    }

    return layer;
  });

  // Important: if template had no pattern slot, do NOT add one.
  if (!changed) return finger;

  return {
    ...finger,
    layers: nextLayers,
  };
}

function ensureFrenchTipLayer({ finger, shape, length, matchedColor, variantIndex = 0 }) {
  if (!finger) return finger;

  const layers = Array.isArray(finger.layers) ? [...finger.layers] : [];

  const existingFrenchIndex = layers.findIndex((layer) => {
    return layer && layer.type === 'french_tip';
  });

  // If there is no french tip layer, do nothing here.
  // The real french tip matcher should add one when needed.
  if (existingFrenchIndex < 0) {
    return finger;
  }

  const oldFrenchTip = layers[existingFrenchIndex];

  const safeShape = String(finger.shape || shape || '').trim().toLowerCase();
  const safeLength = String(finger.length || length || '').trim().toLowerCase();

  const selectedStyle = String(oldFrenchTip.style || 'classic_u').trim();
  const selectedVariant = String(
    oldFrenchTip.variant || oldFrenchTip.variation || 'medium'
  ).trim();

  // This only rebuilds the mask URL using the same style/variant.
  // The local french_tip catalog matcher is the source of truth.
  layers[existingFrenchIndex] = {
    ...oldFrenchTip,
    style: selectedStyle,
    variant: selectedVariant,
    canvasMaskUrl:
      `https://nailzotica.s3.us-east-2.amazonaws.com/design_assets/nails/french_tip/${safeShape}_${safeLength}/ui_mask_nail_${safeShape}_${safeLength}_french_tip_${selectedStyle}_${selectedVariant}.png`,
    unityMaskUrl:
      `https://nailzotica.s3.us-east-2.amazonaws.com/design_assets/nails/french_tip/${safeShape}_${safeLength}/unity_mask_nail_${safeShape}_${safeLength}_french_tip_${selectedStyle}_${selectedVariant}.png`,
    shape: safeShape,
    length: safeLength,
    base: matchedColor ? buildBaseFromColorDoc(matchedColor) : oldFrenchTip.base,
    widthNorm: 1,
    heightNorm: 1,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    visible: true,
  };

  return {
    ...finger,
    layers,
  };
}

function applyPromptOverridesToDesign({
  design,
  prompt,
  intent = {},
  complexity = '',
  colorLibrary = [],
  charms = [],
  frenchTips = [],
  frenchTipCatalog = null,
  patterns = [],
  stamps = [],
  gelArt3D = [],
  stickers = [],
  variantIndex = 0,
}) {
  if (!design || !design.fingers) return design;

  const promptLower = norm(prompt);

 const matchedColor = matchBaseColor(
    {
      ...(intent || {}),
      prompt: promptLower,
    },
    colorLibrary
  );

  const wantsFrench = promptWantsFrench(promptLower, intent);
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
      intent,
      frenchTips,
      frenchTipCatalog,
      shape: finger.shape || design.shape,
      length: finger.length || design.length,
      variantIndex,
    });
    
    const hasFrenchTip =
      Array.isArray(finger.layers) &&
      finger.layers.some((layer) => layer && layer.type === 'french_tip');

    const needsFrenchMaskSwap =
      hasFrenchTip &&
      (
        wantsFrench ||
        finger.shapeAdapted === true ||
        finger.lengthAdapted === true
      );

    if (needsFrenchMaskSwap) {
      finger = ensureFrenchTipLayer({
        finger,
        shape: finger.shape || design.shape,
        length: finger.length || design.length,
        matchedColor,
        variantIndex,
      });
    }

    // 3. Color correction for French tips/base
   if (matchedColor) {
      finger = applyMatchedColorToFingerArt(finger, matchedColor, {
        wantsFrench,
      });
    }

    // 4. Pattern placement: inside french tip, inside stamp, or flat layer
    if (shouldApplyToFinger(fingerKey, accentKeys)) {
      finger = applyPatternToExistingTemplatePattern({
        finger,
        prompt: promptLower,
        intent,
        patterns,
        variantIndex,
      });

      // 5. Stamp matching
      finger = applyPromptStampToFinger({
        finger,
        prompt: promptLower,
        intent,
        stamps,
        variantIndex,
      });

      // 6. Charm matching
      finger = applyPromptCharmToFinger({
        finger,
        prompt: promptLower,
        charms,
        intent,
        fingerKey,
        variantIndex,
      });

      // 7. Gel art
      finger = applyPromptGelArtToFinger({
        finger,
        prompt: promptLower,
        gelArt3D,
        intent,
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