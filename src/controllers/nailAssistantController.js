// src/controllers/nailAssistantController.js

const nailAssistantService = require('../services/nailAssistantService');
const {
  normalizeNailAssistantResponse,
} = require('../utils/normalizeNailAssistantResponse');
const crypto = require('crypto');

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

const toStr = (v) =>
  v == null ? '' : String(v);

const normLowerOrNull = (v) => {
  const s = toStr(v)
    .trim()
    .toLowerCase();

  return s ? s : null;
};

const toIntOrNull = (v) => {
  if (v == null || v === '') {
    return null;
  }

  const n = Number(v);

  return Number.isFinite(n)
    ? Math.trunc(n)
    : null;
};

const toBoolOrNull = (v) => {
  if (v === true || v === false) {
    return v;
  }

  if (v == null) {
    return null;
  }

  const s = String(v)
    .trim()
    .toLowerCase();

  if (
    [
      '1',
      'true',
      'yes',
      'y',
      'on',
    ].includes(s)
  ) {
    return true;
  }

  if (
    [
      '0',
      'false',
      'no',
      'n',
      'off',
    ].includes(s)
  ) {
    return false;
  }

  return null;
};

const cleanAutoTokens = (s) => {
  if (!s) {
    return null;
  }

  if (
    [
      'auto',
      'any',
      'default',
      'detect',
      'none',
      'null',
    ].includes(s)
  ) {
    return null;
  }

  return s;
};

/*
 * Shape/length overrides are OPTIONAL.
 *
 * Empty values, "auto", "default", etc.
 * become null so the normal AI resolver
 * can choose the value instead.
 */
const normalizeOptionalOverride = (v) => {
  return cleanAutoTokens(
    normLowerOrNull(v)
  );
};

const genId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${crypto
        .randomBytes(8)
        .toString('hex')}`;

const nowIso = () =>
  new Date().toISOString();

function stripMetaDuplicates(meta) {
  const m =
    meta &&
    typeof meta === 'object'
      ? { ...meta }
      : {};

  delete m.mirrorHands;
  delete m.count;
  delete m.model;
  delete m.designCount;

  return m;
}

// ---------------------------------------------------------
// Complexity
// ---------------------------------------------------------

const ALLOWED_COMPLEXITY = new Set([
  'low',
  'medium',
  'complex',
]);

function normalizeComplexity(v) {
  const s = cleanAutoTokens(
    normLowerOrNull(v)
  );

  if (!s) {
    return null;
  }

  return ALLOWED_COMPLEXITY.has(s)
    ? s
    : null;
}

// ---------------------------------------------------------
// Controller
// ---------------------------------------------------------

exports.generateDesign = async (
  req,
  res,
  next
) => {
  try {
    const body =
      req.body || {};

    const userId =
      req?.user?.uid || null;

    // -----------------------------------------------------
    // Required prompt
    // -----------------------------------------------------

    const prompt =
      toStr(body.prompt).trim();

    if (!prompt) {
      return res.status(400).json({
        error:
          'prompt (string) is required',
      });
    }

    // -----------------------------------------------------
    // Existing generation settings
    // -----------------------------------------------------

    const mode =
      cleanAutoTokens(
        normLowerOrNull(body.mode)
      ) || 'single';

    const count =
      toIntOrNull(body.count);

    const mirrorHands =
      toBoolOrNull(
        body.mirrorHands
      );

    const model =
      cleanAutoTokens(
        normLowerOrNull(body.model)
      );

    const complexity =
      normalizeComplexity(
        body.complexity
      );

    // -----------------------------------------------------
    // OPTIONAL shape / length overrides
    // -----------------------------------------------------
    //
    // These may be:
    //
    //   null
    //   undefined
    //   ""
    //   "auto"
    //   "default"
    //
    // In all of those cases we simply DON'T force
    // an override and allow the existing resolver
    // to choose shape/length.
    //
    // If supplied:
    //
    //   shapeOverride: "square"
    //   lengthOverride: "medium"
    //
    // they are forwarded to the service.
    // -----------------------------------------------------

    const shapeOverride =
      normalizeOptionalOverride(
        body.shapeOverride ??
          body.shape
      );

    const lengthOverride =
      normalizeOptionalOverride(
        body.lengthOverride ??
          body.length
      );

    // -----------------------------------------------------
    // Seed
    // -----------------------------------------------------

    let seed =
      toIntOrNull(body.seed);

    if (seed == null) {
      seed = Date.now();
    }

    // -----------------------------------------------------
    // Build service payload
    // -----------------------------------------------------

    const payload = {
      prompt,
      mode,
      seed,
    };

    if (count != null) {
      payload.count =
        count;
    }

    if (
      mirrorHands !== null
    ) {
      payload.mirrorHands =
        mirrorHands;
    }

    if (model) {
      payload.model =
        model;
    }

    if (complexity) {
      payload.complexity =
        complexity;
    }

    /*
     * Only add overrides when they actually exist.
     *
     * This means the existing Nailzotica AI generator,
     * which sends neither field, behaves exactly as
     * it did before.
     */
    if (shapeOverride) {
      payload.shapeOverride =
        shapeOverride;
    }

    if (lengthOverride) {
      payload.lengthOverride =
        lengthOverride;
    }

    // -----------------------------------------------------
    // Generate
    // -----------------------------------------------------

    const serviceResult =
      await nailAssistantService
        .generateDesign(
          payload
        );

    // -----------------------------------------------------
    // Normalize into existing Nailzotica response schema
    // -----------------------------------------------------

    const normalized =
      normalizeNailAssistantResponse({
        userId,
        requestPayload:
          payload,
        serviceResult,
      });

    // -----------------------------------------------------
    // Preserve existing response contract
    // -----------------------------------------------------

    const response = {
      userId:
        normalized.userId ??
        userId ??
        null,

      prompt:
        normalized.prompt ??
        prompt,

      model:
        normalized.model ??
        model ??
        null,

      complexity:
        complexity ??
        normalized?.meta
          ?.chosenComplexity ??
        normalized?.meta
          ?.complexity ??
        null,

      designCount:
        normalized.designCount ??
        (
          Array.isArray(
            normalized.generatedDesigns
          )
            ? normalized
                .generatedDesigns
                .length
            : 0
        ),

      mirrorHands:
        normalized.mirrorHands ??
        (
          mirrorHands ??
          null
        ),

      createdAt:
        normalized.createdAt ??
        nowIso(),

      generationBatchId:
        normalized
          .generationBatchId ??
        genId(),

      aiModelUsed:
        normalized
          .aiModelUsed ??
        null,

      meta:
        stripMetaDuplicates(
          normalized.meta
        ),

      generatedDesigns:
        Array.isArray(
          normalized.generatedDesigns
        )
          ? normalized
              .generatedDesigns
          : [],
    };

    return res.json(
      response
    );
  } catch (err) {
    console.error(
      '❌ Error in generateDesign controller:',
      err
    );

    if (
      !res.headersSent
    ) {
      return res
        .status(500)
        .json({
          error:
            err?.message ||
            'Internal server error',

          where:
            'nailAssistantController.generateDesign',

          stack:
            err?.stack,
        });
    }

    return next(err);
  }
};