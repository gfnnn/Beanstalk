# Tests — `@beansprout/web`

Unit tests for the **build-time HTML renderers** and the **data contract** that
feeds them — the parts of the frontend where a silent regression actually causes
harm. (The Netlify function tests live in the other workspace,
`apps/functions/tests/`.)

```bash
npm run test:web          # from the repo root
# or, inside this workspace:
npm test                  # run once
npm run test:watch        # watch mode
npm run test:coverage
```

Runner: [Vitest](https://vitest.dev) (`environment: node`, see `vitest.config.js`,
kept separate from `vite.config.js` so the build-only grid plugin isn't pulled in).

## What's covered

| File | Tests |
| --- | --- |
| `tests/renderers.test.js` | `renderPortfolioTiles` / `renderFlashCards` — responsive `<picture>` vs. placeholder, eager/lazy LCP loading, status-gated claim buttons, HTML escaping, sort order. |
| `tests/data-integrity.test.js` | `pieces.js` / `flash.js` contract: unique slugs/ids, required fields, and every `style`/`placement`/`glyph`/`status` token matches the documented set the renderers and filter chips expect (CLAUDE.md: "change them together"). |

## Not yet covered

The client modules under `src/js/modules/` are DOM/scroll/event-coupled and
belong in a future browser/E2E tier (e.g. Playwright) rather than these Node
unit tests — deferred until the copy and real images are finalised.
