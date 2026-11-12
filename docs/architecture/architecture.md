# NBA Career Simulator — Master Architecture

## Document Status
- Version: 1
- Last Updated: 2026-11-12
- Engine: Web (TypeScript 7.0.2, Vite 8.3.4, Vitest 5.0.5, React 19, Zustand 5, Playwright 1.64.1)
- GDDs Covered: `design/gdd/nba-career-simulator.md` (layout, background sim, decision UI), plus the full feature set confirmed by the owner (82-game season, 16-team playoffs, draft and free agency, 60 Hz Key Moment engine, 50+ off-court events, stamina/injury, team chemistry, attribute progression 25–99 with badges, salary cap)
- ADRs Referenced: none yet (see Required ADRs)

## Engine Knowledge Gap Summary
- HIGH: TypeScript 7.0 is a native compiler with no JavaScript API. Use `tsc --noEmit` as the type check. Set `types: ["vite/client"]` and `rootDir` explicitly.
- HIGH: Vite 8 uses Rolldown and Oxc. Build options are `build.rolldownOptions`, not `rollupOptions`.
- MEDIUM: Vitest 5 clears mocks before each test (`clearMocks` defaults to true), and it needs Node 22.12+.
- LOW: Playwright 1.64 is additive. It is out of Milestone 1 scope.

## System Layer Map (approved 2026-11-12)

| Layer | Modules | Owns |
|---|---|---|
| Platform | Browser, Canvas 2D, IndexedDB, `devicePixelRatio` | Browser APIs only; no project code |
| Foundation | `sim/core` (seeded RNG, branded IDs), `data/` (JSON loader and schema validation), `persistence/` (versioned save slots) | RNG streams, data schema, save format and migrations |
| Core | `sim/` (models, team-possession background model, progression, contracts and cap, playoffs, draft, free agency, retirement) | Game state, box scores, league rules. Pure TypeScript. |
| Feature | `possession/` (60 Hz Key Moment engine, decision cards, shot resolution), `sim/events` (off-court events), career loop (season and offseason orchestration) | In-game possession state, season flow, event selection |
| Presentation | `store/` (Zustand adapter), `ui/` (React screens, Canvas court renderer, responsive CSS) | Rendering and input only. No rules. |

## Module Ownership

- Enforcement: a Vitest import-boundary test fails if any file under `src/sim` or `src/possession` imports `react`, `react-dom`, or a DOM or Canvas global. It is planned for Milestone 2.
- `src/sim/core`: `SeededRng`, `Id<T>`, `Attributes`, `Badge`, `Player`, `Team`, `Contract`, `GameBoxScore`. Owns all shared types. Must not import from any other `src` folder.
- `src/sim/league`: schedule (82 games), standings, playoffs (Play-In and 16-team bracket), NBA Cup, draft lottery. Owns season state transitions.
- `src/sim/background`: team-possession model for non-Key-Moment games. Owns the stat distribution and integer box-score reconciliation.
- `src/sim/progression`: attribute growth and decline by age, badge unlocks, stamina and injury, team chemistry.
- `src/sim/economy`: salary cap, luxury tax, contracts, re-signing, free-agency interest, retirement.
- `src/possession`: fixed-step 60 Hz engine, `PossessionState`, `CourtEntity`, decision resolution. Owns the Key Moment loop. No DOM or Canvas imports.
- `src/data`: JSON content for off-court events, badges and league seed data. Loaded and validated at startup.
- `src/persistence`: IndexedDB adapter, 3–5 save slots, schema version and migrations.
- `src/store`: Zustand stores wrapping sim and possession results. Owns UI-facing state only.
- `src/ui`: React components, the responsive stylesheet, and the court `<canvas>` renderer.

## Architecture Principles

1. `sim/` and `possession/` are pure TypeScript with no React, DOM or Canvas imports. They are tested headless with Vitest.
2. All randomness goes through `SeededRng`. Given a seed, a run is deterministic.
3. The UI never computes game results. It sends decisions to the core and renders the returned state.
4. Save data carries a schema version, and every change ships with a migration.
5. Features are built against the GDD and tests, not against the UI.

## Data Flow

- **Season loop:** `league` schedules games → `background` simulates non-Key-Moment games → `progression` and `economy` update players and contracts → `persistence` writes a save at each phase boundary.
- **Key Moment:** `store` requests a moment → `possession` runs the fixed 60 Hz loop → at a decision pause the engine emits four action cards with live success % → the player picks → `possession` resolves the result and returns box-score deltas to `sim`.
- **Off-court events:** `data` supplies event JSON → `sim/events` selects one by context and seed → the choice is applied through `economy` or `progression`.
- **Rendering:** `ui` reads store state. The court canvas redraws on resize at `devicePixelRatio`.

## API Boundaries

- `sim` exports plain functions and types only. They take a state and a seed, and return a new state and events.
- `possession` exports `createPossession(seed, input)`, `step(state, dtMs)`, and `decide(state, actionId)`. It is driven by a fixed-step loop, never by `requestAnimationFrame` timing. The fixed-step accumulator lives inside `possession`; callers pass only the elapsed milliseconds.
- `persistence` exports `saveSlot(n, state)`, `loadSlot(n)`, and `listSlots()`. Each load runs the migration chain.
- `store` is the only module `ui` imports for game state.

## ADR Audit

No ADRs exist yet. Every decision in this document is open.

## Required ADRs

1. **ADR-001: Pure-core boundary (Accepted, see adr-001-pure-core-boundary.md).** `sim/` and `possession/` have no React, DOM or Canvas imports. Enforced by a lint or test check.
2. **ADR-002: Background game model.** Team-possession statistical model, with the 82-game under-1-second target verified by benchmark.
3. **ADR-003: Fixed-step Key Moment loop (Accepted, see adr-003-fixed-step-loop.md).** 60 Hz fixed step, independent of frame rate.
4. **ADR-004: Save format and migrations.** Versioned IndexedDB slots with 3–5 slots. Must define the phase boundaries at which saves are written (follow-up from section 4 review).
5. **ADR-005: Data-driven content.** JSON schema for off-court events and badges, validated at load.
6. **ADR-006: Salary cap model.** Cap, tax and contract rules as data-driven constants.

## Technical Director Sign-Off

Approved by the owner, section by section, on 2026-11-12:
- Section 1 (Document Status and Engine Knowledge Gap Summary): approved.
- Section 2 (System Layer Map): approved, with NBA Cup and draft lottery added to `sim/league`.
- Section 3 (Module Ownership): approved, with a planned Vitest import-boundary test.
- Section 4 (Data Flow): approved; phase boundaries to be defined in ADR-004.
- Section 5 (API Boundaries): approved; the fixed-step accumulator lives in `possession`.
- Section 6 (ADR Audit and Required ADRs): approved; six ADRs are open, with ADR-001 and ADR-003 first.

Open items: write ADR-002, ADR-004, ADR-005 and ADR-006. ADR-001 and ADR-003 are Accepted.
