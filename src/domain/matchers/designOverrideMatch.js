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

function applyPromptOverridesToDesign({
  design,
  prompt,
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

  const fingersAreArray = Array.isArray(design.fingers);

  const nextDesign = {
    ...design,
    fingers: fingersAreArray ? [...design.fingers] : { ...design.fingers },
  };

  const fingerKeys = fingersAreArray
    ? nextDesign.fingers.map((_, index) => index)
    : Object.keys(nextDesign.fingers);

  for (const fingerKey of fingerKeys) {
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

    // 2. Color correction for French tips/base
    if (matchedColor) {
      const wantsFrenchColor =
        promptLower.includes('french') ||
        promptLower.includes('tip') ||
        promptLower.includes('v-cut') ||
        promptLower.includes('v cut');

      if (wantsFrenchColor) {
        finger = applyColorToFrenchTips(finger, matchedColor);
      } else {
        finger = {
          ...finger,
          base: buildBaseFromColorDoc(matchedColor),
        };
      }
    }

    // 3. Pattern placement: inside french tip, inside stamp, or flat layer
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

    nextDesign.fingers[fingerKey] = finger;
  }

  console.log('🧪 OVERRIDE RESULT CHECK', {
    shape: nextDesign.shape,
    length: nextDesign.length,
    fingersIsArray: Array.isArray(nextDesign.fingers),
    fingersLen: Array.isArray(nextDesign.fingers)
      ? nextDesign.fingers.length
      : Object.keys(nextDesign.fingers || {}).length,
    firstFingerBase: nextDesign.fingers?.[0]?.base,
    firstFingerLayers: nextDesign.fingers?.[0]?.layers,
    firstFingerCharms: nextDesign.fingers?.[0]?.charms,
  });

  return nextDesign;
}

module.exports = {
  applyPromptOverridesToDesign,
};