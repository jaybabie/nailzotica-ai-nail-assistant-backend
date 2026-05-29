// src/domain/matchers/patternPlacementMatcher.js

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function decidePatternPlacement(prompt) {
  const p = norm(prompt);

  const wantsFrench =
    p.includes('french') ||
    p.includes('french tip') ||
    p.includes('tip');

  const wantsStamp =
    p.includes('stamp') ||
    p.includes('stamped') ||
    p.includes('decal') ||
    p.includes('sticker');

  const wantsAccent =
    p.includes('accent') ||
    p.includes('accent nail') ||
    p.includes('ring finger');

  if (wantsFrench) {
    return 'inside_french_tip';
  }

  if (wantsStamp) {
    return 'inside_stamp';
  }

  if (wantsAccent) {
    return 'accent_layer';
  }

  return 'flat_layer';
}

function applyPatternPlacement({
  finger,
  patternLayer,
  placement,
}) {
  if (!finger || !patternLayer) return finger;

  const layers = Array.isArray(finger.layers) ? [...finger.layers] : [];

  if (placement === 'inside_french_tip') {
    const frenchIndex = layers.findIndex((l) => l?.type === 'french_tip');

    if (frenchIndex >= 0) {
      layers[frenchIndex] = {
        ...layers[frenchIndex],
        pattern: patternLayer,
      };

      return {
        ...finger,
        layers,
      };
    }

    return {
      ...finger,
      layers: [...layers, patternLayer],
    };
  }

  if (placement === 'inside_stamp') {
    const stampIndex = layers.findIndex((l) => l?.type === 'stamp');

    if (stampIndex >= 0) {
      layers[stampIndex] = {
        ...layers[stampIndex],
        pattern: patternLayer,
      };

      return {
        ...finger,
        layers,
      };
    }

    return {
      ...finger,
      layers: [...layers, patternLayer],
    };
  }

  return {
    ...finger,
    layers: [...layers, patternLayer],
  };
}

module.exports = {
  decidePatternPlacement,
  applyPatternPlacement,
};