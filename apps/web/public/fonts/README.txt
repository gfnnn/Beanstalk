Self-hosted web fonts for beansprout.ink
========================================

The "latin" subset of each family, as served by Google Fonts (fetched 2026-11-18).
Declared in apps/web/src/styles/fonts.css.

  fraunces-latin.woff2          Fraunces (roman), variable: optical size + weight   — v38, unmodified
  fraunces-italic-latin.woff2   Fraunces (italic), variable: optical size + weight  — v38, unmodified
  karla-latin.woff2             Karla (roman), variable: weight                     — v33, trimmed
  jetbrains-mono-latin.woff2    JetBrains Mono (roman), variable: weight            — v24, trimmed

"Trimmed" = OpenType features that no CSS on the site turns on were removed, along
with the alternate glyphs only they reach: fractions and tabular/proportional
figures in Karla; code ligatures (calt) and fractions in JetBrains Mono. Every
character and every weight the original file covers is still there, and every page
renders pixel-for-pixel as it did with the originals. If the site ever sets
font-feature-settings or font-variant-numeric on these two, re-fetch the original.

How: fonttools' subsetter (pyftsubset) over the Google file, keeping every character
it maps and hinting, name records and axes as they were, with the layout features
limited to kern, mark, mkmk, ccmp, locl, rvrn (plus liga for Karla).

The Fraunces files are deliberately untouched: narrowing their weight range saved
only ~5% and changed how the letters rasterise.

Licence: all three families are licensed under the SIL Open Font License,
Version 1.1 — https://openfontlicense.org

  Fraunces        Copyright The Fraunces Project Authors (https://github.com/undercasetype/Fraunces)
  Karla           Copyright The Karla Project Authors (https://github.com/googlefonts/karla)
  JetBrains Mono  Copyright The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)
