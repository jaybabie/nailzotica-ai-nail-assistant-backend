# Nailzotica AI Nail Assistant

A production backend service that converts natural-language nail design requests into structured, application-ready nail designs.

The Nail Assistant combines large-language-model interpretation with deterministic domain logic, asset matching, validation, and normalization. Rather than relying on an LLM to generate arbitrary UI output, the service translates user intent into designs that conform to Nailzotica's existing nail shapes, colors, templates, charms, patterns, effects, and application schema.

## Overview

A user can describe a design in natural language, for example:

> "Medium almond pink French tips with silver charms and butterflies."

The backend interprets the request, identifies relevant design attributes, matches them against supported application assets, constructs one or more complete nail designs, validates the result, and returns structured JSON that the mobile application can render.

The system supports concepts including:

- Nail shape and length
- Design complexity
- Color families and specific colors
- French-tip styles
- Finishes and effects
- Patterns and motifs
- Charms and decorative assets
- Finger-specific instructions
- Mirrored hand designs
- Multiple design variants

## Architecture

The service is built as a layered Node.js/Express backend.

```text
Mobile Client
     |
     v
Firebase Authentication
     |
     v
Express API
     |
     v
Request Validation & Normalization
     |
     v
AI Intent Interpretation
     |
     v
Domain Matching / Ranking
     |
     +---- Color Catalog
     +---- Nail Catalog
     +---- French Tip Catalog
     +---- Finger Templates
     +---- Charms / Patterns / Assets
     |
     v
Deterministic Design Construction
     |
     v
Schema Validation & Normalization
     |
     v
Structured Nail Design JSON
     |
     v
Flutter Mobile Client