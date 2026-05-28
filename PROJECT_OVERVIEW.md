# DUI — Project Overview

A single-doc orientation for anyone (human or AI) joining the project mid-flight. Combines the long-running memory notes, the active overhaul plan, and the most recent build sessions.

---

## 1. What is DUI?

**DUI** is a Phaser-3 pseudo-3D arcade racing game in the spirit of Outrun / Rad Racer. The player drives Seattle → Pullman (~293 mi, I-90 → WA-26 → US-195 → WA-270) collecting drugs, picking up weapons, evading cops, and managing damage on a real-route topology with named exits, rest stops, and weather zones. Tone is mature dark-comedy ("like GTA 1 was shocking").

**Goal:** ship a paid arcade game on iOS (Capacitor wrap, TestFlight). Revenue funds a v2 with hired art/dev.

---

## 2. Tech stack & how to run

- **Phaser 3.60** (pseudo-3D rendered via Graphics.fillPoints trapezoids, far→near per frame)
- **Vite 5** dev server (port 3000)
- **Capacitor 5** for iOS shipping (`npm run cap:sync && npm run cap:open`)
- Assets in `public/assets/` (cars, drugs, weapons, buildings, trees, music MP3s, UI PNGs)
- Procedural music — 10-station radio via Web Audio API + real-track MP3s in `public/assets/music/`

**Run:**
```
cd DUI/
npm install
npm run dev        # http://localhost:3000  + LAN IP for iPhone testing
npm run build      # → dist/ for deploys
```

**Recurring trap:** Vite HMR sometimes serves stale module exports after edits. Fix: `pkill -9 -f "node.*vite" && rm -rf node_modules/.vite && npm run dev`.

---

## 3. Game mechanics — at a glance

### Route
- **`TOTAL_ROUTE_MILES = 293`**, `ROUTE_SEGS = 470000` (≈ 1604 segs/mile)
- 17 named rest stops from Seattle (mile 5) to Pullman (mile 289) — see `_REST_STOP_DEF` in [src/constants.js](src/constants.js)
- Real-world I-90 corridor: Mt Baker Tunnel (mi 6–7) + Mercer Island Lid Tunnel (mi 8.5–9) + Lake Washington floating bridges + Snoqualmie Pass + Cascades + Palouse
- Weather zones: rain mi 30–40, snow past mi 40 (Normal+ only)

### Driving
- **Cruise:** auto-accel at 120 mph; UP boost to 140; DOWN brake to 60.
- **Phone controls:** click-toggle ACCEL/BRAKE pedals (not press-and-hold). Steering via Tap (Flappy-style, default), L/R buttons, or Tilt (Capacitor accelerometer).
- **Bounce/crash on collision** — both player and NPC/cop can wreck each other.
- **HP system:** 100-max DamageModel. Damage values per source:
  - Tunnel wall slam: **3 HP**
  - Tree / building / parked car: **10 HP** (× difficulty mult — Hard = 15)
  - Head-on NPC: 3–7.65 HP (impact-severity scaled)
  - Side-swipe / corner clip: 1–2 HP
  - Cop head-on / PIT / ram: similar scale, × damageMul
  - Off-road bleed: 0.5 HP/sec
- **Crash recovery lane** depends on difficulty (Custom inherits sub-difficulty):
  - Easy → far-right (+0.75)
  - Normal → your-direction inner lane (+0.25)
  - Hard → oncoming inner lane (−0.25)

### Drugs (10)
Alcohol, Weed, Cocaine, Shrooms, LSD, Heroin, Rx, Fentanyl, Ketamine, Meth.

**Unlock chain** (persists across arrest/death via `drugUnlocks` registry):
- Alcohol + Weed: start unlocked
- Cocaine: 30s drunk
- Shrooms: both alcohol + weed ever ingested
- LSD: shrooms ever ≥ 0.50
- Heroin: 20% route progress
- Rx: 50 NPC car crashes (lifetime)
- Fentanyl: heroin ever ≥ 0.50
- Ketamine: LSD ever ≥ 0.40
- Meth: cocaine peaked ≥ 0.40 then dropped to 0 for 30s

**OD:** triggers strictly above 100% (100% itself is safe).

**Combos (Snow-Cone, A-Bomb, Cross-Faded, …):** purely cosmetic labels, no multiplier bonus.

**Score multiplier:** purely additive. Base 1.0 + 0.5 per drug ≥5% / ≤50% + 1.0 per drug >50% + 1.0 per cop star. Snapped to 0.5.

### Cops (CopSystem)
- Kinds: rear pursuit, oncoming, parked roadside, barricade, helicopter (5★), SWAT van (4★+, 2× damage)
- **No per-second heat trickle** — star changes are all static event additions:
  - 1st star = (alcohol ≥ ⅓ OR weed ≥ ½) AND ≥3 NPC crashes since first drink, OR 20 NPC bumps with any drug ≥30%
  - Rear-end cop: +0.2 · Head-on: +0.5 · Sideswipe oncoming: +0.2 · Roadblock: +0.33 · Drug pickup during probation: +1.0
- BUSTED: 1 PIT · 5 rear bumps · 3 head-ons
- Town crossings reduce stars graduated (5★→0, 4★→1, others →2), filter SWAT only when stars drop below 3.5
- Any reset of the game clears stars to 0
- OD warps to last checkpoint with 0 stars + drug bars 0 (no game over)

### Difficulty (single source of truth: [src/systems/Difficulty.js](src/systems/Difficulty.js))
| Mode | damageMul | copMul | trafficMul | partyClock | dayNight | weather | onTimeBonus | noScore |
|---|---|---|---|---|---|---|---|---|
| Easy | 0.7 | 0.7 | 1.0 | 50 min | ✓ | — | 1.0 | — |
| Normal | 1.0 | 1.0 | 1.0 | 40 min | ✓ | ✓ | 1.5 | — |
| Hard | 1.5 | 1.5 | 1.10 | 30 min | ✓ | ✓ | 2.0 | — |
| Custom | inherits sub | inherits sub | inherits sub | 40 min | ✓ | ✓ | 1.0 | ✓ |

Custom mode inherits gameplay multipliers from a chosen sub-difficulty (Easy/Normal/Hard) but stays no-score and at 40-min clock.

### Vehicles
8 player-buyable cars with PNG art + per-vehicle stats:
| ID | Label | HP | Range | Top mph | Fuel | Sprite |
|---|---|---|---|---|---|---|
| beater | Used Sedan | 50 | 150 mi | 110 | gas | car_back_white |
| suv4x4 | Used 4x4 SUV | 70 | 300 | 115 | gas | car_back_blue |
| usedTruck | Used Truck | 90 | 350 | 117 | gas | car_back_truck_blue |
| newTruck | New Truck | 100 | 100 | 120 | gas | (tint only) |
| evTruck | Electric Truck | 85 | 120 | 118 | electric | car_back_orange |
| sportsCar | Sports Car | 75 | 500 | 165 | gas | (tint only) |
| bestlaRoadster | Electric Roadster | 85 | 250 | 200 | electric | car_back_green |
| playdoutS3X | Bestla Play'dOut | 125 | 250 | 190 | electric | car_back_blue2 |

Per-vehicle accessories (bumper / NOS L1-3 / traction) persist per (steering, difficulty, vehicle) slot.

### Save architecture
Per-mode save profiles: 3 steering modes × 4 difficulties = 12 wallets. Each wallet contains 8 vehicle states (HP, accessories, weapons, checkpoint tiers earned). Achievements + settings + checkpoint tiers are **global** (cross-mode).

### Weapons (F12 items)
Gun · Spike strip · Paint bomb · Rocket (fwd/rear) · Grenade · Disguise. Road collectibles + rest-stop purchases. Tap-to-fire per icon, Q cycles, count badge per cell. Spawned mid-route at 4★+.

---

## 4. The phone-as-menu (portrait UX)

Rotating the iPhone to portrait pauses the game and reveals an iOS-mockup home screen (HTML/CSS overlay over the Phaser canvas).

### Layout
- **Weather widget** (North Bend, decorative)
- **2×2 of empty white tiles** with overlays:
  - Trophy 🏆 (upper-left — opens trophy page, placeholder)
  - Lock-pause 🔓 ↔ 🔒 (upper-right — locks rotation-resume)
  - Other two: open for future apps
- **Calendar widget** with in-world clock overlay (2 PM → 8 PM, driven by `_partyClockSec`)
- **Garage tile** (large, opens vehicle picker w/ accessories badges)
- **2×2 of app icons:** Maps · Tilt Steer · L/R Steer · Tap Steer
- **Dock:** Music · Start Over · Checkpoint · Menu

### Behaviors
- Rotate to portrait: **pauses** game.
- Rotate back to landscape: game **stays paused, waits for first tap anywhere** to resume (unless locked).
- Lock 🔒: blocks auto-resume on rotation; player must unlock + rotate or tap in-game pause button.
- Black stroke wraps the **selected** steering app (Tap/Tilt/L/R) so player sees which scheme is active.
- Tap a steering app → switches mode + restarts scene with the new save profile.
- Maps app → vertical SVG route map with live player-position dot.
- Garage tile → modal w/ owned vehicles + thumbnails + accessory badges (🛡 / ⚡ NOS Lx / ❄️).
- Music app → Spotify-style genre grid → song list. Shuffle all / shuffle genre.
- Checkpoint dock → warps to `_lastCheckpoint` (mid-run) or `save.lastRestStop` (between runs).

### Hit-zone auto-positioning
- Hit zones use `data-px="x y w h"` in **PNG-pixel coordinates** (not viewport %)
- JS reads `bgImg.naturalWidth/Height`, applies `object-fit:cover` math, positions each zone in viewport-pixel coords. Auto-tracks on every device.
- `?debug` URL param: red dashed boxes + labels on every hit zone.
- `?calibrate` URL param: tap an icon, chip shows that point's PNG-pixel coord. Use to find exact icon positions.

---

## 5. File map

### Core scenes
- [src/scenes/BootScene.js](src/scenes/BootScene.js) — preload + procedural-texture fallbacks + scene routing
- [src/scenes/GameScene.js](src/scenes/GameScene.js) — main loop, collisions, HUD, title overlay, pause menu (~7,500 lines, the monolith)
- [src/scenes/RestStopScene.js](src/scenes/RestStopScene.js) — 4-tab shop (Drugs / Garage / Company / Road), 4-digit save codes, vehicle dealership, accessory shop
- [src/scenes/GameOverScene.js](src/scenes/GameOverScene.js) — crash / OD / TOO LATE end-states

### Road & route
- [src/road/Road.js](src/road/Road.js) — pseudo-3D renderer + ramp painting + bridge guardrails + tunnel cover + weather particles + LSD rainbow layer
- [src/road/RouteData.js](src/road/RouteData.js) — segment generation, elevation, sign placement, random cop placements
- `src/road/routeGeo.json` — real lat/lon waypoints

### Systems
- [src/systems/DrugSystem.js](src/systems/DrugSystem.js) — 10 drugs + unlock chain + combos
- [src/systems/EffectsSystem.js](src/systems/EffectsSystem.js) — per-drug visual/physics effects
- [src/systems/CopSystem.js](src/systems/CopSystem.js) — rear/oncoming/parked/barricade/heli/SWAT cops, star economy
- [src/systems/AudioSystem.js](src/systems/AudioSystem.js) — 10-station radio (procedural + MP3)
- [src/systems/HapticSystem.js](src/systems/HapticSystem.js) — iOS haptics wrapper
- [src/systems/Difficulty.js](src/systems/Difficulty.js) — E/N/H/Custom multipliers + Custom sub-difficulty
- [src/systems/AchievementSystem.js](src/systems/AchievementSystem.js) — registry + Bronze/Silver/Gold tiers
- [src/systems/SaveSystem.js](src/systems/SaveSystem.js) — per-mode profiles + global achievements/settings
- [src/world/TimeOfDay.js](src/world/TimeOfDay.js) — mileage-based day/night cycle
- [src/world/Weather.js](src/world/Weather.js) — region-based rain/snow

### Constants & data
- [src/constants.js](src/constants.js) — `DRUG_CONFIG`, `DRUG_COMBOS`, `REST_STOPS`, `CHECKPOINTS`, `VEHICLES`, all magic numbers
- [src/car/DamageModel.js](src/car/DamageModel.js) — HP cap + damage events
- [src/economy/Wallet.js](src/economy/Wallet.js) — $ source of truth (integer-cent precision)

### UI / phone-menu
- [index.html](index.html) — phone-as-menu HTML/CSS overlay + modals (Maps / Garage / Music)
- [src/main.js](src/main.js) — Phaser game bootstrap + orientation watcher + window globals for phone-menu (`__phoneLock`, `__steeringMode`, `__garage`, `__music`, `__checkpoint`)

### Dead / vestigial (kept for reference, NOT live):
- `src/scenes/MenuScene.js` — BootScene starts 'Game' directly now
- `src/scenes/HubScene.js`, `src/missions/MissionManager.js`, `src/world/District.js`, `src/world/RoadGraph.js` — hub-mode infra never reached
- `src/economy/Garage.js`, `BodyShop.js`, `UpgradeShop.js`, `Dealer.js` — hub-mode shops (Wallet IS used)
- `this.hookers` (HookerSystem) — instantiated but never updated/rendered

---

## 6. Active overhaul plan (locked design decisions)

Plan file: `/Users/brendanbaughn/.claude/plans/lets-do-a-major-parallel-widget.md`. Phases 0-7. Summary:

### Phase 0 — Score → Cash (DONE)
Replace `PTS_*` abstract points with `$` dollars. HUD reads `$X,XXX`.

### Phase 1 — Story framing + Difficulty (DONE)
- Plot blurb on title: *"You drove to Seattle to score for a party in Pullman. The party starts soon. Don't get arrested. Don't OD. Don't be late."*
- Difficulty: Easy / Normal / Hard / Custom (tap-to-launch on title)

### Phase 2 — Missions (NOT STARTED)
Drug-delivery / hitchhiker / cop-evasion / combo-race / run-cars-off-road markers. Auto-accept on pickup, HUD chip tracks progress.

### Phase 3 — Day/night + weather (PARTIAL)
- Day/night cycle by mileage (mile 0 morning → mile 180 night)
- Rain mile 30–40, snow past 40 (Normal+)
- "CHAINS REQUIRED" warning signs (DONE)

### Phase 4 — Achievements (DONE)
- AchievementSystem with Bronze/Silver/Gold tiers based on difficulty earned
- 10 per-drug first-hit achievements
- Run-state: Stone Cold Sober, Crystal Clean, Iron Bladder, Untouchable (1m/2m/3m/5m), 5★ Survivor, Permastoned, Snowblind, Connoisseur, Trifecta, On Time, Full Tank, Job Done

### Phase 5 — DJ chatter (DEFERRED — no MP3s yet)
Pre-rendered per-station persona clips on song-end events.

### Phase 6 — Replayability meta-layer (DEFERRED)
Daily challenges (UTC-rolled), local leaderboard, ghost replay, NG+.

### Phase 7 — Story finale + party clock (DONE)
- Party clock 50/40/30 min by difficulty
- Pullman finish: ON TIME (cash bonus 1×/1.5×/2×) / TOO LATE (no bonus) / TOO LATE+5★ (cinematic arrest + drug-slider restart modal)
- 30 NPC vignettes wired into rest stops (3 per stop)

### Warp system (DONE — per design discussion)
| Action | Timer | $ Cost | Trophies |
|---|---|---|---|
| Start Over (Mile 0) | Resets to 0:00 | Free | All normal trophies |
| Backward Warp | Continues ticking | ½ $ | All normal trophies |
| Forward Warp | Jumps to `(mile/293) × 40min` | Free | **Cheater Complete only** 🕶️ |
| Custom mode | No clock | Free, $100k starter | None possible |

Forward warps **drain gas** equal to trip distance. Hard mode disallows warping entirely.

---

## 7. Pending build-outs (in priority-ish order)

### Tier 0 — Pre-ship blockers
- **DELETE THE DEV WARP** — digit-keys 1-9 mile-warp cheat in [src/scenes/GameScene.js](src/scenes/GameScene.js), bracketed by `// ── DEV WARP — REMOVE BEFORE RELEASE ──`. **Must be deleted before shipping.**

### Tier 1 — Active features the user has flagged
- **Title-screen stoplight redesign (SPECCED, NOT BUILT)** — replace Easy/Normal/Hard buttons with 3 stacked stoplight buttons (same size as current difficulty buttons):
  - **Red — Thumbs: 2/1/0** (cycles, wraps). Subtitles: "Left and Right Thumb, basic" / "Just one thumb, like Flippy Burd" / "Look, Ma! No thumbs! (Tilt steering)". Maps to existing steering modes (classic L/R, flappy-tap, tilt).
  - **Yellow — Difficulty: Easy/Normal/Hard/Custom** (cycles, wraps). Reuse existing short-sentence blurbs inline.
  - **Green — Start.** Custom + Start opens existing custom-slider modal. FF button on title should also start the game.
  - Persist selections between sessions via registry.
- **Sex Worker / prostitute interaction expansion** — currently a 1-in-10 "dirt on a politician" buff. Add more outcomes, recurring NPCs, and quest hooks; investigate spawning visible sidewalk NPCs near towns/rest stops so the mechanic exists in the driving world rather than only in menus.
- **Hitchhiker expansion** — basic random good/bad outcome works (70/30 split, drug-bar-to-90% added). Add more variety and story hooks; investigate roadside/sidewalk hitchhiker sprites the player can see and choose to approach or pick up.
- **Police 2.0 / five-star behavior correction** — police that pass the player should actively turn into pursuit/ram behavior instead of simply continuing away. Current code also allows wanted stars to decay over time and town crossings to reduce `5★ -> 0`, which does not match desired behavior. At five stars, heat should remain until an explicit escape action such as a disguise, special sex-worker outcome, or paint job removes it. Consider coordinated rams, roadblocks, helicopter spotlight at night, and escalating chase music after the core behavior is fixed.

### Tier 2 — Plan phases not yet done
- **Phase 2 — Mission system** (Job Done achievement is wired but waiting on missions).
- **Phase 5 — DJ chatter** (record MP3s; wiring is straightforward).
- **Phase 6 — Daily challenge + local leaderboard** (half-day's work each).

### Tier 3 — Bigger features
- Mission system full build-out
- Ghost replay (record best run positions, play translucent ghost)
- Online leaderboard (data shape supports it; ship local first)
- **Smashable roadside objects** — lightweight collidable cones, cardboard boxes, trash cans, and construction barrels that swap to a broken/knocked-over sprite plus impact sound when struck. Reuse the existing scenery collision and sprite pools rather than adding physics/debris simulation. Consider pedestrians only as a separately designed, non-graphic consequence mechanic if it fits the game's tone.

### Tier 4 — Out of scope (still)
Photo mode, in-game settings menu, accessibility toggles.

---

## 8. Major build-history (newest first)

### 2026-05-27 (latest) — HUD restructure, crash-recovery rolling start, iOS tilt permission fix, asset cleanup, building auto-flip

**HUD layout overhaul** ([GameScene.js](src/scenes/GameScene.js))
- Restructured the top-of-screen readouts into two mirror-adjacent clusters instead of edge-anchored singletons:
  - **Left cluster** (right-of-mirror in default LH mode): Time + Multiplier (top row, multiplier sits to the right of the clock), Cash, HP.
  - **Right cluster** (left-of-mirror in default LH mode): Speed, MPH, Gas-miles.
- Top-row buttons (Pause / FF / Genre / Mute / Map / Garage) pushed outward by `READOUT_W=95` so the new clusters fit beside the mirror.
- Per-frame handedness mirror handler at `_doCreate()` rebuilt to mirror the *new* cluster layout (previously snapped HP / Gas back to the old weapon-column position on scene start — the cause of repeated "HP/Gas not below Cash/MPH" reports).
- HP color now always pink `#FF39AF` (the "-X" damage popup still does the took-damage feedback).
- Gas color: blue `#39A8FF` (full) → amber → red blink (nearly empty). Dropped the orange-on-near-exit strobe that was reading as flicker.
- Cash color: neon green `#39FF8A` (was yellow).
- Multiplier moved next to the timer, font 11→16 px (~45% bigger).
- Speed + MPH + the title-screen "DIFFICULTY" label now share a per-difficulty palette: **Easy pink / Normal blue / Hard red / Custom purple** (matches the title-screen "DRIVE" + "IMPROVISE" chrome).
- Gas pump PNG (24×24, swaps `ui_gas_full` ↔ `ui_gas_empty` below 30 mi) repositioned to sit OUTWARD of the Speed number (away from the mirror), vertically centered on Speed.
- ACCEL pedal recolored neon blue (`0x39A8FF` stroke / `0x0F2A4A` active fill); label flipped to `▲\nACCEL` so the arrow sits above the word and mirrors BRAKE's `BRAKE\n▼`. Both pedal labels bumped to 16 / 17 px.
- Accel charge bar's "full" color flipped from green → neon blue to match the pedal.
- FPS / SPR diagnostic readout removed.
- FF button no longer starts the run when tapped on the title (was the secondary unintended launch path).

**Crash recovery — "rolling start" auto-pilot** ([GameScene.js](src/scenes/GameScene.js))
- Added `_crashRecoveryUntil` field separate from `_invincibleUntil`. Set by NPC head-on / cop head-on / scenery-crash recoveries (not the 200 ms bush nudge).
- Each major crash now resets the player to `MAX_SPEED * 0.18` (≈22 mph) at the difficulty's recovery lane.
- During the i-frame blink, the speed update forces `targetSpeed = 60 mph` regardless of input. The existing ACCEL ramp brings the car up to 60 over ~0.7 s and holds, so the blink ends with a controlled rolling re-entry instead of a near-stop.

**Drug HUD bars — drag UX** ([GameScene.js](src/scenes/GameScene.js))
- The cell fills vertically (bottom = empty, top = full); drag was previously reading horizontal pointer X. Swapped to VERTICAL drag with `frac = 1 - (py - hit.y) / hit.h`.
- Added 12 px touch padding around each cell so an off-by-a-bit tap still grabs it. Once grabbed, the finger can leave the cell and the level still tracks (clamped 0..1).

**Custom mode modal — vehicle + accessories + spacing** ([GameScene.js](src/scenes/GameScene.js))
- Added a VEHICLE picker (single wide button cycling all 8 entries in `VEHICLES`) and an ACCESSORIES row with Bumper / Traction / NOS (0–3) toggles. Custom is treated as a sandbox — every vehicle and every accessory is selectable regardless of ownership / install state.
- New `_applyVehicleSwap(vid)` helper mirrors the Garage modal's live-swap pattern. Accessory choice rides on `this._customStartAccessories`; `_vehicleAccessories()` returns the override when present so persisted save state is untouched.
- Layout: Vehicle row y=222 (gap 11 px below Drive Type), Accessories row y=262 (gap 12 px below Vehicle), location bar lowered to mapY=357, "CUSTOM RUNS DO NOT SCORE" font 16→14 px so it clears the lowered map.

**Game Over → RETRY = same-settings skip-title** ([GameOverScene.js](src/scenes/GameOverScene.js), [GameScene.js](src/scenes/GameScene.js))
- New `_retrySameSettings()` method calls `scene.start('Game', { skipTitle: true })`.
- `GameScene.init()` accepts `data.skipTitle`; `_awaitingStart` short-circuits to false when set. Persisted difficulty / steering / drug unlocks carry through; only START OVER wipes them.
- Wired into the baked Crashed/Busted plate button, the standalone RETRY button, and the SPACE keyboard shortcut.

**iOS tilt permission — first-tap acceptance** ([GameScene.js](src/scenes/GameScene.js))
- Root cause: Phaser's queued pointer dispatch was dropping the iOS user-gesture context before `DeviceOrientationEvent.requestPermission()` ran, so the request rejected and the old fallback popup ("TAP ANYWHERE TO ENABLE TILT") forced a second tap.
- Fix: new `_armTiltPrefetch()` installs a `capture: true` native DOM listener (`touchstart` / `mousedown`) on the canvas that calls `requestPermission()` synchronously inside the gesture frame. Self-cleans once permission is granted. No-op on Android / desktop where `requestPermission` doesn't exist.
- `_enableTiltSteer()` rewritten to queue the caller's callback for the prefetch to flush instead of trying to call `requestPermission` itself.
- Title-screen carousel and custom-modal Drive Type buttons now persist `titleThumbsPick` to the registry **immediately on tap** so the prefetch listener on the next tap (e.g. START) sees the chosen mode.

**Asset cleanup pass** ([AssetManifest.js](src/systems/AssetManifest.js), `public/assets/`, `Images/`)
- Audited `public/assets/` against `AssetManifest.js` — 0 broken refs, ~35 orphan files.
- Moved orphans to `Images/` (flat) and `Images/_badge_source_originals/` (drug pre-zoom source PNGs, collision-avoidance):
  - 9 from `buildings/codex/` (old crane variants, PSD source files, files with literal spaces in name)
  - 7 from `buildings/` (duplicate space_needle.png + west_seattle_1.png–6.png — the codex/ versions are the live ones)
  - 10 drug source originals
  - 2 hookers/ sprites (HookerSystem was already deleted)
  - 3 props/ (hitchhiker PNGs + overhead_powerlines_long.png, all unloaded)
  - 7 ui/ SVG button sources
  - The runtime copies of `ui/crash_collision.png` + `ui/crash_overdose.png` (user had already moved them to Images/)
- Removed two dead manifest entries (`ui_crash_collision`, `ui_crash_overdose`).
- Deleted 27 empty folders — `public/assets/cars/codex/cockpit/source` plus the macOS Finder dup folders (`cops 2`, `props 3`, `ui 3`, `buildings 2`, `music 2`, `assets 2`, etc.) in `dist/` and `ios/App/App/public/`. Intentionally left the three Xcode-managed empty folders alone (`Pods/Headers`, two `xcshareddata/swiftpm/configuration`).
- Memory note saved at `project_dui_asset_workflow.md` documenting source-of-truth (`public/assets/`), derived folders, the music-loaded-dynamically exception, and the sanity-check `comm -23` / `comm -13` commands.

**Building auto-flip rule** ([GameScene.js](src/scenes/GameScene.js))
- Convention: every building/house PNG in `public/assets/buildings/codex/` (and the top-level `buildings/`) is authored as **right-side-of-road** appearance.
- Both render passes (forward scene sprites + rear-view mirror building pool) compute `autoFlipLeft = (sp.type === 'building' || sp.type === 'house') && sp.offset < 0 && !/_left|_right/.test(useTexKey)` and pass it through `setFlipX(!!sp.flipX || autoFlipLeft)`.
- Texture names ending in `_left` / `_right` (PSE office pair, ws crane pairs, west_seattle_horizon pair) are skipped — the spawn code already picks the directional variant per side and a second flip would double-mirror them.
- Result: a single right-side authored PNG covers both shoulders; if a building looks mirrored on the right, the source PNG itself is authored wrong (NOT a code bug) — fix the file.

---

### 2026-05-27 (earlier) — Neon UI art pass, Custom menu overhaul, eastern WA business scenery

**Main menu / loading / Custom menu theme pass** ([GameScene.js](src/scenes/GameScene.js), [BootScene.js](src/scenes/BootScene.js), [AssetManifest.js](src/systems/AssetManifest.js))
- Start-screen button hover/tap highlights were reworked to follow the slanted/parallelogram button shapes instead of rectangular outlines. `LOAD SAVE` was brought closer to Start-button height and its small subtext was removed per art direction.
- Boot/loading screen now uses the neon rainy DUI theme (`ui_loading_screen`) with a gradient-style progress bar.
- Custom mode screen was rebuilt around the neon loading-screen background, a semi-transparent options panel, larger fonts, city-selection emphasis, and button-style toggles instead of checkboxes.
- Custom menu behavior now includes: city start selection, Drive Type selection, Police on/off, Damage on/off, star-outline selector, and a clearer warning that Custom runs do not score.
- Custom start-city selection is applied when gameplay starts; custom no-damage now covers player damage generally, not just NPC damage.

**Top-row HUD button art** ([GameScene.js](src/scenes/GameScene.js), [AssetManifest.js](src/systems/AssetManifest.js), `public/assets/ui/`)
- Replaced generated/vector approximations with the user's actual button PNGs from `Images/`:
  - `button - genre.png`
  - `button - Vol Mute.png`
  - `button - Vol UnMute.png`
  - `button - Map.png`
  - `button - Garage.png`
  - `button - FF.png`
  - `button - FFtap.png`
  - `button - Unpause.png`
  - `button - Pause.png`
- Runtime copies live under `public/assets/ui/top_btn_*.png` and are loaded via `AssetManifest`.
- FF is momentary: outline image normally, solid/tapped image while pressed, resets on `pointerup`, `pointerupoutside`, or `pointerout`.
- Pause is latched: normal/unpaused image until paused, then solid Pause image until unpaused.
- Mute swaps between the user's mute/unmute images based on `audio.muted`; handedness redraw preserves the correct mute state.
- Important gotcha from this pass: Phaser `load.image` showed SVG button attempts as black/blank textures in-game, so these HUD buttons should stay as PNG runtime assets unless the loader path is changed deliberately.
- Genre source art is `150×130`; the runtime copy was padded to `150×150` with transparent space so `setDisplaySize(56, 56)` does not stretch it vertically.

**Eastern Washington scenery expansion** ([RouteData.js](src/road/RouteData.js), [GameScene.js](src/scenes/GameScene.js), [AssetManifest.js](src/systems/AssetManifest.js))
- Added repeatable Cle Elum / Ellensburg style business fronts generated as real raster assets, not temporary vector placeholders:
  - `east_wa_main_street_storefront.webp` — hardware/feed style storefront
  - `east_wa_cafe_storefront.webp` — cafe/diner storefront
  - `east_wa_auto_parts_store.webp` — auto parts/repair storefront
  - `east_wa_market_storefront.webp` — market/general store
- Source sheet archived at `Images/Codex_Concepts/Eastern_WA_Businesses_v1/east_wa_business_sheet.png`.
- Added two simple double-wide/mobile-home style assets:
  - `east_wa_doublewide_tan.webp`
  - `east_wa_doublewide_white.webp`
- Added limited-use landmark / accent assets from existing concepts:
  - `east_wa_vantage_truck_stop.webp`
  - `east_wa_ritzville_diner_motel.webp`
  - `east_wa_palouse_farm_store.webp`
  - `east_wa_pullman_party_house.webp`
- Route logic now separates repeatable business fronts from landmark-style buildings:
  - `EASTERN_BUSINESS_TEXTURES` contains plainer storefronts appropriate for repeated Cle Elum/Ellensburg frontage.
  - Ritzville / Palouse / Pullman showpiece assets are explicit landmark entries in later route windows so they do not repeat as generic filler.
  - `EASTERN_HOME_TEXTURES` rotates weathered houses, abandoned bungalows, and double-wides for dry-side town homes.

**Verification**
- `npm run build` passed after the UI asset wiring and after the eastern WA scenery additions. Vite still reports the existing large-chunk warning.

### 2026-05-27 (late) — Drug HUD grid, pedal repositioning, macOS audio gitignore fix

**Drug HUD — weapon-style icon stack with progress fill** ([GameScene.js](src/scenes/GameScene.js))
- Replaced the legacy text-labeled drug bars with a weapon-style icon stack on the side opposite the weapons (mirrors with handedness). Each cell renders the drug pickup sprite scaled into a `46×42` rectangle with a colored bottom-up fill rising as the bar fills, `alpha = bar level`, and no text label.
- After the first 5-stack overflowed the screen, the layout was promoted to a **2-column grid** so all 10 drugs fit: `5 rows × 2 cols`, outer column populated first (`slotIdx % 2 === 0`), inner column second. Cells are `46×42` with `colGap = 4`, `rowGap = 4`, anchored at `yTop = 65`. Total stack height ≈ 230 px.
- Fill order: `(outer, row 0), (inner, row 0), (outer, row 1), (inner, row 1) …`. Order in `Object.values(DRUGS)` controls which drug lands where.
- Fixed `Phaser.Rectangle.setSize` NPE at `_drawDrugIcons` ~10017 by removing a redundant per-frame `setSize` call (Phaser version edge-case).

**Pedals & wiper repositioned to off-weapon edge** ([GameScene.js](src/scenes/GameScene.js))
- `_applyPedalHandedness()` (~5686): `PEDAL_X = leftHanded ? (SCREEN_W - PEDAL_W/2 - 4) : (PEDAL_W/2 + 4)` — ACCEL / BRAKE now share the off-weapons screen edge with the drug column so the drug grid has the entire weapons-side strip free.
- Wiper button (~8728) mirrored to the same side as the pedals so the entire control column reads as a single unit.

**Title-screen polish — gesture safety, persistence, 18+ disclaimer** ([GameScene.js](src/scenes/GameScene.js))
- Removed tap-anywhere-to-start. Only the green Start button launches the run; other taps on the title surface change the live difficulty / thumbs widgets without consuming the gesture.
- "You should probably be 18+" disclaimer placed next to the Start button.
- Title blurb fade-out scheduled at `3.5 s` via Phaser Tweens (post-load fluff doesn't linger over the artwork).
- Title selections (`titleThumbsPick`, `titleDiffPick`) persist across sessions via the save registry — survives tilt-unsupported fallbacks.
- Tilt iOS permission flow hardened: `requestPermission()` fires from a fresh Start-button gesture, with a DOM-level `touchend` / `click` fallback armed if the initial prompt doesn't surface (Chrome iOS / WKWebView gesture loss). Permission denial preserves `titleThumbsPick` so the player isn't dumped back to "0 thumbs" silently.

**Audio fix — macOS case-folded gitignore** ([.gitignore](.gitignore))
- The 63 MP3s in `public/assets/music/` were being silently skipped by git because `.gitignore` matched `Music/` against `music/` on the case-insensitive macOS filesystem, so Netlify only had the procedural / fallback tracks.
- Fixed by anchoring the pattern to the repo root: `Music/` → `/Music/`. The actual scratch `/Music/` folder at the project root is still excluded; the deployed `public/assets/music/` is now tracked. All MP3s committed in the same change.

**Shrub damage + hot keys** ([GameScene.js](src/scenes/GameScene.js))
- Confirmed shrub glancing-sideswipe cost is `0.5 – 1.0 HP` (per `RouteData.js` spawn metadata) with lateral push only — no warp-to-center.
- `B` warps player position back `0.25 mi`, `N` warps forward `0.25 mi` (clamped at final mile). Companions to existing 1-9 mile warps. All three blocks marked `// REMOVE BEFORE RELEASE`.

**Other small fixes**
- `ghostOffset is not defined` (double-vision pass at [GameScene.js:6985](src/scenes/GameScene.js#L6985)) — variable was renamed to `ghostOffsetBase`; a tire-shadow ref still pointed at the old name. Re-derived `ghostOffset` inline at the call site.
- Powerline wire that abruptly stopped when the closest pole passed the camera now extrapolates horizontally past the closest visible pole using `previous − secondPrev`. Mid-span sag removed entirely (straight 2-point line) per user feedback.

### 2026-05-27 — Title polish, new infrastructure, route content, physics tweaks
A long mixed session — major buckets:

**Title screen overhaul** ([GameScene.js](src/scenes/GameScene.js), [AssetManifest.js](src/systems/AssetManifest.js))
- `_setHudVisible` now also hides HP / gas / accel bar / gas icon / HP damage popup / party clock / drug-bar labels / F12 weapon icons. `_drawDrugBars` and `_drawF12Inventory` early-return when `_awaitingStart`.
- Replaced the title-over-live-road presentation with the authored neon rainy Seattle artwork from `Images/DUI Title Screen.png`; the runtime game loads a compact `800x450` WebP version at `public/assets/ui/title_screen.webp` (about `91 KB`).
- Interactive hit regions align with the artwork's bottom cards: `START`, live `DIFFICULTY`, live `DRIVING TYPE`, and `LOAD SAVE`. Difficulty and driving type repaint only their interior value area so selections can change without disturbing the composed scene.
- Title defaults: Thumbs `2` (classic) and Difficulty `Normal` on first-ever load. Subsequent runs restore the player's last picks from a dedicated `titleThumbsPick` / `titleDiffPick` registry slot — survives even when the underlying steering subsystem falls back (e.g., tilt unsupported).
- Difficulty + steering only commit on the green Start tap so the iOS tilt permission prompt fires from a fresh user gesture. DOM-level `touchend`/`click` fallback armed if the initial `requestPermission()` doesn't surface the prompt (Chrome iOS / WKWebView gesture loss).

**Neon ending screens** ([GameOverScene.js](src/scenes/GameOverScene.js), [GameScene.js](src/scenes/GameScene.js), [AssetManifest.js](src/systems/AssetManifest.js))
- `OVERDOSED` uses a compact `800x450` rainy-Seattle neon background plate (`end_overdose_neon.webp`, about `60 KB`); the full generated PNG source is archived under `Archive/generated-source/ui/`.
- `BUSTED` now uses the authored `Images/DUI Busted Screen.png` artwork through a compact runtime copy (`end_busted_screen.webp`, about `61 KB`). Its baked parallelogram buttons remain visually untouched; transparent shaped hit zones add hover outlines and map `RETRY` to start over, `LOAD SAVE` to the current checkpoint, and `MAIN MENU` to the title screen. A small neon readout above the buttons displays the last saved checkpoint code. The superseded generated Busted runtime plate was moved out of `public/` into `Archive/generated-source/ui/`.
- `CRASHED` now uses the authored `Images/DUI Crashed Screen.png` artwork through a compact runtime copy (`end_crashed_neon.webp`, about `60 KB`). Its baked parallelogram buttons remain visually untouched; transparent shaped hit zones add hover outlines and map `RETRY` to start over, `LOAD SAVE` to the current checkpoint, and `MAIN MENU` to the title screen. It shares the checkpoint-code readout.
- `OVERDOSED` uses an 80s chrome/neon live UI layer with run-report fields for cause, distance/time, losses, and checkpoint code, plus crisis/treatment support lines.
- Ordinary police arrest thresholds now enter the `BUSTED` ending instead of silently resetting into gameplay. Bail loss is assessed once before the ending report; retrying from the checkpoint preserves the post-bail balance rather than applying an additional crash penalty.
- The top-row HUD controls (pause, skip, station, mute, map, and garage) now draw as angled dark-glass neon cells so gameplay and ending screens share the same UI style.

**Tilt steering**
- Proportional analog steering for tilt mode: lower threshold (10° → 3°), `_tiltSteerAmt` value in `[-1, 1]` (full lock at ±20°), used directly as `steerIn` in tilt mode. Lets the player feather the lane line.
- Tilt mode now ignores `_touchLeft / _touchRight` so a player on tilt isn't accidentally also tap-steering.

**Difficulty / speed**
- Fentanyl no longer hard-caps speed to 30%. Proportional `-10 mph per 10% bar` via `baseSpeedMult -= fent * (10/12)` — at 100% fent the top speed lands around 20 mph (from 120).

**Vehicle/water physics — guardrails, dunk, sink animation**
- Guardrail clamp (`0.95`, 3 HP/sec scrape) now fires on every water-adjacent segment: `seg.bridge`, `seg.water` (bridge aprons), `seg.waterLeft` (left-only rail), `seg.waterRight` (right-only rail).
- Water dunk threshold raised `1.05 → 1.5`. Sinking only triggers when a violent impulse (head-on, glitched i-frame) punches the car past the rail. Normal drift just scrapes.
- Multi-stage sink animation: tire shadow disappears first, then progressive sprite crop (tires → lower body → roof) with sprite Y shifted down so the visible bottom stays at the water line. After 1.5 s: -10 HP + warp to road center + 1.5 s cooldown.

**Hot keys**
- `B` warps player position back `0.25 mi` (companion to existing `1-9` mile warps).
- `N` warps forward `0.25 mi` (clamped at final mile).
- All three blocks marked `// REMOVE BEFORE RELEASE` and search-able by `DEV WARP` / `BACK-WARP HOTKEY` / `FORWARD-WARP HOTKEY`.

**Tunnels & overpasses**
- **Wildlife crossing at mile 65.00–65.03** (Snoqualmie Pass). Implemented as a `seg.tunnel = true` + `seg.wildlife = true` short tunnel. Walls are 1/6 of Mercer Island's (`wallW = w × 0.13`). Facade flank polygon is TWO sine-curve mounds (one each side of the arch, peak at mid-flank height = `dropY`) with a semicircular arch + concrete arch ring between them. Dirt + grass band + tree silhouettes paint ON TOP of the ceiling. `H_HILL = 20000`, `W_FLANK = 40000` for wildlife (vs `25000` / `337500` for normal highway tunnels). Normal tunnels (Mt Baker, Mercer Island) keep the original single-peak mountain + rectangular lintel mouth — guarded by `isWildlifeFacade` branches.
- **I-405 freeway overpass at mile 11.45–11.47** marking exists in [RouteData.js](src/road/RouteData.js) but is commented out — held for redesign. The `_drawOverpasses` renderer remains in [Road.js](src/road/Road.js) ready for a future flat-deck implementation.

**Vantage suspension bridge** ([RouteData.js](src/road/RouteData.js), [Road.js](src/road/Road.js))
- New 0.5-mi suspension bridge at mile 134.55–135.05. Middle 50% of segments (`suspT 0.25–0.75`) get `seg.water = true` so the canyon abutments stay on land. `seg.suspension = true` + `bridgeTowerStart` / `bridgeTowerEnd` on the two endpoints + `suspT` (0..1 along span) per segment.
- `_drawSuspensionBridge` in Road.js paints two pylons (with crossbeam + finial dot) at the tower segments, then a catenary cable polyline on each side of the road (sag formula `1 − 4t(1−t)`) connecting tower tops, plus vertical hangers every 4 segments.

**Route content / scenery**
- Sparse-store corridor mile 14–25 — `1.4 buildings/mi`, alternating sides (`makeOne(slot % 2 === 0 ? -1 : +1, ...)`).
- Suburban Bellevue / Issaquah home clusters past mile 13.25 — sine-cadence: clusters every 0.4 mi in the 13.25–14.5 dense window, 0.5 mi past that. 4 homes per cluster at 40 slots/mi packed close. Cluster side alternates per bucket. `_homeClusterSign` tracked into `SPAWN_TREE` so the OPPOSITE side gets trees, never both sides at the same segment.
- Tree density mile 14–25 bumped 22 → 120 slots/mi (was 80) with 20% giant-boost in the eastern stretch.
- Vantage area (mile 128–145) gets 3× vegetation: east_cascades trees 32 → 96/mi, shrubs 40 → 120/mi. Columbia Basin tail (138–145) keeps tripled shrub density (210/mi).
- Rolling-hills overlay (mile 128–145): sinusoidal `hills[]` modulation with two wavelengths (1.2 mi + 0.45 mi) under a sine envelope. Macro grade unaffected.
- Lake Sammamish — painted as a horizontal water band on the LEFT horizon during mile 14.9–16.2 (fades in/out), with a thin dark shoreline silhouette and white glint stripe.
- Milky Way gating — sky band only fades in from mile 200 → 210 (was 110–120). Matches real astronomical darkness; field stars + moon still ramp during dusk.
- Bellevue downtown skyscrapers end firmly at mile 13 (`eastside_urban` excluded from cycle-pool spawn past mile 13).
- Mercer Island homes restored — `isMercerForestOnly = false`. Cycle-pool spawn now drops West Seattle home photos along mile 7.2–9.8 (residential rate of 80 slots/mi). Dense forest behind still fills via the regional tree pass.
- Right-side tree ramp guard — within 1 mi of any rest stop, right-side trees shift to offset 5.0–6.5 (past the ramp's outer edge) so the post-pass ramp clearance doesn't strip them.
- West Seattle home pool walk uses an xorshift mix + anti-repeat step (no more strict A→B→C→D→E→F cycle).
- Cycle-pool same-texture-both-sides bug fixed — right-pool walk offset is `floor(len/2)` with an explicit `if (leftKey === rightKey) rightIdx++`, eliminating mirrored stores across the road in any city.

**Cockpit elevation**
- `ELEV_MULT = CAM.mode === 'cockpit' ? 0.5 : 1.0`. Applied to `seg.y` at `project()` call sites in [Road.js](src/road/Road.js) AND to the segY portion of `cameraY`. Chase mode unaffected. Vantage's steep descent reads much flatter through the windshield.

**Powerlines** ([GameScene.js](src/scenes/GameScene.js))
- Wire extrapolated past the closest visible pole using `previous − secondPrev` X delta (Y locked to `previous.wireA/B`). Wire continues OFF-screen horizontally instead of stopping mid-air when the camera passes a pole.
- Wire sag removed — `connectWire` is now a straight `moveTo / lineTo`. The mid-span sag made the wire appear to dip into the road as a pole approached.

**Shrubs vs other scenery**
- Trees, buildings, cows, landmarks → `_triggerSceneryRespawn` (full crash → recover-lane warp). Cows added to `SCENERY_TYPES` (collidable per spec).
- Shrubs → new `_sceneryGlance(proj, damage)` with light damage (0.5–1 HP per `RouteData.js` spawn), strong lateral push (`xImpulse = pushDir × 0.18`), zeroed inbound steerVelocity, 200 ms i-frame. NO speed cut, NO warp, NO "CRASH" popup. The bush gives way.

**Other gameplay fixes**
- Trees made collidable everywhere: regional Mercer trees, dense-forest far rows, the East WA barn, livestock — all had `collidable: false` that's been removed.
- Double-vision green-ground bug fixed: ghost-road pass (`_drawSegment(ghostG, ..., isGhost=true)`) skips full-width grass / water / bridge / tunnel-wall fills so the offset ghost doesn't overlay green grass on top of the player's road.
- Ghost lateral offset scaled by perspective (`proj.sw / 200`) — far ghosts no longer fling halfway across the screen.
- Tire-shadow suppression when sink animation is active (shadow vanishes before tires submerge).

### 2026-05-27 — Wiper controls/animation and eastern WA utility lines
**Windshield wipers** ([GameScene.js](src/scenes/GameScene.js), [AssetManifest.js](src/systems/AssetManifest.js))
- Replaced the ambiguous wiper-button glyph with a conventional windshield/single-blade icon and moved the button directly beside `BRAKE`; it mirrors with the pedal column when handedness changes.
- Cockpit view now reuses two copies of `beater_wiper_arm.png`: a left-mounted blade and a center-mounted blade, both parked pointing right and sweeping together through `0° -> 100°`.
- Corrected stretched/thin blade rendering by preserving the source aspect ratio, then lengthened/spread the pair so the high sweep approaches the rear-view mirror.
- Third-person view now uses the same paired image-based blade effect instead of thin procedural lines.
- Fixed the weather-exit state bug: when the rain/snow wiper button disappears, active wipers immediately shut off and park so the player cannot be stuck with no OFF control.

**Eastern Washington utility lines** ([RouteData.js](src/road/RouteData.js), [GameScene.js](src/scenes/GameScene.js), [AssetManifest.js](src/systems/AssetManifest.js))
- Added two compact transparent utility-pole runtime assets: `east_wa_utility_pole_plain.webp` and `east_wa_utility_pole_transformer.webp` (`256x512`, roughly `38 KB` combined). Full generated PNG sources remain archived under `Archive/generated-source/eastern-scenery/`.
- Added a memory-conscious projected utility-line renderer: a small reusable pole sprite pool plus procedural sagging wires, rather than dense route sprites or long strip images.
- Utility lines currently appear around Cle Elum and Ellensburg, plus selected farther-east open stretches; fenced pasture runs, bridges/tunnels/water, and rest-stop ramp corridors suppress pole placement.
- Pole spacing is calibrated to approximately `200.7 ft`. Plain poles are the default; transformer poles occur more often near Cle Elum/Ellensburg home frontage and every fifth pole in open-country runs.

**Verification**
- `npm run build` passes. Vite's existing large Phaser-chunk warning remains informational.

### 2026-05-26 (late) — Cockpit POV pass, Netlify deploy, trophy threshold
**Cockpit POV overhaul** ([GameScene.js](src/scenes/GameScene.js), [src/constants.js](src/constants.js), [src/utils/Helpers.js](src/utils/Helpers.js))
- Default view is now **3rd-person chase**; V toggles into cockpit. `_buildCockpit()` is followed by `_leaveCockpitView()` at scene start.
- Mutable `CAM = { height, depth, eyeForwardZ, horizonY, mode }` profile. Cockpit values: `horizonY: 130`, `depth: 0.92`, `eyeForwardZ: 4500`, `height: 1200`.
- Shared horizon: `project()` now takes optional `horizonY` so road polygons AND sprite/NPC samples converge to the same vanishing Y.
- NPCs use `_renderCamPos` so cockpit and chase share one camera basis — fixed "tiny cars next to me" by aligning sprite scale to the unified projection.
- Near-cull is view-aware: relZ < 100 in cockpit, < 1950 in chase, so cars exit screen sides instead of disappearing under the dashboard.
- HUD popup Y depends on `_cockpitActive` — popups land on the dashboard (not below the rear-view mirror) in cockpit.
- Pedal handedness: `_applyPedalHandedness()` mirrors ACCEL/BRAKE to the opposite side from weapons; both buttons moved fully to the screen edge.

**Bridge & tunnel visuals** ([src/road/Road.js](src/road/Road.js))
- West Seattle Bridge: water charcoal `0x0E1014` (was blue), foam/glints suppressed on bridge segments. Distant treeline silhouette painted on water/floating-bridge segments to break the "cranes in water" read. `bridgeFrontGfx` occluder at depth 4 re-paints WSB guardrails above cranes (`renderDepth: 2`) — **don't merge back into roadGfx**.
- Mercer Island tunnel facade: board-form lines on lintel, pour seam, mouth-shadow border, hillside weathering streaks.

**Tree density** ([src/road/RouteData.js](src/road/RouteData.js))
- Downtown Seattle: 120 → 600 slots/mi, `_treeHeightBoost: 1.5`. Added `SEATTLE_STREET_TREES` (deciduous-weighted).
- Mercer Island: 60 → 400 slots/mi with `_denseStreetTrees`, `_treeBigBoostChance: 0.35`, big-boost 2.0–3.0×. Forest-lot rows 72 → 130 with outer rows scaled 2.1× and 20-30% giants.
- `SPAWN_TREE.pushOne` now accepts a regional `heightBoost` (or random big-boost roll).
- Mercer Island house setback pushed 1.25 → 2.75 car-widths past fog.
- Removed "west" tag after the first bridge.

**iPhone-menu chip recalibration** ([index.html](index.html)) — trophy `108 505 120 120`, lock `275 505 120 120`, hand `108 680 120 120`.

**Trophy threshold: 100% → 99%** for maxed-drug achievements ([GameScene.js](src/scenes/GameScene.js) ~5216, [AchievementSystem.js](src/systems/AchievementSystem.js) 117-122). 100% sits at the OD edge ("dead"); 99% reads as "maxed out" without forcing the player to a one-pickup-from-death brink. All 6 descriptions updated ("Hit 99% …").

**Web shipping path** ([netlify.toml](netlify.toml), [package.json](package.json))
- Pivoted from TestFlight to **Netlify web distribution** (no Apple Developer enrollment).
- GitHub repo set up; Netlify auto-deploys on push to main.
- Resolved repeated Netlify build failures:
  - **Rollup native binary missing** on Linux: pinned `@rollup/rollup-linux-x64-gnu` (plus darwin-arm64/x64) in `optionalDependencies`. Also held `NODE_VERSION = "18"` so npm 9 ships (avoids npm 10's optional-deps bug).
  - **"Unrecognized Git contributor"** on Netlify private-repo gate: user set `brendanbaughn@gmail.com` as primary on GitHub, switched git author email, pushed empty commit to re-trigger.
- iOS tilt-steer + accelerometer permission flow works against the live Netlify HTTPS URL.

### 2026-05-26 — Mercer/tunnel fixes, eastern WA rural scenery, OD/damage polish
**Damage and endings**
- Critical HP now adds progressive procedural windshield cracks in all view modes, starting at roughly 10 HP and worsening toward `WRECKED`.
- Low-HP smoke is visible in cockpit view as well as chase view.
- `WRECKED` has a shattered-windshield overlay; overdose now freezes the final road frame, fades to black, then presents the `OVERDOSED` ending.
- Fixed a restart freeze after overdose: `_odEnding` survived Phaser scene reuse and kept a Vantage/checkpoint restart permanently frozen. `GameScene.init()` now clears it on every new run.

**Drug rule update**
- Beer now removes `5` percentage points from every other drug bar only when that bar is above `45%`.
- Example: heroin `60% -> 55%`, while heroin `45%` remains `45%`.
- Updated the beer description in `AchievementSystem.js` to match the implemented rule.

**Mercer Island and tunnels**
- Mercer Island roadside housing was replaced with forest-only lots using reused tree assets for a lower-memory wooded look.
- Tunnel rendering was iterated to prevent cars, blue sky gaps, and portal/background scenery from showing through tunnel walls or curved sightlines.
- Tunnel mouth/facade masking and wall occlusion behavior now live in `Road.js`; visually drive-check Mercer entrance, interior curve, traffic occlusion, and exit angles before considering this fully closed.

**Eastern Washington scenery after Vantage**
- Added compact transparent WebP runtime assets for dry-side buildings:
  - `cle_elum_general_store.webp`, `ellensburg_main_street_shops.webp`
  - `east_wa_weathered_house.webp`, `east_wa_abandoned_bungalow.webp`, `east_wa_barn.webp`
  - `east_wa_two_story_brick_shop.webp` and `east_wa_block_repair_shop.webp`
- The original raised-sign dilapidated market repeated the same general-store silhouette too closely; it is no longer actively loaded and is retained at `Archive/retired-runtime/eastern-scenery/east_wa_faded_market.webp`.
- Source originals remain under `Archive/generated-source/eastern-scenery/`; runtime uses cropped/compressed WebPs.
- Eastern town windows now place one business plus only `4-6` homes, then transition into farm/brush country. Post-Vantage businesses alternate flat-roof silhouettes instead of repeating the same store.
- Columbia Basin/Palouse dressing was shifted toward shrubs with sparse pines, so brush outweighs trees.

**Fences and cattle**
- Added one reusable fence-post WebP (`east_wa_fence_post.webp`, under `1 KB`) with procedural rail lines and pooled post rendering.
- Fence posts are route-anchored and move toward/past the player while driving rather than being camera-fixed.
- Short fenced pasture runs recur every few miles after Vantage; only alternating fenced runs contain cattle.
- Added three reusable, horizontally flippable cow-group assets (`east_wa_herd_3_cows.webp`, `east_wa_herd_5_cows.webp`, `east_wa_herd_6_cows.webp`). Final artwork is cows-only with spacing/perspective variety and no steer imagery.

**Other**
- ACCEL/BRAKE controls were moved to the side opposite weapon controls.
- Added a TODO for lightweight smashable roadside objects: cones, boxes, barrels, and trash cans; pedestrians remain a separate design choice.
- Mushroom “melt” projection was introduced for high shrooms and reduced from its stronger experimental amplitude to the current moderated maximum.
- `npm run build` passes. Vite's existing large Phaser-chunk warning remains informational and unrelated to the added image assets.

### 2026-05-25 — Mercer Island ramp polish + 21-bug audit sweep
**Ramp clearance for Mercer Island homes:** Right-side WEST_SEATTLE_HOMES near rest stops were sitting in the off-ramp gore wedge. Added a `rampClearance` flag on right-side cycle-spawned buildings within `(rs.mileage − 1.0, rs.mileage + 0.3)` (only the right side — there is no left-side off-ramp). Renderer + collision pass both:
- Push the home past the ramp's outer edge via `visualOffset = ±(rampOuterEdge + 0.30)` when `rampStrength > 0.30` (was 0.40 — the lower threshold catches the rs=0.30–0.40 band where the ramp paint already touches a 2.05-offset home).
- Apply a +80 px screen-x nudge (sign-aware) and a 0.88× shrink so the home reads as set back without flying into horizon-distance.
- The earlier 0.35-mi pre-exit corridor wipe (`RouteData.js:1521`) was deleting `rampClearance` homes from mile ~9.15 forward; added an early-return so they survive.
- The dynamic `SCENERY_ROAD_CLEARANCE` re-sample (renderer + collision) now skips `rampClearance` sprites so the +80 px shift isn't wiped by a second `sampleSurface` call.

**Parallel four-agent code audit:** spawned drug/HP, cops/wanted, road/scenery/collision, and rest-stops/UI/save-state agents in parallel. Consolidated findings into a 21-bug ranked list and fixed all of them, plus polish:

**Critical state-corruption fixes**
1. **`_customFlags` leak through Start Over** — pause Start Over now wipes `_customFlags` / `_customStartStars` / `_customStartLevels`; `init()` also unconditionally resets them (was `??`-preserved, so a Custom run's `noPolice` silently disabled cops in the next Normal launch). [GameScene.js:303-308](src/scenes/GameScene.js#L303), [:795-815](src/scenes/GameScene.js#L795)
2. **Save-code length** — popup bumped 4→5 chars (Easy/Hard codes were silently downgrading to Normal). Custom mode now emits `customSub`'s letter (E/N/H) instead of unparseable 'C'. [GameScene.js:8855-8875](src/scenes/GameScene.js#L8855), [:9098-9145](src/scenes/GameScene.js#L9098)
3. **OD check** now uses `cfg.odThreshold` per drug — heroin OD at 0.88, meth 0.85, ket 0.90, rx 0.97 (was hard-coded `> 1.0`, unreachable because pickup clamps at 1.0). Alcohol/weed/coke/fent stay safe via their 1.0 threshold. [DrugSystem.js:354-365](src/systems/DrugSystem.js#L354), [:451-466](src/systems/DrugSystem.js#L451)
4. **GameOver Start Over** now mirrors the pause-menu registry wipe (`drugUnlocks`, `drugProgress`, `lastRestStop`) — was just `scene.start('Game')` with no cleanup. [GameOverScene.js:288-302](src/scenes/GameOverScene.js#L288)
5. **RESTOCK chain-unlock** — `refillAll` no longer writes to `maxReached`; it was silently chain-unlocking LSD/fentanyl whenever the shrooms/heroin bar got refilled. [DrugSystem.js:99-115](src/systems/DrugSystem.js#L99)
6. **L/R texture sides swapped** — Bellevue `*_left` directional facades were placed on the right side of the road. Spawn now correctly does `makeOne(-1, leftKey, false); makeOne(+1, rightKey, onRamp)`. [RouteData.js:888-925](src/road/RouteData.js#L888)

**Visible / impactful**

7. **Meth speed bonus** now also applies to cruise + boost + `_maxSpeedWithBoost` (was only on the displayed speedometer — car never actually accelerated to it). [GameScene.js:2403-2414](src/scenes/GameScene.js#L2403), [:9303-9311](src/scenes/GameScene.js#L9303)
8. **Hitchhiker PARTY FAVOR** now bumps `maxReached`, increments `pickupCounts`, runs `_checkUnlocks`, AND mixes in a cash bonus alongside the drug fill (was a silent direct level-set that bypassed every side effect). [GameScene.js:4900-4925](src/scenes/GameScene.js#L4900)
9. **REPAIR CAR** fills to `VEHICLES[id].hp` (125 for playdoutS3X), not flat 100. [RestStopScene.js:1009-1014](src/scenes/RestStopScene.js#L1009)
10. **Disguise** zeroes all four bump counters (rear / head-on / pit / general) — was leaving rear/head-on/pit intact, so one more bump after disguise = instant BUSTED. [CopSystem.js:470-484](src/systems/CopSystem.js#L470)
11. **Heat penalty** now skips disguise + spike_strip (the cleanse weapon was rolling 25% to re-add a star on the same tap that zeroed them). [GameScene.js:5414-5425](src/scenes/GameScene.js#L5414)
12. **Arrest** now resets `_drugBumpFired` / `_drugBumpCount` / `_npcCrashesPostDrink` — without this, the Path-B drug-bump star gate was permanently disabled after the first arrest. [GameScene.js:9374-9384](src/scenes/GameScene.js#L9374)
13. **Hitbox parity** — collision pass now mirrors the renderer's `SCENERY_ROAD_CLEARANCE` push (Bellevue/general buildings used to crash at the unshoved offset while painted further away). [GameScene.js:3275-3300](src/scenes/GameScene.js#L3275)
14. **F12 double-fire gate** — `_useTopF12` checks `_f12FiredThisFrame`, reset each `update()` (tap-icon + hold-F was burning two tokens per intent). [GameScene.js:1749-1752](src/scenes/GameScene.js#L1749), [:5432-5439](src/scenes/GameScene.js#L5432)
15. **gameTime + party clock** pause until first tap in fresh ready-state (contradicted the documented behavior). [GameScene.js:1856-1864](src/scenes/GameScene.js#L1856)

**Edge cases**

16. `rampClearance` threshold tightened 0.40→0.30 (see ramp polish above). [GameScene.js:6437-6448](src/scenes/GameScene.js#L6437)
17. `rampClearance` sprites skip the dynamic road-clearance re-sample so the +80 px screen shift isn't dropped. [GameScene.js:6471-6482](src/scenes/GameScene.js#L6471)
18. **Helicopter lock** threshold tightened 4.5→4.75 — stars stuck at exactly 4.5 used to lock out decay forever. [CopSystem.js:548-557](src/systems/CopSystem.js#L548)
19. **Custom death-respawn stars** — `_customStartStars` now re-applies in `_resumeFromPosition` (was only consumed in `_startGameplay`, so Custom respawn dropped to 0★). [GameScene.js:982-989](src/scenes/GameScene.js#L982)
20. **Unified modal flag check** — added `_anyModalOpen()` helper covering `_modalOpen` + `_mapModalOpen` + `_garageModalOpen` + `_sliderModalOpen` + `_achievementsModalOpen`; scene-level pointer handlers now read through it. [GameScene.js:5050-5065](src/scenes/GameScene.js#L5050)
21. **Rx NPC shift sign-aware** — Rx shift now applied in the direction of NPC travel (oncoming slows toward 0, never flips). Previously ≥ 15 Rx pickups would reverse-direction slow oncoming traffic. [GameScene.js:2899-2920](src/scenes/GameScene.js#L2899), [:2942-2954](src/scenes/GameScene.js#L2942)

**Polish**
- **MPH display** ceil-clamped so cars rolling < 1 mph read as "1" not "0" ([GameScene.js:8048-8050](src/scenes/GameScene.js#L8048))
- **Addiction weighting** switched from linear (`count × 0.4`) to sqrt-scaled (`√count × 1.6`) so 30+ pickups no longer permanently lock out other drugs at 13:1 odds ([DrugSystem.js:415-422](src/systems/DrugSystem.js#L415))
- **Scene sprite pool exhaustion counter** — `_sceneSpritePoolExhausted` increments when the 400-slot pool fills, for future F3-overlay surfacing ([GameScene.js:6413-6420](src/scenes/GameScene.js#L6413))

**West Seattle phantom-crash fix:** Photo-based homes (West Seattle / Mercer Island) spawn as `type: 'building'` but share the same wide padded PNGs as Mercer Island houses. The 0.22 narrow `collisionWidthFraction` only triggered for `type === 'house'`, so West Seattle homes used the default 0.65 — extending the hitbox ~30% into transparent PNG padding. ~25% of West Seattle drive-bys felt like "home pulls away at the last second but I still crash." Fixed by detecting `texKey.startsWith('west_seattle_')` and applying 0.22 there too (collision pass + debug overlay). [GameScene.js:3310-3322](src/scenes/GameScene.js#L3310), [:5846-5856](src/scenes/GameScene.js#L5846)

### 2026-05-14 — Scenery cleanup + new sprite assets
**Roadside scenery cleanup:** Disabled the generic per-segment tree/shrub scenery pass in [RouteData.js](src/road/RouteData.js). The repeated natural sprites were reading as shrub piles and adding clutter; route identity now comes from authored buildings, long roadside strips, and sparse skyline.

**Rest-stop exit strips:** Added long transparent roadside strips for exit/rest-stop approach scenery:
- `public/assets/buildings/codex/bellevue_roadside_strip.png`
- `public/assets/buildings/codex/issaquah_roadside_strip_perspective.png`

Those are registered in [AssetManifest.js](src/systems/AssetManifest.js), profiled in [GameScene.js](src/scenes/GameScene.js), and placed near rest-stop exits in [RouteData.js](src/road/RouteData.js). They are non-collidable scenery and intended to replace repeated tiny homes/shops/shrubbery near exit lanes.

**Drug sprite remake:** Replaced all ten drug pickup sprites in `public/assets/drugs/` with more detailed arcade-style transparent assets using the existing filenames/manifest keys: beer, weed, cocaine, shrooms, LSD, heroin, Rx, fentanyl, ketamine, meth. No code path change needed; the existing manifest still loads them.

**NPC / prop art generated and stored:** Added new transparent PNG assets:
- `public/assets/hookers/sex_worker_1.png`
- `public/assets/hookers/sex_worker_2.png`
- `public/assets/props/hitchhiker_1.png`
- `public/assets/props/hitchhiker_2.png`
- `public/assets/props/overhead_powerlines_long.png` (4096×1024 long strip)

These are stored only as assets so far; the hitchhiker/sex-worker art is not yet wired into gameplay rendering, and the powerline strip is ready for a future scenery pass.

**Validation:** Syntax checks passed for [RouteData.js](src/road/RouteData.js), [GameScene.js](src/scenes/GameScene.js), and [AssetManifest.js](src/systems/AssetManifest.js).

### 2026-05-12 — Phone-as-Menu + per-vehicle art + warps
**Phone-as-menu (HTML overlay):** CSS-driven portrait overlay, tap-to-unpause after rotation, lock-pause chip, trophy chip, in-world clock on Calendar, Map modal (SVG vertical route + live player dot), Garage modal (vehicle picker with accessory badges), Music app (genre → song picker, shuffle all/genre), Checkpoint dock-tap warps, steering-app selection stroke. PNG-pixel hit-zones with JS auto-positioning + `?debug` / `?calibrate` URL modes.

**Per-vehicle art:** Six vehicle PNG pairs (front+back) wired: Used Sedan (white) · Used 4x4 SUV (blue) · Used Truck (truck blue) · Electric Truck (orange) · Electric Roadster (green) · Bestla Play'dOut (blue2). Aspect-preserving sizing at 90 px wide.

**Title screen:** Wheel flipped to right, START button removed (tap-to-launch). Uniform 2-px white stroke on all panels. Custom mode picker adds Easy/Normal/Hard gameplay sub-difficulty.

**Warps:** Forward warps drain gas equal to trip distance. Custom-mode warp sets `warpForward` flag. Per-difficulty respawn lane.

**Damage tuning:** Tunnel slam 3 HP, scenery 10 HP (× difficulty mult). Floating "-X HP" popup next to HP for 1.5 s. Camp-repair "N/A" guard when HP ≥ 65% target.

**Signs:** Round decimal mileages. Tunnel-landing signs walk backward to just before tunnel mouth.

**Rest-stop UX:** BACK button moved to top-left corner so it stops covering SAVE CODE.

**Party clock fixes:** Reset on difficulty pick. `_partyClockSecMax` stored alongside `_partyClockSec` for phone-menu clock UI.

**Rear-view mirror:** Draw distance extended 9k → 36k units. Traffic-array despawn extended to -35k so cars survive long enough to be visible to the horizon.

**HUD layout:** Default handedness flipped to LEFT (weapons on left). Shift+L toggles. HP / Mi text inboard of weapon column. Gas icon center-side of gas text (dynamic positioning per frame). Music genre 17 → 22 px. Weapon cells +15% size. Score + clock follow drug bars in handedness flip.

**Modal-close bug:** Map / trophy / garage close was firing the title's "any tap" handler. Fixed with `_*ModalJustClosed` flags + 50 ms grace.

### Earlier "Overnight Build Notes" — Achievements + party clock + custom mode
- **Phase 4 — Achievements:** Full AchievementSystem with tiered toasts and Achievements page modal.
- **Phase 7 — Party clock + Pullman finish:** Color-shifting HUD clock, ON TIME / TOO LATE / TOO LATE+5★ branches, NPC vignettes.
- **Custom Mode:** Drug-slider modal at run start, no score awarded.
- **LSD rainbow** moved into Road.js (behind road instead of top of stack).
- **Code audit:** Removed dead `shrooomsMax` / `heroinMax` / `lsdMax` fields. Initialized `_comboActivatedAt` in DrugSystem constructor.

### Risky issues flagged for review (still open)
1. **CopFleet pit cooldown** — design decision: total cool-off ≈ PIT_COOLDOWN + recovery vs PIT_COOLDOWN. Tune-time.
2. **Title-letter tweens on `repeat: -1`** — leak ~9 tweens per scene start, not yet killed on title destroy. Stable in practice.
3. **`_methPhase1` init order** — works (undefined coerces to false) but fragile. Easy one-line constructor fix.
4. **RouteData modulo loop** — `for (let i = tunnelStart; i !== tunnelEnd; i = (i + 1) % count)` will infinite-loop if start === end. Add guard.
5. **EffectsSystem optional chaining** — unnecessary `?.` calls on always-present `this.audio`. Style/perf, not bug.
6. **Console.logs** in init + weapon-fire — production noise; keep for debugging or delete.
7. **Slider `pointerup` listeners** — leak if modal is open during scene restart. Edge case.

### 2026-04-30 session — Tunnel embankment + pause menu + per-victim FX
- Mt-Baker tunnel embankment (concrete hillside above tunnel mouth + side pillars)
- Pause menu Start Over + From Checkpoint buttons moved below player car
- Per-victim weapon FX (windshield star, victim spin/roll instead of vanish)
- HUD radio polish (mute / music-note buttons)
- Sign sizing bumps
- Drunk drift gate (sign text "floats" only when alcohol ≥ 1.0)
- Topography scale bump (ELEV_SCALE 80 → 140)
- **Open from that session:** doubled sign-text at 0% alcohol; user wants thinner sign font (currently Impact); user message ended mid-sentence with "As for Start Over..." — never followed up

---

## 9. Important traps & gotchas

### Phaser scene-reuse hazard
`scene.start('Game')` reuses the **same instance**. Stateful flags (`_takingExit`, `_continuing`, drug-bump counters, HUD cache refs `_f12Texts`/`_drugLabels`) MUST be explicitly reset in `init()`. Otherwise prior-run state silently breaks the next visit.

### Vite HMR cache
Edits sometimes serve a stale module export (`SCREEN_H not exported`, `Wallet not exported`, etc.). Source is always fine. Fix:
```
pkill -9 -f "node.*vite"
rm -rf node_modules/.vite
npm run dev
```

### Difficulty change without scene restart
Party clock is initialised in `_doCreate()`. Tapping E/N/H on title now resets `_partyClockSec` + `_partyClockSecMax` explicitly so the clock matches the chosen mode.

### Modal-close vs "any tap" handler
Title screen's scene-level `pointerdown` handler fires AFTER any modal's close handler destroys its buttons. Use a `_*ModalJustClosed` flag with `setTimeout(50)` to prevent the closing tap from launching a race.

### iPhone Safari toolbar (NOT in PWA mode)
In regular Safari tab mode, the bottom toolbar reserves ~50 px of viewport. PWA mode (Add to Home Screen) removes the toolbar; the menu reaches the home-indicator gesture area. Use `viewport-fit=cover` + `top/right/bottom/left:0` + `min-height: 100svh` for full coverage.

### Image aspect calibration
Phone-menu PNG is 1408×2641 (aspect 0.533). `object-fit: cover` scales to fill, cropping the wider dimension. JS computes `scale = max(vw/imgW, vh/imgH)` and `offX/offY = (viewport - scaled) / 2`. Hit-zone `data-px` is in PNG-pixel coords so positioning auto-tracks on every device.

### Bridge occluder layer (West Seattle Bridge)
`bridgeFrontGfx` is a separate Graphics layer at depth 4 that re-paints the WSB guardrails **above** the port cranes (cranes render at `renderDepth: 2`). Do **not** consolidate this back into `roadGfx` — the cranes would visibly punch through the railings again.

---

## 10. Controls reference

### Keyboard
- Arrows / WASD: steer · UP boost · DOWN brake
- F: fire selected weapon · Q: cycle weapon
- R: cycle radio station · M: mute
- SPACE: pause/resume · ENTER: confirm/start
- Shift+L: toggle handedness
- 1-9: **DEV WARP — REMOVE BEFORE SHIP**

### Touch
- Steering modes:
  - **Tap (Flappy, default):** constant left pull; right input fights it; left input does nothing
  - **L/R buttons:** classic taps on left/right thirds of screen
  - **Tilt:** Capacitor accelerometer
- Bottom corners: BRAKE pedal (left) · ACCEL pedal (right) — both **toggle**, mutually exclusive
- Top-right: pause chip · mute · skip-track · note (cycle station) · wiper (rain only)
- Each weapon icon is its own tap-to-fire hit zone
- **Rotate phone vertical** → phone-as-menu pauses game

---

## 11. Quick-start for a new contributor

1. `cd DUI && npm install && npm run dev`
2. Open `http://localhost:3000/` (or `?debug` to see hit zones)
3. Read this file
4. Skim [GameScene.js](src/scenes/GameScene.js) (the monolith) — it's where 80% of edits land
5. Test the route by playing through OR using the DEV WARP digit keys (just remember to delete it before ship)
6. Latest session work is at the top of this file's **Major build-history** section.

**If something blew up:** check Vite cache first. Then re-read this file for traps. Then dig in.
