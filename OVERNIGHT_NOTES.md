# DUI — Work History

## Session — 2026-05-15 (West Seattle art / port cranes / revert note)

### What was worked on
- Reviewed the West Seattle building/crane setup after the port cranes were showing visually through or across the bridge road.
- Confirmed the crane spawn logic lives in [src/road/RouteData.js](src/road/RouteData.js), not only in the image folder:
  - Bellevue, Issaquah, Seattle, and West Seattle building image keys are referenced from route/scenery data.
  - The actual image files live under `public/assets/buildings/codex/` for the newer Codex-generated art.
- Reviewed West Seattle bridge crane rendering in [src/scenes/GameScene.js](src/scenes/GameScene.js) and bridge/railing drawing in [src/road/Road.js](src/road/Road.js).

### Art/assets created or discussed
- West Seattle art direction was adjusted toward higher-quality, more realistic scenery to match the Bellevue and Issaquah assets.
- Port/shipping-container crane direction:
  - two crane color families requested: orange/rust and white/gray
  - left/right variants requested so cranes match road perspective
  - shipping-container stacks requested as one combined PNG-style asset
- Seattle building order was discussed for a south-to-north pass:
  - stadium/SODO elements first
  - downtown south towers next
  - denser central/waterfront skyline after that

### Code review notes from this session
- The biggest visible issue is not the crane art itself; it is scenery placement/rendering:
  - cranes are very wide/tall scenery sprites
  - they are spawned close enough that their screen footprint can cross the road deck
  - normal roadside-building rules are not ideal for port cranes
- Best future fix would be to treat West Seattle cranes as special port-background scenery:
  - push them farther from the road
  - reduce clustering/repeat density
  - cap their rendered size lower than normal skyline objects
  - cull or shift them if their inner edge overlaps the drivable road
  - keep road/bridge/railing occlusion consistent

### Change made and reverted
- I changed the West Seattle crane `renderDepth` in [src/road/RouteData.js](src/road/RouteData.js) from `2.0` to `-0.5` while trying to make the road/bridge draw over crane bases.
- I also added a related comment in [src/road/Road.js](src/road/Road.js).
- That was not what was wanted at that point, so it was reverted.

### Current state after revert
- West Seattle crane `renderDepth` is back to `2.0`.
- The Road.js comment about cranes rendering below the road was removed.
- No crane placement, sizing, artwork, or render-loop behavior was changed after the revert.

---

# DUI — Build Notes

## Session — 2026-05-12 (Phone-as-Menu + per-vehicle art + warps)

### Phone-as-menu (HTML overlay)
- **CSS-driven portrait overlay** ([index.html](index.html)) — `#phone-menu` shows in portrait via media query, hides in landscape. Phaser game pauses underneath.
- **Tap-to-unpause** after rotating back to landscape — first pointerdown anywhere resumes the run. Skipped when lock-pause is on.
- **Lock-pause chip** (🔓 / 🔒) — overlaid in the upper-right blank widget tile. Tap toggles `window.__phoneLock` which the orientation watcher checks before auto-resuming.
- **Trophy chip** (🏆) — upper-left blank widget tile. Click placeholder for future trophy page.
- **In-world phone clock** — overlaid on the Calendar widget's lower band, formats elapsed party-clock fraction over 2:00 PM → 8:00 PM (6-hour window). Updates every second.
- **Map modal** ([SVG vertical map of Seattle → Pullman](index.html)) — opens on Maps tap. Pulses red dot at player's live mileage, shows named rest-stop pins.
- **Garage modal** — opens on Garage tile tap. Lists every owned vehicle with thumbnail (loads from `/assets/cars/*.png`), label, stats line, and accessory badges (🛡 Bumper / ⚡ NOS L1-3 / ❄️ Traction) above the thumbnail. Tap row to switch vehicle (restarts scene).
- **Music app** — Spotify-style modal. Genre grid → song list. Shuffle All + Shuffle Genre. Tap song to play. AudioSystem got `getStations()`, `setStation()`, `playSpecificTrack()`, `shuffleAllTracks()` to support it.
- **Checkpoint button** — warps the run to `_lastCheckpoint` (mid-run) or `save.lastRestStop` (between runs); no-op flash if neither exists.
- **Steering selection stroke** — Tap / Tilt / L/R buttons get a 4-px inset black stroke when matching `steeringMode` registry value. Defensive sweep clears `.selected` from every hit zone before applying.

### Hit-zone auto-positioning (no more % retuning!)
- Hit zones declare `data-px="x y w h"` in **PNG pixel coordinates**.
- JS reads `bgImg.naturalWidth/Height`, applies `object-fit:cover` math, positions each zone in viewport-pixel coordinates. Zones auto-track on every device — no per-aspect calibration.
- **`?debug` URL param** flashes red dashed boxes with labels on every hit zone.
- **`?calibrate` URL param** — tap any spot, get a chip showing the PNG pixel coord. Walk the icons, send the numbers, paste into `data-px`.

### Per-vehicle art (no more procedural placeholder!)
- Six vehicle PNG pairs (front + back) wired:
  - `beater` → white (relabeled **"Used Sedan"**)
  - `suv4x4` → blue
  - `usedTruck` → truck blue
  - `evTruck` → orange
  - `bestlaRoadster` → green (relabeled **"Electric Roadster"**)
  - `playdoutS3X` → blue2 (relabeled **"Bestla Play'dOut"**, fuel `gas` → `electric`)
- Player sprite reads `_veh.spriteBack`. Falls back to procedural `car_player` + tint for vehicles without PNG.
- Aspect-preserving sizing: width fixed at 90 px, height = `90 * (sourceH / sourceW)` so each car keeps its true proportions.

### Title screen overhaul
- **Wheel flipped to RIGHT side**, START button on LEFT — then START removed entirely. Tap a difficulty panel = immediate launch.
- Uniform 2-px white stroke on all wheel panels (yellow active highlight + ▶ marker removed).
- Tap Custom → drug-slider modal, now also has **gameplay sub-difficulty picker** (Easy/Normal/Hard) — Custom inherits the chosen sub's damage / cops / traffic multipliers while keeping noScore + 40-min clock.

### Warp + gas mechanic
- **Forward warps drain gas** equal to the trip distance. `init({ warpForward: true })` flag + new logic in the `resumeFromStop` branch deducts `rs.mileage` from the tank. Map-modal Custom warp sets the flag when destination is ahead of current position.
- **Custom-mode warp** stays free of $ and trophies (sandbox).

### Per-difficulty respawn lane
- New `_postCrashLaneX()` helper. Picks recovery lane based on difficulty (Custom reads its sub):
  - Easy → **+0.75** (far-right, safest)
  - Normal → **+0.25** (your-direction inner)
  - Hard → **−0.25** (oncoming inner — into traffic)
- Wired into all four crash-reset paths: scenery, NPC head-on, cop head-on, checkpoint-warp-after-death.

### Damage tuning
- **Tunnel wall slams = 3 HP** (was 10) — `_triggerSceneryRespawn(proj, damage=10)` now takes a damage param.
- **Global 10-HP cap removed** — Hard mode scenery is back to 15 HP (10 × 1.5 damageMul).
- **Floating "-X" damage popup** — red 19-px text next to HP, shows for 1.5 s after each hit. Positions dynamically against the live HP text bounds.

### Camp-repair guard
- 65% repair item flagged `disabled: true` when current HP ≥ target. Shows **"N/A"** with friendly status message instead of taking $.

### Rest-stop UX
- BACK button moved to top-left corner so it stops covering SAVE CODE.
- Mileage rounded in signs — no more "Exit 9.5" / "Mile 9.5", now "EXIT 10" / "MILE 10".

### Sign placement
- Tunnel guard: signs landing inside tunnels now **walk BACKWARD** until they clear the mouth, so the player sees them on approach.
- Applied to mileage_signs, grade_signs, and the exit_sign_green findDrySeg helper.

### Party clock fixes
- **Reset on difficulty change** — tapping E/N/H/Custom re-seeds `_partyClockSec` from the new mode's `Difficulty.partyClockSec()` so the timer always matches the chosen run length.
- Stored `_partyClockSecMax` alongside `_partyClockSec` for the phone-menu clock UI.

### Rear-view mirror
- Draw distance extended **9k → 36k units** so cars shrink to the vanishing point before disappearing.
- Traffic-array despawn extended `-2000 → -35000` so cars don't get culled before the mirror sees them.

### HUD layout
- **Default handedness flipped to LEFT** — weapons / HP / gas / speed column on the left, drug bars on the right (most players are right-handed; right thumb on the wheel side of the phone).
- Shift+L toggles. Persisted in `settings.handedness`.
- HP / Mi text moved inboard to clear the weapon column. Gas icon moved to the CENTER side of the gas text (dynamic positioning per frame).
- Music genre font 17 → 22 px.
- Weapon icon cells +15% size, stack pushed down 10 px.
- Score + party clock follow drug bars in handedness flip (top-right in left-handed mode).

### Map-modal close bug
- Closing the title-screen map modal (or trophy / garage) was firing the scene-level "any tap" handler and starting a race. Fixed with `_*ModalJustClosed` flags + a 50ms grace window in the cursor-fire handler.

### Vehicle gameplay
- **Drug bar OD only triggers at > 100%** (strict greater-than, 100% is safe).
- **Damage event payload** flows through `_applyDamage` with a generous "no-double-pause" gate.

---

## What's new since you went to bed

### Phase 4 — Achievements (essentially complete)
- **AchievementSystem** module ([src/systems/AchievementSystem.js](src/systems/AchievementSystem.js)) — registry, persistent earned-set on SaveSystem, Bronze/Silver/Gold tiers (Easy/Normal/Hard).
- **In-game toast** is now compact — tier label + name only. The full description text lives on the Achievements page (per your direction).
- **Achievements page** — new 🏆 button top-right of the title screen opens a modal grid showing every achievement with its highest tier earned (greyed-out if locked) plus the description text.
- **10 per-drug "first-hit" achievements** with mechanic descriptions — fire on first pickup of each drug.
- **Run-state achievements live**:
  - Untouchable 1m / 2m / 3m / 5m (timer resets on damage)
  - 5★ Survivor (peak then escape to 0)
  - Permastoned (10-mile weed lock-in)
  - Full Tank (any drug bar ≥ 99% without OD)
  - Stone Cold Sober / Crystal Clean / Iron Bladder / Untouchable / Trifecta (all fire on Pullman finish)
  - Connoisseur (every named combo this run)
  - Snowblind (cleared mile 40-88 snow zone with **zero HP lost** — strict per your spec)
  - On Time (Pullman finish before clock runs out)

### Phase 7 — Story finale + party clock (complete)
- **Party clock HUD** — top-center under the radio name, format `⏱ MM:SS`. Starts at:
  - Easy: 50 min
  - Normal: 40 min
  - Hard: 30 min
  - Custom: 40 min (no bonus on time)
  - Color shifts: white > 10 min, yellow 5–10 min, red < 5 min, "TOO LATE" tag at 0
- **Pullman finish branches**:
  - **ON TIME** (clock > 0): cash bonus 2× Hard / 1.5× Normal / 1× Easy; "🎉 YOU MADE IT!" popup; On-Time achievement
  - **TOO LATE** (clock = 0, < 5★): no bonus; "😞 TOO LATE" popup; normal game-over
  - **TOO LATE + 5★** (technical loss): cash penalty + 50% of post-checkpoint score; opens the **drug-slider restart modal**
- **30 NPC vignettes** wired into [RestStopScene.js](src/scenes/RestStopScene.js). Three lines per stop, randomly picked when the player enters. Lines I wrote (placeholder voice — feel free to replace):
  - Bellevue, Issaquah, North Bend, Cle Elum, Ellensburg, Vantage, Royal City, Othello, Washtucna, La Crosse all have 3 lines each. Scan for `VIGNETTES = {` to edit.

### Custom Mode (new — replaces NG+ from the original plan)
- **All three difficulty buttons unlocked from the start** (was already true).
- **CUSTOM MODE button** — new chip just above the difficulty row on title.
- Tapping CUSTOM opens the **drug-slider modal**:
  - 10 horizontal sliders (one per drug), click+drag 0–100%
  - START launches the run with those starting bar levels
  - **No score awarded** for the entire custom run (Difficulty.noScore() flag flows through `_scoreMult()` returning 0)
  - All drugs auto-unlocked if you set them above 0 so the bars render
- **TOO LATE + 5★ technical-loss restart** uses the **same slider modal**, but in restart mode it adds a checkpoint-picker row (Seattle start / each rest stop). Pick checkpoint + drug levels → run restarts there.
- Slider UI is one reusable function `_buildDrugSliderModal({ mode, onConfirm })` — `mode: 'custom'` or `mode: 'restart'`.

### Visual / world fixes
- **LSD rainbow** moved from `overlayGfx` (top of stack) into `Road.js` immediately after the sky bands — sits **behind** road, scenery, NPCs, drug overlays. Per your request.
- **Achievement toast trimmed** — name + tier only, no description text. ~40% smaller chip.

### Difficulty system extensions
- New fields: `partyClockSec`, `onTimeBonusMul`, `noScore`. Custom mode shipped with `noScore: true` and `onTimeBonusMul: 1.0`.

---

## Code audit — safe fixes applied

Two parallel agents scanned the codebase. I applied these:

| File | Fix |
|---|---|
| [DrugSystem.js](src/systems/DrugSystem.js) | Removed dead fields `shrooomsMax` (typo'd 3 'o's), `heroinMax`, `lsdMax` — never read |
| [DrugSystem.js](src/systems/DrugSystem.js) | Initialized `_comboActivatedAt = {}` in constructor instead of lazy-init in `getActiveCombos()` |

Other audit "safe fixes" turned out to NOT be bugs after verification:
- `_f12Texts` IS used (lines 4440+) — agent missed it
- `_passedRestStops` lazy-init at line 1379 covers all use cases — no actual crash path

---

## RISKY ISSUES — review these in the morning

These are real but need your judgment before fixing.  **None of them are crashing the game right now**.

### 1. CopFleet.js:46 — Pit cooldown design choice
```js
entry.pitCooldown = Math.max(entry.pitCooldown, PIT_COOLDOWN);
```
While a cop is in 'recovering' state (1.5s), the pitCooldown is held at full `PIT_COOLDOWN` every frame, then ticks down only after recovery exits.

Audit suggested:
```js
if (entry.pitCooldown <= 0) entry.pitCooldown = PIT_COOLDOWN;
```

**Tradeoff:** Current = total cool-off ≈ PIT_COOLDOWN + recovery; suggested = total = PIT_COOLDOWN. The current behavior is likely intentional ("after a successful pit, full cooldown counts from the end of recovery"). Suggestion would shorten total cool-off by ~1.5s per pit. Tune-time decision.

### 2. GameScene.js:3984 — Title-letter tweens on `repeat: -1`
The D-U-I letter sway/bob/fade tweens run forever and aren't explicitly killed when the title overlay is destroyed (line 849 in `_updateIntro`). Phaser destroys the Graphics object but the tweens may still try to animate destroyed targets.

In practice, scene restarts have been stable, so this hasn't crashed. But it's a leak — every scene start adds 9 tweens (3 per letter) that never end.

**Fix would be:** add `tween.stop()` calls on the title letters when fading out. Need to track them in `_titleLetterTweens[]`.

### 3. GameScene.js:65 — `_f12Texts = null` reset is necessary
Despite the audit's claim, this IS used. The reset at scene-restart time is correct — Phaser reuses the scene instance, and the previous run's references would point to destroyed Text objects. **Leave alone.**

### 4. DrugSystem.js:81–88 — `hydrateProgress()` order dependency
`_methPhase1` is read at line 245 (`if (this._methPhase1)`), but only set if `hydrateProgress()` was called. If the method was never called (e.g. fresh save with no stored progress), `_methPhase1` stays undefined. `!!undefined = false`, so it works, but the code is fragile.

**Fix would be:** initialize `this._methPhase1 = false` in constructor. Cheap and safe — just need to verify it doesn't break the meth-unlock state machine.

### 5. RouteData.js:504–550 — Modulo loop bounds
```js
for (let i = tunnelStart; i !== tunnelEnd; i = (i + 1) % count) { ... }
```
If `tunnelStart === tunnelEnd` (data error / segment-boundary collision), the loop is infinite. Currently safe because real tunnels don't have zero-length, but if route data ever changes and produces matching start/end, the build hangs.

**Fix would be:** add `if (tunnelStart === tunnelEnd) continue;` guard. Cheap.

### 6. EffectsSystem.js — defensive optional-chaining
Pattern: `this.audio?.setPaused?.()`. The audio system is always set up (BootScene → registry), so these `?.` chains are unnecessary CPU. Fix is widespread (touches dozens of lines). Style/perf, not a bug.

### 7. Console.log statements
Two console.logs in [GameScene.js:111 and :114](src/scenes/GameScene.js) (init logs) and one in weapon-fire flow. Audit flagged these as production noise. Removing them is safe but they're useful for debugging — **let me know if you want them gone**.

### 8. GameScene.js:2152 — Slider `pointerup` listeners
The drug-slider modal attaches a `pointerup` listener per row. The cleanup at modal-close runs `this.input.off(...)` for each. **But** if the modal is open during a scene restart, the listeners leak. Edge case (you'd have to scene-restart with a modal open), but noted.

---

## Files changed this session

**New:**
- `src/systems/AchievementSystem.js`

**Modified:**
- [src/scenes/GameScene.js](src/scenes/GameScene.js) — bulk of additions: party clock, achievement system wiring, custom mode + slider modal, achievements page modal, technical-loss restart flow, Snowblind tracker
- [src/scenes/RestStopScene.js](src/scenes/RestStopScene.js) — 30 NPC vignettes
- [src/systems/Difficulty.js](src/systems/Difficulty.js) — partyClockSec, onTimeBonusMul, noScore, custom mode descriptor
- [src/systems/DrugSystem.js](src/systems/DrugSystem.js) — dead-field cleanup + combo-tracker init
- [src/systems/EffectsSystem.js](src/systems/EffectsSystem.js) — rainbow removed (moved to Road)
- [src/road/Road.js](src/road/Road.js) — rainbow draws after sky / before road

---

## What's NOT done

- **Phase 5 — DJ chatter (skipped per your direction)** — no MP3s yet, no point shipping the wiring
- **Phase 6 — Daily challenges + leaderboard (deferred)** — could ship local-only versions next session
- **Phase 6 — Ghost replay** — needs the position-recording infra; deferred
- **Mission system (Phase 2)** — never picked up; "Job Done" achievement is wired but won't fire until missions ship
- **Connoisseur achievement** — fires once you trigger every named combo. With 14 combos, this is brutal. Probably needs balancing.
- **No-score-in-custom edge cases** — `_scoreMult()` returns 0 in custom, but a couple of additive sites bypass `_scoreMult` (line 1327 Pullman bonus, line 2732 hitchhiker tip). With score = 0 they round to 0 anyway, but worth a sweep next session.

---

## Suggested next-session priority (ranked)

### Tier 1 — high impact, low risk (30 min each)
1. **Sweep custom-mode score leaks** — wrap the two non-multiplied add sites in a `Difficulty.noScore()` guard.
2. **Fix `_methPhase1` init** — one-line constructor add. Eliminates a hydration fragility.
3. **Add tunnelStart===tunnelEnd guard** in RouteData.
4. **Stop title-letter tweens** on intro skip.

### Tier 2 — gameplay polish
5. **Daily challenge system (local-only)** — ship the `ChallengeSystem.js` + UTC-day-rolled constraint + a tile on title screen. Finish-line checks the constraint and awards a bonus. Half-day's work.
6. **Local leaderboard** — top-10 per mode, saved to localStorage. Two hours of work, easy parallel to challenges.
7. **Connoisseur balance** — current spec needs every named combo. Maybe split into "Connoisseur" (5 combos) and "Mixologist" (every combo).

### Tier 3 — bigger features (multi-session)
8. **Mission system (Phase 2 of original plan)** — drug-delivery / hitchhiker / cop-evasion / combo-race / run-cars-off-road missions. Lots of UI + NPC behavior work.
9. **Ghost replay** — record best run's positions, replay translucent ghost car alongside.
10. **DJ chatter pipeline** — once you record voice clips, the trigger wiring is straightforward (~1 hour).

### Tier 4 — out of scope (still)
- Photo mode, in-game settings menu beyond pause, accessibility toggles, online leaderboard.

---

## Quick test plan for the morning

1. **Reload page** → title shows D U I + plot blurb + 4-button row + 🏆 + CUSTOM MODE chip
2. **Tap 🏆** → see achievements grid with greyed-out entries
3. **Tap CUSTOM MODE** → drag some sliders → START → check the bars come up filled
4. **Tap CUSTOM MODE → set heroin to 50% → START** → verify no score accumulates over miles
5. **Pick Hard, drive carefully** → drive ~30 min real-time → reach Pullman before clock → verify 2× cash bonus + "YOU MADE IT" popup + On Time achievement
6. **Pick Normal → drive recklessly → hit 5★ → run out of clock → arrive Pullman with 5★** → technical-loss popup → cash penalty → slider modal opens with checkpoint picker
7. **Drug-tour run** — pick up beer, weed, coke in sequence → see three first-hit achievement toasts (one per drug, with description in the page later)
8. **Hold weed at 100% for 10 mi** → Permastoned popup + achievement toast
9. **Cross mile 38–88 in Normal** without taking damage → Snowblind achievement at exit
10. **Code resume**: enter a code like `EN000` (Ellensburg, Normal) → resume clock starts at 40 min still

---

Have a good night. If anything blew up, open dev console, paste the error here in the morning, and I'll triage first thing.
