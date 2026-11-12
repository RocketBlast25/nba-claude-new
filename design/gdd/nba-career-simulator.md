# NBA Career Simulator — Design Notes (Prototype)

Status: Draft for review. No code has been written.
Engine: Web / TypeScript 7.0.2 / React 19 / Vite 8.3.4 (see `project.yaml`).

## 1. Responsive Layout (Mobile 375px+ and Desktop 1280×720+)

One responsive UI. There are no separate mobile and desktop builds.

**Layout rules**
- Use CSS Grid/Flexbox. Below 768px the layout stacks vertically (court → decision cards → box score → tabs). From 1280px it expands into multi-column panels (court and decisions in the centre, roster and ticker in side columns). Between 768px and 1280px it uses a two-column layout.
- Breakpoints are content-driven and set in one stylesheet. Components do not branch on device type.
- The court `<canvas>` scales to the container width. Its intrinsic size is a fixed logical resolution (for example 940×500 for the half-court, a 1.88:1 ratio), and CSS sets `width: 100%; height: auto`. Backing-store size is multiplied by `devicePixelRatio` and redrawn on resize. Aspect ratio is always preserved, and the canvas never overflows the viewport.
- Text and HUD use relative units (`rem`, `clamp()`). Minimum supported width is 375px with no horizontal scrolling.

**Input rules**
- Every button and each of the 4 tactical decision cards has `min-height: 44px` and `min-width: 44px`, with adequate padding and spacing for thumb tapping.
- All interactions are triggered by `click`/tap. There is no hover-only information. Anything shown on hover (such as success % or risk detail) is shown persistently on the card, or on tap.
- Keyboard hotkeys (1–4, Space) are additive on desktop. They do not replace touch targets.
- Touch uses pointer events, with no reliance on `mouseenter`/`mouseleave`.

**Acceptance**
- At 375×667 and 1280×720, all controls are at least 44px tall, and the court is fully visible without horizontal scroll.
- The four decision cards are usable with touch alone, and the decision pause is reachable by tapping.

## 2. Background Game Simulation (Fast Team-Possession Model)

Background games (everything except Key Moments) use a statistical team-possession model. It is not run through the 2D engine.

**Per game**
1. Team possessions: `poss_team = pace_team × (minutes_played / 48)`, adjusted for each team's offensive and defensive ratings. `pace` is a league-normalised value. Overtime adds 5 minutes per period.
2. Possession outcomes per team: shot attempts, free-throw trips, turnovers. Each share is set from team rates (rates derive from roster attributes and usage).
3. Shot distribution: each shot attempt is assigned to a player with probability proportional to `usage_rate × minutes_share × shot_skill_weight` (shot skill from finishing, mid-range, and three-point attributes). Shot zone and make probability come from the zone and attribute tables.
4. Assists: credited to a teammate with probability tied to passing and the shooter's make rate, capped at the team's assisted-FGM rate.
5. Rebounds: offensive and defensive rebound shares derive from rebounding, height, and minutes.
6. Steals, blocks: from perimeter/interior defense and minutes.
7. Turnovers: from ball handling and usage, distributed by usage share.
8. Minutes: from the rotation, coach trust, and stamina (below 60 stamina reduces minutes and performance). Foul trouble is modelled as a minutes reduction.
9. All counts are integers. The sum of player box scores must equal team totals.

**Performance target**
- A full 82-game season (1,230 regular-season games) must simulate in under 1 second on a mid-range laptop.
- This is a target, not a measured result. It is verified with a benchmark before any speed claim is made.

**Output**
- Full box score per player (MIN, PTS, REB, AST, STL, BLK, TOV, FGM/FGA, 3PM/3PA, FTM/FTA), aggregated into season, playoff, and career totals.

**Acceptance**
- Seeded runs are deterministic.
- Team totals equal the sum of player stats.
- Over many seasons, league averages stay within configured ranges (points per game, pace, FG%).
- A season benchmark test asserts the time limit.

## 3. Decision and Key Moment UI

- At each decision pause, the four tactical choices are shown as cards. Each card shows the action name, the live success %, and a risk/reward line, all visible without hover.
- The clock stops during the pause. There is no time limit.
- Each card is a button with `min-height: 44px`. Hotkeys 1–4 map to the same actions.

## 4. Open Items

1. Confirm the `platform` and `performance` keys in `project.yaml` pass the `/project-settings` validator (the enum check covers `platform.cert_tier`, `platform.online`, and `platform.touch_support` with its `Full|Partial|None` values).
2. Milestone 1 (scaffolding Vite + React + TypeScript, plus the seeded PRNG and core data models) is pending your confirmation.
