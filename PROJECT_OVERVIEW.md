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
- **Sex Worker** mechanic — currently a 1-in-10 "dirt on a politician" buff. Wants more outcomes, recurring NPCs, quest hooks.
- **Hitchhiker** mechanic — basic random good/bad outcome works (70/30 split, drug-bar-to-90% added). Wants more variety, story hooks.
- **Police 2.0** — smarter cop behavior beyond rear/oncoming/barricade. Possible: coordinated tactics, helicopter spotlight at night, line-of-sight star decay, escalating chase music.

### Tier 2 — Plan phases not yet done
- **Phase 2 — Mission system** (Job Done achievement is wired but waiting on missions).
- **Phase 5 — DJ chatter** (record MP3s; wiring is straightforward).
- **Phase 6 — Daily challenge + local leaderboard** (half-day's work each).

### Tier 3 — Bigger features
- Mission system full build-out
- Ghost replay (record best run positions, play translucent ghost)
- Online leaderboard (data shape supports it; ship local first)

### Tier 4 — Out of scope (still)
Photo mode, in-game settings menu, accessibility toggles.

---

## 8. Major build-history (newest first)

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
6. Latest session work is at the top of [OVERNIGHT_NOTES.md](OVERNIGHT_NOTES.md)

**If something blew up:** check Vite cache first. Then re-read this file for traps. Then dig in.
