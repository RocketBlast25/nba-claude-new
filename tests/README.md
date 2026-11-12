# Test Infrastructure

**Engine**: Web (Vite 8.3.4)
**Test Framework**: Vitest (the rules) and Playwright (the game in a browser)
**CI**: `.github/workflows/tests.yml`
**Setup date**: 2026-11-12

## Directory Layout

```
tests/
  unit/           # Vitest: the rules in src/game/, run in Node with no browser
  integration/    # Playwright: the single-file build in a browser, driven through window.game
  smoke/          # Critical path test list for /smoke-check gate
```

```
production/qa/
  evidence/       # Screenshot logs and manual test sign-off records
```

> **Manual evidence lives under `production/qa/evidence/`, not `tests/`** — that
> is where every consumer reads it.

## Running Tests

```bash
npm test              # Vitest, then Playwright
npm run test:unit     # Vitest only
npm run test:e2e      # build:single, then Playwright
npm run smoke         # build:single, then the @boot test
```

Playwright opens `dist-single/index.html` from disk (`npm run build:single`
makes it), so no server and no port are needed. It launches the browser
`.claude/scripts/page-shot.sh --which` prints, the one every check uses. With
none, install one, once: `npx playwright install chromium-headless-shell`.
Each half exits 0 when every test passed and non-zero when one failed. A half
with no test file fails too: Vitest prints `No test files found` and Playwright
`No tests found`; neither is a pass.

## Test Naming

Names follow the engine's language (`.claude/rules/test-standards.md`):
- **Web**: file `[module].test.ts` (Vitest) or `[system].spec.ts` (Playwright),
  test `'[scenario] [expected]'` — `rules.test.ts` → `it('keeps the square inside the field')`

## Story Type → Test Evidence

| Story Type | Required Evidence | Location |
|---|---|---|
| Logic | Automated unit test — must pass | `tests/unit/[system]/` |
| Integration | Integration test OR playtest doc | `tests/integration/[system]/` |
| Visual/Feel | Screenshot + lead sign-off | `production/qa/evidence/` |
| UI | Retained screenshot of each screen touched | `production/qa/evidence/` |
| Config/Data | Smoke check pass | `production/qa/smoke-*.md` |

## CI

Tests run automatically on every push to `main` and on every pull request.
A failed test suite blocks merging. CI runs `npm ci`, then `npm test`, with
the runner's Chrome.
