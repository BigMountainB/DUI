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
npm run dev        # https://localhost:3000 + HTTPS LAN IP for phone tilt testing
npm run build      # → dist/ for deploys
```

**Tilt steering trap:** phone/browser motion APIs require a secure context on real devices. Use the HTTPS Vite URL, including on LAN (`https://<LAN-IP>:3000`). Chrome/Safari may expose the permission gate on either `DeviceOrientationEvent.requestPermission` **or** `DeviceMotionEvent.requestPermission`; support both.

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
- **DELETE THE TEST SPEED TRAP** — a guaranteed parked speed trap at ~mile 2.3 in [src/road/RouteData.js](src/road/RouteData.js), bracketed by `// ── TEST TRAP — REMOVE BEFORE RELEASE ──`. Added so the 0★ pull-over flow is testable seconds into a run; **delete before shipping** (the real traps are the 5–7 randomized city ones).

### Tier 1 — Active features the user has flagged
- **Murrow skyline sinks into Lake Washington (proper fix, diagnosed)** — on the Murrow floating bridge onto Mercer Island the distant skyline silhouette (which exists to COVER a charcoal "junk" backdrop band) gets overpainted by the per-segment lake-water fills drawn AFTER it in the same `roadGfx` layer, so it looks like it sinks into the lake. The `SKYLINE_SHORE_LIFT` band-aid was reverted (it exposed the junk). Proper fix is a DRAW-ORDER / layer change: render the silhouette ABOVE the per-segment water fills but BEHIND the cranes (e.g. its own depth between road and scenery sprites), keeping it LOW so it still covers the junk. Awaiting user go-ahead (delicate layering change).
- **Exit-32 / North Bend "feel" (needs user clarification)** — local user (lives off exit 32) said mile ~36 "didn't feel like my exit" and the pass felt too curvy. The curve-smoothing pass likely addressed the curviness; North Bend is correctly at mile 32 with an "Exit 32" sign. OPEN: confirm whether the exit SIGN appears at the wrong mile (real bug) or it just *felt* off (resolved by de-wiggle).
- **Build the Hatton, WA rest stop — DONE 2026-06-05.** Full rest stop at mile 205 (id `H`, WA-26, amenities camp+gas), filling the route's biggest gap. The data wiring (`_REST_STOP_DEF`, `_CP_RAW`, map waypoint at [GameScene.js](src/scenes/GameScene.js) ~L8118, Maps app in [index.html](index.html), terrain/frontage in [RouteData.js](src/road/RouteData.js)) was already present; the only missing piece was the **baked amenities placard** — `sign_H.png` (the per-stop brand-logo preview sign). Baked via the new single-stop mode of [scripts/buildShoppingSigns.js](scripts/buildShoppingSigns.js) (`node scripts/buildShoppingSigns.js H`), registered in [AssetManifest.js](src/systems/AssetManifest.js), and `STOPS_WITHOUT_BAKED_SIGN` is now empty. See §8 2026-06-05.
- **Phone-menu navigation buttons broken** — flagged during the 2026-05-29 session. The lock / trophies / L+R-hand-tap buttons in the portrait phone-menu work, but the music / garage / maps / start-over / checkpoint / main-menu buttons don't respond. Suspect a tap-handler binding issue specific to the modal-opening flow. Logic is in `index.html`; tested fixes in main.js audio/tilt didn't address it.
- **Large trucks in Eastern Washington traffic** — user wants visibly larger truck NPCs (semis, hauler trailers) populating Vantage → Pullman stretches. The existing NPC vehicle pool uses `npc_car_*` textures sized via texture aspect; the same path could pull from a `truck_*` texture set with a wider lane footprint, slower base speed, and longer body. Requires new art OR reusing the existing player-vehicle truck PNGs at NPC scale.
- **Finish cinematic — park in front of Pullman Party House — DONE 2026-06-05.** Crossing the mile-289 finish now starts a ~3s park cinematic (`FINISH_PARK_SEC`) instead of cutting straight to Game Over: input locks, the car eases to a stop (`targetSpeed = 0`) while drifting left to `FINISH_PARK_X = -1.35` toward the house (the landmark spawns on the LEFT, `sign=-1` in [RouteData.js](src/road/RouteData.js) ~L1522), then `_endGame(_finishCause)` opens the panel. Applies to **both on-time and late** finishes; the TOO-LATE+5★ technical loss (`busted_late`) stays instant. State: `_finishCinematic`/`_finishCineT`/`_finishCause`/`_finishCineEnded`. See §8 2026-06-05.
- **NPC headlights/tail lights in the rear-view mirror** — the night-lighting pass painted lights on the main world view but the mirror reflection (rendered separately via `_mirrorCarPool` in GameScene.js) doesn't carry them. Needs the same dot/beam logic applied to the mirror render path so a car catching up from behind shows its headlights in the mirror glass and same-direction traffic ahead shows tail lights.
- **Title-screen stoplight redesign (SPECCED, NOT BUILT)** — replace Easy/Normal/Hard buttons with 3 stacked stoplight buttons (same size as current difficulty buttons):
  - **Red — Thumbs: 2/1/0** (cycles, wraps). Subtitles: "Left and Right Thumb, basic" / "Just one thumb, like Flippy Burd" / "Look, Ma! No thumbs! (Tilt steering)". Maps to existing steering modes (classic L/R, flappy-tap, tilt).
  - **Yellow — Difficulty: Easy/Normal/Hard/Custom** (cycles, wraps). Reuse existing short-sentence blurbs inline.
  - **Green — Start.** Custom + Start opens existing custom-slider modal. FF button on title should also start the game.
  - Persist selections between sessions via registry.
- **Sex Worker / prostitute interaction expansion** — currently a 1-in-10 "dirt on a politician" buff. Add more outcomes, recurring NPCs, and quest hooks; investigate spawning visible sidewalk NPCs near towns/rest stops so the mechanic exists in the driving world rather than only in menus.
- **Hitchhiker expansion** — basic random good/bad outcome works (70/30 split, drug-bar-to-90% added). Add more variety and story hooks; investigate roadside/sidewalk hitchhiker sprites the player can see and choose to approach or pick up.
- **Police 2.0 / five-star behavior correction — BUILT 2026-06-03** (see §8). 1–3★ from cops witnessing reckless driving (speed traps + double-yellow/oncoming), 4–5★ only from weapons on cops (escalate + 3–5 mi grace), no passive DUI heat, killing a cop never reduces heat. The 0★ speed-trap *ticket* layer below is the next extension.
- **Speed-trap traffic stops (0★ police layer) — ALL 3 STAGES BUILT (Stage 1 2026-06-03; Stages 2-3 2026-06-05).** Extends the built Police 2.0. Makes "clean" (0★) speeding near towns a real risk: you get pulled over, ticketed, and DUI-checked. **3-stage build plan:** (1) trap placement + trigger + pursuit + 30s comply timer — **DONE**; (2) scripted pull-over auto-stop + traffic-stop UI + 30s ticket pause — **DONE**; (3) ticket math + lawyer + bust/suspension rules + stats hooks — **DONE** (see §8 2026-06-05). The spec below (lines on placement/trigger/ticket/bust/lawyer/stats) is the as-shipped behavior.
  - **Stage 1 as built:** trap placement is now `Math.random`-seeded **per play** ([RouteData.js](src/road/RouteData.js), replaced the old every-15-30-mi cop loop) — 3–5 random cities + permanent Issaquah/Colfax = 5–7 parked traps; the old ambient `cop_random_driving` cops were dropped. `COP_TRAP_SPEED_MPH` 70→80 ([constants.js](src/constants.js); also new `COP_TRAP_COMPLY_SEC`/`PULLOVER_MPH`/`SHOULDER_X`). Trap-witness block in [GameScene.js](src/scenes/GameScene.js) `update`: at 0★ → spawn pursuer + open 30s window (no star yet); comply = speed < 25 mph AND `player.x > 1.2` (right shoulder) → `cops.endTrapPursuit()`; timer expires → `cops.promoteTrapPursuit()` + `addStar(1,3)`. At ≥1★ → trap cop just joins pursuit (no civil offer). New `_trapPursuitActive`/`_trapComplyTimer` state reset on init, `_wipeWantedState`, and dev-warp. CopSystem helpers: `_spawnTrapPursuit`/`endTrapPursuit`/`promoteTrapPursuit`. **Stage-1 stubs:** comply currently just shows "Pulled over (traffic stop coming next build)" — no auto-stop cinematic, no ticket, no bust math, no live HUD countdown (all Stage 2-3).
  - **Placement:** **5–7 traps per playthrough** — parked cops in random spots of cities. **Issaquah and Colfax are permanent**; the rest are randomized each play from the **full city pool** (no minimum spacing — RNG can cluster them, that's fine since both are avoidable by braking).
  - **Trigger:** pass within ~200 ft of a trap doing **>80 mph** → cop gives chase (150 mph, may drop roadblocks to slow you). Under 80 mph → safe pass. A buddy text warns ~60% of the time (existing). You *can* outrun it with a fast car / a beater on cocaine, but roadblocks make pulling over the safer play.
  - **Comply window (at 0★): 30 s** to slow + pull to the right shoulder.
    - **Auto-stop assist:** once *committed* (pursuit active + speed below ~25 mph + in the right-shoulder zone) the car eases to a full stop and holds (reuse the planned Pullman finish-cinematic pattern). **Dry, non-bridge/non-tunnel segments only**; never push the car through a shoulder barrier (hard rule).
    - **Pull over in time → traffic stop**, with a **separate 30 s pause** to receive the ticket.
    - **Ignore for 30 s → +1★** (enters the 1–3★ wanted system). NOTE: this replaces the old *immediate* "+1★ on speeding past a trap"; the trap speed threshold also moves **70 → 80 mph**.
  - **Party clock keeps ticking** through both the 30 s comply window and the 30 s ticket pause (~60 s of real time cost if you comply).
  - **The ticket** (msg: *"30-second pause to receive a ticket for speeding… I hope you're not intoxicated. Bigger penalties for that."*):
    - **Under the limit → $400** speeding ticket.
    - **Over the limit → $1,500 "DUI" + earnings ×0.75 for the next 50 mi.**
    - **Limit:** `alcohol < 20%` AND **each** other drug `< 50%`. Exception: if **4+ drugs are active at once**, **every drug *including alcohol* must be `< 10%`**. (Money = persisted score, so the fine subtracts from score.)
  - **Bust conditions:**
    - **Can't afford the fine → busted.**
    - **2 DUIs (the $1,500 intoxicated stops) within 50 mi → busted** ("two DUIs = suspended license"). **Only intoxicated stops count** — sober $400 speeding tickets do NOT.
    - **Already ≥1★ (a warrant):** the trap cop simply **joins the pursuit — NO civil stop is offered**; if the player pulls over anyway → **busted**.
  - **Lawyer on retainer ($15k):** **speeding tickets dropped ($0)**; **DUI tickets halved ($750)** and the suspension threshold rises to **3 DUIs within 50 mi**. (Existing: lawyer also halves arrest fines.) Can't-afford bust can still fire on the $750 DUI if score < $750.
  - **Stats:** track tickets (count + $ paid) and DUIs for the Stats / Leaderboard apps.

### Tier 2 — Plan phases not yet done
- **Phase 2 — Mission system** (Job Done achievement is wired but waiting on missions).
- **Phase 5 — DJ chatter** (record MP3s; wiring is straightforward).
- **Phase 6 — Daily challenge** (half-day's work). *(Local leaderboard portion DONE 2026-06-05 — see §8 House Leaderboard.)*

### Tier 3 — Bigger features
- Mission system full build-out
- Ghost replay (record best run positions, play translucent ghost)
- **World leaderboard — stand up a server (the remaining leaderboard work).** Local cross-player House Leaderboard shipped 2026-06-05 (§8); what's left is the **online/global** layer: a backend to receive and serve run records, remote score submission on trip-end, and the "World Records" board fed from it (currently a placeholder footnote in the LEADERBOARD app). The record shape (`{score, miles, timeSec, completed, ts}` + plate) is already remote-ready, so the client change is mostly a submit call + a fetch-and-render; the real work is **server setup** (host, store, anti-cheat/validation, rate limiting, privacy of plate handles).
- **Smashable roadside objects** — lightweight collidable cones, cardboard boxes, trash cans, and construction barrels that swap to a broken/knocked-over sprite plus impact sound when struck. Reuse the existing scenery collision and sprite pools rather than adding physics/debris simulation. Consider pedestrians only as a separately designed, non-graphic consequence mechanic if it fits the game's tone.

### Tier 4 — Out of scope (still)
Photo mode, in-game settings menu, accessibility toggles.

---

## 8. Major build-history (newest first)

### 2026-06-05 (session 4) — weather pass (rain/fog/wipers), tumbleweed cross rework, heroin blackout, tunnel dim

On `steering-overhaul`; every change syntax-checked green (`node --check`), not full-built or pushed (held per user).

- **Heavier rain on the windshield** ([EffectsSystem.js](src/systems/EffectsSystem.js) rain branch). The persistent windshield-drop pool now obscures more: drop target ~244→~360 at storm peak, cap 260→380, spawn ~39→~60/s, body opacity 0.55→0.62 — so deep in the storm it's genuinely hard to see without wipers (still scales with `weatherInt`/severity so light rain stays light). Added a class of **big "runner" drops** — fat beads that race UP the glass trailing a tapering rivulet — on their **own spawn cadence** (a few/sec) so they appear independent of the drizzle.
- **Wipers ON now actually clears the glass** (same rain branch, keyed on `ctx.wiperActive`). The drizzle target/spawn are gutted while wiping (×0.12 / ×0.30) and each wiper sweep removes ~80% (was 45%) + shrinks survivors harder — so turning wipers on makes it *much* easier to see and keeps it clear. The big runners still spawn on their own cadence (×0.7 while wiping) so you keep seeing the occasional one streak through. (Wipe pulse only fires while wipers run, so wipers-OFF is untouched.)
- **Thicker fog (mile 14–25), thin-out at 25 unchanged** ([EffectsSystem.js](src/systems/EffectsSystem.js) fog branch + [Road.js](src/road/Road.js) distance fog). Screen-space horizon haze peak 0.60→0.80, milky veil 0.08→0.15, reach extended up the sky + down over the near road (UP 150→170, DN 240→300), mist wisps nudged up; Road distance fog pulled in a touch (exp 2.8→2.5, near-wash floor 0.12→0.20, kept gentle to avoid step-lines). Weather.js envelope untouched, so it still eases in 14–17, holds 17–22, lifts out 22–25.
- **Tumbleweeds finally cross the road, ~3 s, on a diagonal** ([GameScene.js](src/scenes/GameScene.js) `_renderTumbleweeds`). Root cause: weeds were world-anchored far out and rolled laterally on a fixed *time* basis, but the player closes ~10k Z in well under a second — so they were culled on the right shoulder before crossing. Reworked to a **~3-second life timer** (`crossSec` 2.7–3.5 s, `u`: 0→1) that drives BOTH the depth-approach (relZ spawn→car plane) and the lateral cross (right shoulder→left), so the cross always takes ~3 s at any speed and never gets cut short. Because the weed closes slower than the player advances, its world-Z rises with the car ⇒ it also drifts **downroad in the player's direction** (the diagonal), and it finishes/culls at the car plane so it never rolls behind. Texture cycle changed to **1→3→2** (reads as a smoother tumble). (Iterated from a distance-mapped first attempt that "flew by too fast".)
- **Heroin full-close blackout → fully opaque** ([EffectsSystem.js](src/systems/EffectsSystem.js) vignette block). At the peak of a full-close nod the center black fill was only 0.92, so high-contrast world objects (a passing tumbleweed) bled through during the "blackout". Now `min(1, closeAlpha*1.25)` ⇒ pure black across the top of the nod, still ramping in/out. (Note: heroin is a NOD cycle — full blackouts on the full-close nods, tunnel-vision between; not a constant blackout.)
- **Tunnel ambient dim — ~40%, quick fade** ([GameScene.js](src/scenes/GameScene.js) new `tunnelDimGfx` + `_renderFrame` ease). A dedicated full-screen black layer at depth **9.85** (above the tunnel shell 9.82 so it dims walls/ceiling/pavement, below the player car 9.95 + HUD/vignette 11+ so those stay lit) eases its alpha toward 0.40 when `road._cameraInTunnel`, 0 when not, over ~0.3 s — so entering/exiting a tunnel is a quick fade, not a lighting flip. Replaced an earlier masked 25% fill in `renderTunnelOverlay` (which snapped on/off with the mask). Applies to both road tunnels (Mt Baker ~mi 5, Mercer Island Lid mi 7). Knobs: `TUNNEL_DIM_MAX` / `FADE_SEC`.

### 2026-06-05 (session 3) — local House Leaderboard (cross-player, switchable metrics)

On `steering-overhaul`; syntax/parse-checked green (`node --check` on main.js, all 3 inline `<script>` blocks in index.html parse), not full-built or pushed (held per user).

- **House Leaderboard — the 3 player profiles ranked against each other on-device** ([main.js](src/main.js), [index.html](index.html)). The LEADERBOARD phone-app already showed the active player's Personal Bests + their top-10 Your Runs; the old **"World Records — coming soon"** stub at the bottom is replaced with a real cross-player board.
  - **Data:** new `window.__stats.house()` getter reads **all three save slots directly** (`save.data.slots`) **without switching the active slot**. One row per profile with `bestScore` / `fastestCompletionSec` / `mostMilesRun`, sourced from each slot's `global.stats.records` (StatsTracker keeps it current) with a defensive fallback to that slot's `leaderboard.runs`. Only created players (non-empty plate) plus the active slot are included; returns fresh plain objects so the menu can't mutate save state.
  - **UI:** three metric tabs — **Score / Time / Miles** — re-rank the board in place (tap handlers re-bind every render because `openApp` rebuilds `innerHTML`). Rows ranked `#1…#3` by license plate; the active player's row is highlighted (`lb-me`) and tagged `(you)`. Profiles with no data for the selected metric drop to the bottom dimmed with "—" (e.g. a player who's never *completed* a run shows "—" on Time but still ranks on Score). Personal Best + Your Runs sections unchanged; the global-coming-soon line stays as a footnote.
  - **CSS:** pill tabs (`.lb-tab`/`.lb-tab.on`) + active-row highlight (`.pa-row.lb-me`) in the existing blue `.pa-*` palette.
  - **Still local-only** — the *world/global* leaderboard (server + remote submit) remains on the pending list (Tier 3); the record shape was already designed remote-ready, so flipping the backend won't touch the save buckets.

### 2026-06-05 (session 2) — cop/ticket rebalance, speed-trap UI, finish-loop fix, scenery floats, Space Needle, tumbleweeds, music, icons

All on `steering-overhaul`; every change syntax-checked green (`node --check`), not yet full-built or pushed (held per user).

- **Wanted-level rebalance** ([CopSystem.js](src/systems/CopSystem.js)). (1) **City-line decay softened**: `clearStarsAtStateLine()` now `reduction = cur >= 4 ? 0 : 1` — crossing a town drops 1★ at 1-3★ and is FULLY IMMUNE at 4★ AND 5★ (was graduated 2/1/0). (2) **Cop-kill rule changed to +1★ PER cop killed** (two cruisers in one blast = +2★), capped at 5 — SUPERSEDES the old "weapon kill jumps to min 4★". The inline escalation is now reusable `escalateForCopKill(playerPos, kills)`. (3) **Weapon pulled during a 0★ parked speed-trap stop = flat 2★** (user-picked) via new `weaponPulledAtTrap()` — un-parks the trap pursuer to a live chaser and SETS stars to 2 (set, not add, so spikes "killing" the trooper-behind can't double-stack).
- **Traffic-stop fines → % of cash with $ caps; DUI bust → restart, not game-over** ([GameScene.js](src/scenes/GameScene.js) `_issueTrafficTicket`, [constants.js](src/constants.js)). Fine = fraction of current score capped at a ceiling: **speeding 50% up to $300** (`COP_TICKET_SPEEDING_FRAC`/`_CAP`), **DUI 100% up to $10,000** (`COP_TICKET_DUI_FRAC`/`_CAP`); lawyer waives speeding, halves DUI. (History: flat $400/$1500/$750 → briefly 10%/30% → now this.) The **"can't afford the fine" bust is REMOVED** (a % is always payable). The **suspended-license bust (2 DUIs / 50 mi) no longer ends the game** → `_bustBackToStart()`: shows the BUSTED screen 5 s then `scene.start('Game', { skipTitle: true })` = fresh rolling run at mile 0 (resets cash/HP/mileage; `_bustingToStart` flag freezes `update()` during the hold).
- **Speed-trap on-screen UI — below-mirror sign, no emojis** ([GameScene.js](src/scenes/GameScene.js) `_trapSign`). Comply window → alternating **SLOW DOWN** (red) / **PULL OVER** (blue) every 0.5 s; pulled over → **TRAFFIC STOP** + seconds remaining only. Replaced the old one-shot popups (trigger / "30s pause" / per-second banner) and stripped emojis from the remaining trap notifications (warrant / slipped / failed). The sign + flashing cop-light bands are cleared on pause-entry (`_togglePause`) so a stop pauses to a clean PAUSED screen instead of freezing the visuals on top.
- **End-of-route loop FIXED** ([GameScene.js](src/scenes/GameScene.js) `_updatePlayer`). Player position was `% (ROUTE_SEGS*SEG_LENGTH)` — modulo-wrapping past mile 293 looped the run back to mile 0 (car rolling, HP intact) whenever the mile-289 finish trigger was missed (e.g. a lag spike). Changed to `Math.min(routeEnd, …)` (clamp) so the finish fires instead of restarting.
- **Scenery float / poke-through (Issaquah/Preston cluster homes)** ([RouteData.js](src/road/RouteData.js), [GameScene.js](src/scenes/GameScene.js)). Mile 13.25-25 suburban cluster now draws from `CODEX_ISSAQUAH_BUILDINGS` (right-sized eastside art + float-tuned per-texture `groundDrop`) instead of the oversized `WEST_SEATTLE_HOMES`. Added `codex_issaquah_*` to the `usesFarPerspective` set so they shrink/reposition past `DRAW_DIST` instead of pinning to the horizon (the swap had dropped them out of it → they floated worse). Added a **crest cull for structures**: `if (isStructure && proj.visible === false) continue;` — `allowClipped` is kept (so far/curve rows don't blink) but crest-hidden buildings no longer render THROUGH hills. (Diagnosis credit: user.)
- **Horizon haze band removed** ([Road.js](src/road/Road.js) ~L900). The 14px `palette.horizon` @0.82 strip just above the horizon was redundant (the sky gradient already paints down to `H()+14`) and cut a hard "shelf" seam across distant homes/trees in West Seattle and Vantage. Deleted; clean sky→ground horizon remains.
- **Parked speed-trap cop sprite** ([GameScene.js](src/scenes/GameScene.js), scoped to `cop_random_parked`). Now faces the road (`flipX` on both shoulders) and is **1.7× bigger** (`sizeMult` 1.4→2.38, max-size cap 0.18→0.306 of screen). Ambient/driving cops unaffected.
- **Space Needle** ([RouteData.js](src/road/RouteData.js), [GameScene.js](src/scenes/GameScene.js) profile). Offset `-3.0 → -1.5` AND profile `minOffset 4.80 → 1.5` (the 4.80 floor was clamping it to -4.80, so the offset change alone did nothing); bigger (`heightMult` 6→9, caps scaled). Still at mile 1.85.
- **Tumbleweeds** ([GameScene.js](src/scenes/GameScene.js) `_renderTumbleweeds`). (1) **Freeze/crash fix**: the pool held `this.add.image()` objects destroyed by the `scene.start('Game')` rest-stop restart but the array survived on the reused instance → `setTexture` on a dead Image threw "reading 'sys' of undefined" and froze the game on the first Vantage frame after a rest stop. Now nulled in create() so it rebuilds. (2) Weeds now roll **in front of** the car — killZ moved to the player-car Z plane (`PLAYER_VIRTUAL_Z − eyeForwardZ`) instead of the camera eye, so chase-cam weeds don't roll past/behind the car.
- **710 Oil rest-stop top-up: +15 → +2 HP** ([RestStopScene.js](src/scenes/RestStopScene.js)). The menu said "+10" but the code added 15; now a consistent +2 everywhere.
- **Music: genre playlists advance to the next genre** ([AudioSystem.js](src/systems/AudioSystem.js) `_onTrackEnded` / new `_advanceToNextGenre`). Each genre plays through all its tracks (no repeats) then rolls to the next station (wraps after the last). Manual station/track controls + the custom cross-genre playlist are unchanged.
- **Dead-code / asset cleanup.** Deleted stray `src/scenes/GameScene 2.js` + `GameScene 3.js` (unreferenced backup copies). Removed dead `ui_title_d/u/i` manifest entries ([AssetManifest.js](src/systems/AssetManifest.js)) that pointed at deleted files (caused "Failed to process file" + WebGL errors). **Icons slimmed to 512 + 32**: dropped the 16px favicon and the 192px manifest icon ([index.html](index.html) + [manifest.webmanifest](public/manifest.webmanifest)), deleted `favicon-16.png` + `icon-192.png`. Added a compressed **alternative logo** set from the stray 1024 source (now deleted): `public/icons/icon-512-alt.png` (490 KB) + `favicon-32-alt.png` — standalone, not yet wired in.

### 2026-06-05 — PHONK radio station, plate-modal width fix, reset-player music fix, speed-trap Stage 2-3 (ticket/DUI/bust), Hatton sign

- **Text fields vs. game keyboard (plate name "missing letters" fix).** Typing a plate handle dropped any letter that's also a hotkey — W/A/S/D/F/M/R/Q (Phaser `addKeys`/`addKey` capture → `preventDefault`), and digits/Shift+L etc. fired their on('keydown') game handlers mid-type. Fix in [main.js](src/main.js): global `focusin`/`focusout` on INPUT/TEXTAREA/contenteditable **suspends Phaser's keyboard** (`clearCaptures()` + `keyboard.enabled=false`) while a field is focused and restores it (`addCaptures()` + enabled) on blur — so every key reaches the field and no game action fires while typing. Covers the plate modal, code entry, and any future text input.
- **License-plate art — save slots + car rear.** 3 US state plates (WA/OR/ID) shipped at 480×218 (source 827×374 RGBA, originals in `Archive/runtime-image-originals/.../plates/`) at `public/assets/ui/plates/plate_{wa,or,id}.png`, manifest keys `plate_wa/or/id`. Slot 0/1/2 → WA/OR/ID (`PLATE_KEYS` in [GameScene.js](src/scenes/GameScene.js)). Title-screen "WHO'S DRIVING?" slots show the state plate art at the art's **true aspect (≈2.21:1)** — slots resized **137×62** (taller than the old 158×44 buttons, GAP 6) so 3 stack unstretched; the stack is **vertically centered between the top music/FF dock (~56) and the START/difficulty panel (350)** → Y0 = 104 (computed), shifted up from 150. **Every slot always shows its fixed plate** (used → handle in the number band, unused → "NEW"), gold-glow border on the active player. Handle text (title slots + car rear) has a **white contrasting stroke** (thickness 3) so it reads over busy plate art. (Iterated: first cut was aspect-fit-centred, then full-width-stretched per "as big as the buttons", then user asked for true aspect → taller slots.) Car rear: `_rearPlateImg` (the active slot's plate) sized to the painted plate area (`a.w` of car width, aspect-correct) behind the handle text (now fit to ~72% width = the number band; cream text background removed). Both registered on the world camera. Text-band offsets are first-pass — may need visual tuning.
- **Crush (the Girl) redesigned — relationship, not a cash faucet.** Old model: reply once + text every ~12 mi for +$1000 each (free money, no downside). New model (per user): texting is **free + once per town** (a town == a CHECKPOINT window); text her each town to keep her **warm**, skip a town and she cools to **"…"**, skip more than `GIRL_MAX_SKIPS` (4) towns **total** across the run and she **finds someone else** (gone for the run). Reward is **no per-text cash** — instead a **party payoff** (`GIRL_PARTY_BONUS = 15000`) at the Pullman finish if you arrive still together (not gone, texted ≥ once). Logic centralized on GameScene (`_girlStatus` / `_girlText` / `_girlOnNewTown`, hooked in the checkpoint loop + finish block; `_girlTextPending` per-run flag); `window.__girl` is now a thin pass-through (old `respond()` + cash constants removed). Save keys (`girlResponded` / `girlTexts` / `girlSkips` / `girlGone`) reset on a **fresh** run only (`!_resumeFromStop && _resumeFromPosition == null`, i.e. New / Start Over / Retry — NOT a checkpoint/rest-stop resume, which continues the same trip). **2026-06-05 refine:** the crush is now **gender-neutral** ("The Crush", they/them — all player-facing text; internal `_girl*`/`girl*` names kept for back-compat). Added an incoming **message thread** (`_girlThread`, shown in the Messages app + road notifications): skip 1 → annoyed text, skip 2 → angry text, skip 3-4 → silent "…" bubbles, skip 5 → gone; and a **3-town texting streak** (`_girlStreak`) earns a miss-you reply ("people keep asking me to go to their party instead"). Buddy threads (`_buddyThreads`: friend/ex/mom/boss/unknown/spam) already reset every `init()`, and traps re-randomize per game (`new Road()` → `buildRoute()` → unseeded `Math.random`), so **the Friend already repopulates with this run's new cop/trap locations** — verified, no change needed there. **2026-06-05 follow-up:** per user, the **Lawyer retainer** (`lawyerRetained`) and **Dealer orders** (`dealerOrders`) now reset on the same fresh-run guard too (re-hire the $15k lawyer / unfilled orders don't carry over — fits the per-run economy). Both are per-slot save keys with no stale cache (`RestStopScene` re-seeds `_dealerOrders` from the save in its own `create()`).
- **METAL genre added (10th station) + two singles.** 6 Metal tracks (`Archive/Music/Metal/`) compressed to the house spec (96 kbps CBR / 44.1 kHz / stereo, album art stripped) into `public/assets/music/metal/`, originals archived under `Archive/runtime-audio-originals/.../metal/`. Wired `METAL` into `STATION_TRACKS` + **appended** a METAL station to `STATIONS` (index 9, color `#9FB2C4`, 150 bpm, silent procedural fallback) — appended last so PHONK stays index 0 (default) and no other indices shift. Also added two singles (same compression): **Party Run** → `phonk/party_run.mp3` (PHONK now 8 tracks), **Siren's Call** → `classic_rock/sirens_call.mp3` (CLASSIC ROCK now 8). Note: the Metal folder's own `Siren's Call.mp3` is a *different* song from the Classic-Rock `Siren's Call (Classic).mp3` — both shipped to their respective genre folders. Genre grid is data-driven, so METAL appears automatically. The radio is now the "10-station" set the overview references.
- **Floating-houses — PER-SPRITE CREST CLIP (the real fix, 2026-06-05 session 4).** Replaces every prior screen-space-band attempt. Instead of painting terrain *over* the sprites (which always cut a horizontal band), each structure sprite now **clips its own bottom to the hill silhouette in front of it** — the part behind the crest is simply not drawn, so a house beyond a crest reads as poking over the hill instead of floating. Three pieces, all keyed off the existing surface-sample cache:
  - **[Road.js](src/road/Road.js)** — new `_crestMinY` Float32Array (constructor) + a per-frame **prefix-min of terrain silhouette screen-Y**: `crestMin[n]` = highest painted ground (min `screenY`) among VISIBLE, **flat-or-climbing** samples strictly nearer than boundary `n`. Built right after the `_surfaceSamples` visibility pass.
  - **Grade guard reused:** only segments with `gradePct > CREST_MIN_GRADE (-0.004)` contribute to the silhouette — a steep **descent** (West Seattle hilltop) gets a downhill pitch-boost that projects nearer road *above* far road (a looking-down artifact, not a hill), and letting it in would slice the bases of houses down the slope (the old reverted bottom-crop failure). Descents never occlude.
  - **`crestClipY(relativeZ)`** returns that silhouette Y for any depth (O(1) lookup).
  - **[GameScene.js](src/scenes/GameScene.js) `_renderSceneSprites`** — for each structure (skipping authored far-perspective art: cranes / Space Needle / city skyline), if `crestClipY(relZ) < proj.sy − 6` (a nearer crest clearly above the true ground line), crop the texture to keep only the TOP via `setCrop(0,0,baseW,visibleTexH)`; with the bottom-centre origin (0.5,1) the visible bottom edge lands exactly on the crest line (the sink-crop "flies up" behaviour, used here on purpose → no compensating shift). Whole-sprite-behind-crest → `setVisible(false)`. The existing `proj.visible===false` full-cull (fully-hidden bases) is untouched; this only fixes the visible-but-floating remainder.
  - **Why this is allowed despite the old "do NOT use visible-based hill occlusion" rule:** that rule was about *band/painting* approaches and naive crops that sliced flat-ground bases. This clips per-sprite against a real, grade-guarded silhouette and only when the crest is genuinely above the ground line, so flat/climbing terrain never triggers it. Awaiting in-game verify across West Seattle / Preston (~mi23.5) / Vantage (~mi132).
- **Floating-houses foreground-occluder attempt — TRIED & REVERTED 2026-06-05 (superseded by the per-sprite clip above).** Replayed the near-crest segment geometry (road+sidewalks+terrain) into `crestFrontGfx` at depth 7.8 (below cars) to occlude distant houses behind crests. In practice it **masked the houses' lower halves → "roofs floating"** (a band at the crest's screen-Y can't read as a hill in front of the whole sprite). Root cause found later: `_drawSegment` paints a full-width grass rect with a **60px minimum** (`grassH = Math.max(60, segH)`), so replaying any far crest segment stamped a 60px full-width band over the houses. Fully reverted (and the whole green-rect crest-occluder system was removed). Lesson that stuck: **do NOT solve this with a screen-space band** — clip per-sprite instead (done above). (Depth IS distance-based: `9.5 − relZ/76000·2.5`.)
- **Phantom green horizon band fixed (crest occluder grade guard).** The dark/green band cutting across distant houses at **West Seattle (mile ~0.18)** and **Vantage (~135)** was the **crest occluder layer** (`crestFrontGfx`, depth **9.65** — the one layer ABOVE scenery sprites, so it genuinely paints over houses), not the ground/house art. `renderCrestOccluder()` paints a full-width opaque grass rect ([Road.js](src/road/Road.js) ~L4293) for each entry in `_crestBands`. Those bands were emitted purely from screen-space culling ([Road.js](src/road/Road.js) ~L1313); on a steep **descent** (West Seattle hilltop 350→290 ft over mile 0-0.6; the Ryegrass→Vantage drop) perspective trips the cull and emits a phantom band. Fix: added a **grade guard** — only emit a crest band when the crest segment is flat-or-climbing (`curr.seg.gradePct > CREST_MIN_GRADE = -0.004`); descents never emit. Real over-crests (Snoqualmie summit, Palouse rollers) still occlude correctly. (Diagnosis credit: user.) A first attempt that faded the distant ground into the horizon was reverted — wrong layer.
- **Semi-truck collisions — heavy + immovable.** In `_onVehicleCollision` ([GameScene.js](src/scenes/GameScene.js)): semis (`vClass === 'semi'`) deal **1.5× damage** (`classDmgMul`, alongside tractor's 2×). On a **corner clip or sideswipe** the semi is now **immovable** — it is NOT destroyed/shoved off-road; instead the player bounces away (larger `xImpulse` away from the rig) and is scrubbed down to **60 mph** (`SEMI_BOUNCE_SPEED = MAX_SPEED * 0.5`). Rear-ends into a semi keep the existing big-crash behavior (semi destroyed) but now at 1.5× damage — flag if you want rear-ends to be immovable too.
- **Finish cinematic.** Mile-289 finish parks the car in front of the Pullman Party House (~3s, input locked, eases to a stop while drifting left toward the house) before Game Over — on-time and late finishes both; `busted_late` technical loss stays instant. Constants `FINISH_PARK_SEC`/`FINISH_PARK_X`/`FINISH_PARK_LERP` in [constants.js](src/constants.js); logic in [GameScene.js](src/scenes/GameScene.js) (`_finishCinematic` state, speed/steer override in `_updatePlayer`, timer→`_endGame` in `update`).
- **Per-car phone-menu skins.** The portrait iPhone-menu now swaps its background art to match the selected vehicle. 8 skins (one per car) live at `public/assets/ui/iphone_menu_bg_<carId>.png` (sources in `Archive/Images/iphone menu/`, all **853×1844** — same icon/dock layout, different art, so the pixel-mapped hit-zones stay aligned per the §516 rule). [index.html](index.html): `setPhoneMenuBg(id)` swaps the `<img class="bg">` src (fallback to the shared `iphone_menu_bg.png` for any car missing a skin) and re-runs `layoutHitZones` on load; `syncMenuBg()` reads the current vehicle from `window.__garage.list()`. Hooked on garage **select** (instant re-skin), garage **open**, an initial best-effort sync, and **every in-scene vehicle swap** via `_applyVehicleSwap` → `window.__syncMenuBg()` (covers **custom-mode** car picks + mid-run unlocks). `syncMenuBg` resolves the driven car from `window.__garage.current()` (reads `registry.vehicleId` directly) so custom sandbox cars — which aren't in the OWNED list — resolve correctly (the first cut derived the car from the owned list and always fell back to the beater in custom mode). Loaded via the HTML `<img>` directly — no AssetManifest entries needed (those skins aren't Phaser textures). **To add/replace a car's skin:** drop an 853×1844 PNG at that path; if a NEW car id is added, that's the only filename to match.
- **Hatton rest stop finished.** Everything but the amenities placard was already wired (the §7 item was stale). The bake script [scripts/buildShoppingSigns.js](scripts/buildShoppingSigns.js) had its own inline REST_STOPS copy that **omitted Hatton**, so `sign_H.png` was never generated and Hatton sat in `STOPS_WITHOUT_BAKED_SIGN` (blank placard). Fixes: added Hatton to the inline list; repointed the script's source dir from `Images/` (moved) to **`Archive/Images/`**; added an optional **single-stop CLI arg** (`node scripts/buildShoppingSigns.js H`) so adding one stop doesn't regenerate the other 18; baked `public/assets/businesses/sign_H.png` (AOK camp + Huff's gas); registered `sign_H` in [AssetManifest.js](src/systems/AssetManifest.js); emptied `STOPS_WITHOUT_BAKED_SIGN`. Build green; sign present in `public/` + `dist/`.

- **PHONK radio station added + made default.** 7 source tracks from `Archive/Music/Phonk/` compressed to the house spec (96 kbps CBR / 44.1 kHz / stereo, album-art stripped) into `public/assets/music/phonk/`; full-quality renamed originals archived under `Archive/runtime-audio-originals/.../phonk/`. Wired `PHONK` into `STATION_TRACKS` + inserted it as **STATIONS index 0** in [AudioSystem.js](src/systems/AudioSystem.js) (color `#E11D48`, 145 bpm, silent procedural fallback like ARCADE). Index 0 is the default everywhere (`settings.radio` default, constructor `currentStation`, GameScene start-gate, ★ display), so PHONK is the default genre with no other changes; all other stations shifted +1. Realizes the §soundtrack "future PHONK station" note.
- **Plate-name modal width fix** ([index.html](index.html)) — the box was capped in px (`640px`) while its contents were `vmin`, so on large screens the text + CANCEL/DONE buttons scaled past the box and clipped. Box now `min(94vw,92vmin)` — scales with its contents at any size.
- **Reset-player no longer kills the music** ([main.js](src/main.js) `__settings.resetProgress`) — was a hard `location.reload()` (tears down the AudioContext → autoplay-blocked → silent). Now a soft `scene.start('Game', {})` (same path as `__mainMenu`) + `stats.reload()` + reset registry `vehicleId`; the AudioSystem lives on the registry and survives a scene restart so the radio keeps playing. SaveSystem slot getters mean Wallet/plate/leaderboard re-read the wiped slot for free.
- **Speed-trap Stages 2 & 3 — Stage 2 was already built; Stage 3 (the consequences) shipped today.** The held traffic stop previously just said "Ticket issued. Drive safe." with no effect. Now [GameScene.js](src/scenes/GameScene.js) `_assessTrafficStop()` snapshots the offense from the drug bars **at the moment of pulling over**, and `_issueTrafficTicket()` (at hold-end) applies it per the §7 spec: sober = $400 speeding ticket; intoxicated = $1,500 DUI + earnings ×0.75 for 50 mi (via `_scoreMult()` debuff). Limit = alcohol <20% AND each other drug <50%, or (4+ drugs active) every drug <10%. **Lawyer on retainer:** speeding → $0, DUI → $750, suspension threshold 2→3. **Busts → GameOver('busted'):** can't-afford-the-fine, or repeat-DUI (rolling 50-mi window, sober tickets don't count). New constants in [constants.js](src/constants.js) (`COP_TICKET_*`, `COP_DUI_*`); new `police` stat bucket + `recordTrafficStop()` in [StatsTracker.js](src/systems/StatsTracker.js) (auto-fills existing saves via deepFill) surfaced in the Stats app Lifetime section. Note: at ≥1★ no civil stop is offered (trap cop just joins pursuit), so the spec's "pull over with a warrant → busted" sub-case is moot by design. Build green.

### 2026-06-03 (continuation) — Career stats + leaderboard, Police 2.0 (built), Park & Ride + dealer/lawyer, settings suite, plus float / ramp / plate-picker fixes

All on `steering-overhaul`, build green, **not pushed** (held per user). This supersedes several §7 items that were actually built below (Police 2.0, phone-menu buttons, settings/leaderboard).

**Career stats system** ([src/systems/StatsTracker.js](src/systems/StatsTracker.js), registry `'stats'`)
- Canonical schema in the **global** save bucket (survives Start Over): lifetime npcHits / damage / miles / drive-time / trips / wrecks / gross-earned / total-spent / drugs+weapons collected; `earned.bySource` + `fromMultiplier`; `spent` by category & per-drug/weapon; `perVehicle`; `restStops`; `records` (best score, fastest trip, most miles, longest no-damage, top speed); encounter tallies (`hitchhikers{good,bad}`, `sexWorkers{total,bribes}`, `robberies{count,amount}`); `totalGameplaySec`.
- Hot-path methods mutate in memory; `flush()` persists at checkpoints (never per frame). Hooks wired across GameScene + RestStopScene.
- **Custom/sandbox** (`tripStart({ranked:false})`) accrues ONLY `totalGameplaySec`; everything else no-ops.
- **Money = persisted `GameScene.score`** via checkpoint snapshots; the `Wallet`/`profile.money` class is **vestigial** — don't "fix" it thinking earnings are broken.

**Phone-menu redesign** ([index.html](index.html), [src/main.js](src/main.js) bridges)
- New bg art `public/assets/ui/iphone_menu_bg.png` (853×1844); all hotspots `data-px`-calibrated. Steering-type selection **removed** from the menu.
- Apps: **Leaderboard** (personal best from `stats.records` + world-record placeholder), **Stats** (sectioned This-Trip / Lifetime / Records / by-source / spending / per-vehicle / rest-stops), **Settings** (volume, mute, units MPH↔KM/H, screen-shake, HUD toggle, haptics, **colorblind**, **Reset Progress** — wipes money/cars/checkpoints but KEEPS lifetime stats/leaderboard/trophies), **Get Help / Addiction** (real resources + donate, played straight — verify helpline numbers before ship), **Music** (neon restyle, default-station ★, working pause/play), **Messages = Contacts** (Lawyer / Dealer).
- Top weather widget: location name + simulated temp + weather symbol + game clock (corner). Unified ✕ close circle on every modal.
- Bridges added: `window.__stats`, `__settings`, `__location`, `__lawyer`, `__dealer`.

**Phone contacts** — **The Lawyer**: phone CALL, $15k retainer halves all future "busted" fines. **The Dealer**: order a drug (pay now from score), pick it up **FREE** at a Park & Ride.

**Park & Ride** ([src/scenes/RestStopScene.js](src/scenes/RestStopScene.js)) — new location at 6 spread stops (Mercer Is, North Bend, Ellensburg, Othello, Colfax, Pullman), NOT every stop; the Dealer meets you here (prepaid pickup). Brand `Metro Park & Ride` (logo key `biz_parkride` — needs art, blue fallback for now).

**Police 2.0 — BUILT** ([src/systems/CopSystem.js](src/systems/CopSystem.js), GameScene). Replaces the §7 "Police 2.0 / five-star" pending item.
- No passive DUI heat (an impairment-heat attempt was built then reverted per user).
- **1–3★ = a cop WITNESSING reckless driving**: roadside speed traps trigger +1★ when passed speeding (`> COP_TRAP_SPEED_MPH` = 70) or over the double-yellow/oncoming; brake under 70 & stay in lane → spared. Buddy texts a ~60% advance warning. All driving/collision star sources capped at 3★.
- **4–5★ = weapons on cops ONLY**: any cop kill escalates to 4–5★ (donuts/paint = neutral distraction) and grants a **3–5 mi pursuit grace** to reach a rest stop for disguise/paint/Park-&-Ride. Killing a cop never reduces heat. Cops already do 145 mph + slow-to-ram.

**Playtest fixes** — pause disabled on the title/ready screen; exit + amenities signs now collide for 10 dmg (dedicated hit-test mirroring the sign renderer); **snow windshield = real flake accumulation to whiteout, NEVER a flat white fill** (corrected twice); rain+snow fill full screen; road rain→snow transition gradual (~6 mi); NPC collision now fires when the debug boxes touch (player hit-test uses the sprite trapezoid).

**Float / ramp / picker fixes (latest)**
- **Homes no longer float (#2)** — measured per-PNG bottom-alpha padding (new `scripts/measure_grounddrop.mjs`, sharp) and set real `groundDrop` for every eastern/Issaquah home: weathered_house 0.179, barn 0.174, cle_elum 0.118, ellensburg 0.104, doublewides ~0.04, issaquah/fenced ~0.03. Full-bleed PNGs correctly stay at 0.010. Finishes the per-texture job previously done only for West Seattle homes. Render + collision share `groundDrop` so the hitbox base moves with the art.
- **Exit ramps Y off the mainline** ([Road.js](src/road/Road.js)) — the gore gap now grows with `rampStrength` (was frozen at full → detached "dead-end" strip). Width stays full/drivable (honors the 2026-05-30 "no taper" call). AND the ramp pavement only opens over the **last ~0.5 mi** ([RouteData.js](src/road/RouteData.js) `RAMP_TAIL_SEG`) so it peels off near the exit, not behind the mile-out green sign. After-exit merge untouched.
- **Mercer exit "too big"** — confirmed ramp params (1.25w width / 2.05w gore) are GLOBAL; nothing Mercer-specific. The Y-fix + late-open should shrink the apparent slab; awaiting playtest before any per-stop override.
- **License-plate picker lockup FIXED** ([src/main.js](src/main.js) `_blockGameTouch`, [index.html](index.html) `#plate-modal`) — root cause: native touch was `preventDefault`'d everywhere except `#phone-menu`, so on a touch device the plate input never focused (no keyboard → "can't type") and DONE was swallowed → looked frozen. Exempted `#plate-modal`, **added a CANCEL button**, bumped modal to z-index 10000.

**Soundtrack (creative, text-only)** — two original Phonk lyric sets for a future in-game PHONK station: **"I-90 DEMON"** (drift phonk, collecting the drug sprites across WA) and **"SMOKE & SPARKS"** (trap-metal phonk, the car falling apart stage-by-stage). Drop files in `public/assets/music/phonk/` then wire the station.

**Deploy state** — repo on `steering-overhaul` (not main); has `netlify.toml`, **no Cloudflare config**. Pushing triggers whatever's wired to the GitHub repo. Held pending user go-ahead + branch/platform confirmation.

### 2026-06-01→03 — Steering-overhaul branch: crosswind + tumbleweeds, phone-app pass (map / contacts / leaderboard / music), license-plate handle

Big multi-day session. Started with a **building-placement / floating cleanup** on `main`, committed a checkpoint (`d9a771f`) and **pushed → Cloudflare**, then branched **`steering-overhaul`** for everything after. All work below the checkpoint is on that branch and **NOT yet merged to main**.

**Building placement & floating cleanup** (on `main`, pre-branch)
- **Eastern WA home setback → 2.25** ([RouteData.js](src/road/RouteData.js) ~1517, `gapCars = isBusiness ? 1.18 : 2.25`) — fixes Royal City / Hatton homes *floating* at far perspective (the artifact was a near-edge-on-fog-line read, not a vertical lift). See memory `project_dui_eastern_home_setback_floating`.
- **West Seattle groundDrop right-sized per-texture** ([GameScene.js](src/scenes/GameScene.js)) — per-PNG `groundDrop` (0.102/0.086/0.010/0.010/0.086/0.096) so each home sits on its visible base, plus collision band `_bandBaseY = proj.sy + targetH*groundDrop` reaches the painted base, and homes set **≥0.5 car-widths behind the sidewalk line** (user's exact spec).
- **FOG_PROFILE_MULTS corrected** ([RouteData.js](src/road/RouteData.js)) — silos 3.20, freeway_sign_wind 4.20, doublewides 8.55.
- **Issaquah** — tree density boost in the mi14–25 corridor (200 vs 22 + bigBoost) and **anti-overlap spacing** for corridor homes/stores (`_lastCorridorStoreSeg`/`_lastCorridorHomeSeg`/`CORRIDOR_MIN_GAP_SEGS` ~0.15mi; `homeSlotsPerMile` 40→22) — fixes "Issaquah home inside a West Seattle home." User framed it simply as "space them out."
- **Shoulder-ribbon white-triangle fix** ([Road.js](src/road/Road.js) `_drawShoulderRibbons`) — rewritten to emit one filled polygon per contiguous-visible run, killing the white triangle slivers on hill crests / curves.
- **Removed dead procedural-homes branch** in RouteData (moot code).
- **Hill-crest floating — UNRESOLVED, all attempts REVERTED.** Preston (~mi23.5) and Vantage (~mi132) homes float above the crest. Tried cull-on-occlusion (whole house vanished), screen-bottom clamp (slammed down), bottom-crop (sliced WS building bases) — **every attempt reverted to baseline.** Established with the user that this is a **draw-order / architecture limitation**: ground renders at depth 0, scenery sprites at depth 7–9.5, so a sprite can't be occluded by the hill in front of it ("if a car drove in front of the house, would I see the house through the car?"). **Rule: do NOT use `visible`-based hill occlusion for sprites.** Left at baseline float pending a real layered fix.

**Steering overhaul** (branch `steering-overhaul`) ([GameScene.js](src/scenes/GameScene.js))
- **Default = classic L/R** (`_activeSteeringMode()` returns `'classic'`). Title-screen mode picker deferred (see the stoplight redesign in Pending).
- **Vantage crosswind** — `_windStrength(mile)` envelope (ramp-up mile 131, full by 137, holds ~40 mi). In `_updatePhysics` a leftward `_windPull` is applied **only when the player is not actively steering right** (`effectiveSteerDir <= 0.01`), so per the user **the right arrow completely overtakes the wind** — it is NOT a mode switch, just a lateral bias.
- **Tumbleweeds** (`_renderTumbleweeds`) — world-anchored, roll across the road **slow→fast** (sqrt cadence: ~1-every-5–7 s at onset → 1.5–3 s at full wind), round-robin through all 3 art frames (Tumbleweed1/2/3) to break monotony, **no spawns on bridges**, **0.25 damage** on hit.
- **Tree sway** (`_treeSwayRot`) applied at sprite finalize to tree sprites only.
- **Wind freeway sign moved to mile 132** ([RouteData.js](src/road/RouteData.js)).
- *(Deferred: snow → tilt / mouse-follow steering + device-detect + iPad permission prompt.)*

**Dev server HTTP/HTTPS split**
- [package.json](package.json): `dev` now `DUI_HTTP=1 vite --port 3000 --strictPort` (HTTP, default); `dev:https` → port 3001 (keeps `@vitejs/plugin-basic-ssl` for tilt testing).
- `~/Desktop/DUI Dev.command` rewritten to **prompt which server** (1 HTTP / 2 HTTPS / 3 Both) with LAN-IP detection; the `.app` delegates to it. (HTTPS is only needed for device-tilt, which requires a secure context.)

**Phone-menu app pass** ([index.html](index.html))
- **Map** — mileage label next to the player marker; **red-N compass needle** (replaced the old arrow); **NEXT REST STOP** panel on the right edge showing that stop's **business logos** stacked vertically under an underlined title, pulled from `public/assets/businesses/*.png` via a `BIZ_LOGO()` map (gas→cargo/huffs, hunting→cowbellas, camp→aok, dealer→lord/suck, drugs→pharmabros). `window.__restStops` bridge added in [main.js](src/main.js).
- **Contacts redesign (list → detail)** — replaced the flat Messages list. Rows: **The Girl**, **The Lawyer**, **The Plug**. The Lawyer is a **phone CALL** (📞), not a text thread (fixed from the earlier mistake of putting him in Messages). Dealer renamed **"The Plug."** **The Girl** invited you to the party: you must **reply** to her, and **texting her along the way pays a bonus** (`window.__girl` bridge — `GIRL_TEXT_BONUS`/`GIRL_REPLY_BONUS` 1000 each, every ~12 mi; persists `girlResponded`/`girlTexts`/`girlLastTextMile`).
- **Leaderboard** — added a **"Your Runs"** ranked section + **"#N of M"** on Best Score. Backed by **run-recording**: `StatsTracker.recordRun({score,miles,timeSec,completed})` now fires from `tripComplete` (completed) and `tripEnd` (bust), pushing into the `leaderboard:{runs:[]}` save (sorted by score, capped 50, gated by `ranked`). NOTE: this key was previously an **unused stub** — local rank works going forward; pre-existing saves start empty.
- **Music scrubber** — `#phone-music-now` time/progress bar with a draggable knob (`AudioSystem.trackProgress()` / `seekTrackFrac()` over the HTMLAudio element's `currentTime`/`duration`; `pmnTick` @250 ms; pointer-drag → `window.__music.seek(frac)`).

**License-plate name entry** ([index.html](index.html) `#plate-modal`, [main.js](src/main.js) `window.__plate`, [GameScene.js](src/scenes/GameScene.js) `_startGameplay`)
- On the **first-ever run**, just after START, a license-plate-styled popup asks the player for a plate — this is their **handle for the future global leaderboard**. Sanitized to uppercase `[A-Z0-9 ]`, max 8 chars, saved to save key `licensePlate`. `window.__plate` = `get`/`needsEntry`/`set`; the modal (`window.showPlateModal()`) shows once when `needsEntry()` is true. Enter or DONE submits; empty re-focuses.

**Discussed / deferred (not built)**
- **Global leaderboard** — plan is **Cloudflare Pages Functions** (serverless API in `/functions`) + **D1** (SQLite); user's part is ~3–4 setup commands. Deferred. License plate is the username groundwork.
- **"President Grump"** — agreed next game after DUI ships (rogue-assassin satire; fictional named character, legally fine). Saved to memory; remind when DUI is done.

### 2026-05-31 — App icon / PWA manifest + mountain treeline removal + drug-icon fixes

**PWA app icon + web manifest (home-screen install)** ([index.html](index.html) `<head>`, [public/manifest.webmanifest](public/manifest.webmanifest), [public/icons/](public/icons/))
- The site previously had **no** favicon / `apple-touch-icon` / manifest, so "Add to Home Screen" gave a generic/screenshot icon. Now wired end-to-end.
- Generated the icon set from `Archive/Images/Cars multipack_files/DUI App Icon.png` (1254², **opaque** synthwave art) via `sips`: `apple-touch-icon.png` (180), `icon-192/512.png`, `favicon-16/32.png` → `public/icons/`.
- `manifest.webmanifest`: name "DUI", `display:standalone`, theme/background `#000000`, 192+512 icons (purpose `any`).
- `<head>` adds favicon links, `apple-touch-icon`, `manifest`, `theme-color`, and `apple-mobile-web-app-title` "DUI".
- Decision: **synthwave art used everywhere**; the 2nd candidate (`App Icon.png`, a pre-rounded squircle WITH alpha) left unused — an opaque square is the correct `apple-touch-icon` source since iOS rounds corners itself. Vite copies `public/` → dist root on build; verified icons + manifest land in `dist/` and the built `index.html` references them. Not yet deployed (push triggers Netlify).

**Mountain treeline band removed (Snoqualmie Pass)** ([Road.js](src/road/Road.js) `drawPeak` ~864)
- The green "vegetation" wedge painted over each near peak's lower 18% (mile 45–70, `vegAmt`) overlapped into a continuous **green band on the horizon** at the pass. Per user, removed the wedge so each peak's base color (snowy `nearColor`/`farColor`) extends straight to the horizon — "mountains extend down further." Also deleted the now-unused `vegAmt` unlock var. Snow caps / outcrops / shading / pass-gap parting all unchanged. Only the mile 45–70 window is affected.

**Drug-icon load race — self-healing upgrade** ([GameScene.js](src/scenes/GameScene.js) `_drawDrugIcons`)
- Icons were lazily created **once**; if a drug texture wasn't ready at first draw (slow/cold phone load, or the 20s [BootScene](src/scenes/BootScene.js#L47) safety-timer force-start), a text-dot `•` fallback was cached **permanently** and never became the real logo. Symptom: intermittent missing drug logos, a *different subset each load*.
- Fix: per-frame **upgrade** — if a slot is still the dot fallback and `textures.exists(texKey)` is now true, destroy the dot and build the real image (extracted `buildDrugImage` helper; keeps `_hudObjects`/camera-ignore consistent).
- **NOT covered:** a genuine `loaderror` (iOS dropping a request under load) → BootScene substitutes a placeholder circle and never retries. A boot-loader retry / timeout placeholder-fill was offered but **not applied** (sensitive boot path — awaiting user go-ahead).

**Drug icons vanish after buying a car (custom mode)** ([GameScene.js](src/scenes/GameScene.js) init ~429)
- Rest-stop "continue" (including after a car purchase) does `scene.start('Game', …)`; Phaser reuses the scene instance, destroys all GameObjects and resets `_hudObjects = []`, but **`_drugIcons` kept pointing at the dead icon objects**. The lazy-create guard (`if (!this._drugIcons[id])`) then treated them as "already created" and never rebuilt them → invisible icons (the trailing `setVisible(false)` on dead objects is why it failed silently, not with a crash).
- Fix: reset `this._drugIcons = {}` on every (re)create, alongside `_hudObjects`. This matches the existing pattern for the other persistent keyed HUD caches — `_f12Texts` (reset to `null` @299) and `_drugGhostPool` (reset to `[]` @780); `_drugIcons` was the lone omission.
- Scope note: this actually affected **all** rest-stop resumes in custom mode, not just car purchases — buying a car is just where the user caught it.

### 2026-05-30 (latest+1) — Painted-edge invariant for buildings + ramp-clearance bypass

Continuation of the "Long thrash on roadside building parallax" session below. After ruling out the far-perspective `proj.sx` re-anchor (A/B-tested with `_isStructureForPerspective = false`), the user prescribed a precise render-time invariant: **the painted road-facing edge of every building/house must remain a fixed projected gap outside the projected road edge every frame, regardless of approach, steering, PNG padding, or per-region `roadScale`**. Sprite center is no longer the authority — it's *back-solved* from the desired painted edge.

- **`STRUCTURE_BBOX` lookup table** ([GameScene.js](src/scenes/GameScene.js):159 top-of-file) — `{ leftFrac, rightFrac }` per texture key, baked from PNG alpha-channel analysis (40 non-full-bleed entries from 75 textures scanned). Full-bleed PNGs (content ≥ 99.5 %) fall through to a `{ leftFrac: 0, rightFrac: 1 }` default. Generated by `/tmp/measure_bboxes.py`; regeneratable.

- **Painted-edge invariant** ([GameScene.js](src/scenes/GameScene.js) `_renderSceneSprites` ~10125) — opt-in via `sp.roadEdgeGapCars` AND `!sp.rampClearance`:
  ```
  centerX           = proj.sx − proj.roadHalfW × visualOffset
  roadEdgeX         = centerX + sign × proj.roadHalfW
  gapPx             = proj.sw × sp.roadEdgeGapCars
  desiredInnerEdgeX = roadEdgeX + sign × gapPx
  innerEdgeFrac     = sign≥0 ? leftFrac : (flipped ? 1−leftFrac : rightFrac)
  spriteCenterX     = desiredInnerEdgeX − (innerEdgeFrac − 0.5) × targetW
  ```
  The sprite is rendered at `spriteCenterX` (not `proj.sx`). Result: the painted edge is anchored to the projected road edge by a fixed gap measured in `proj.sw` units (i.e., car-widths at the building's depth). Per-frame motion of the painted edge tracks the road edge by construction; the per-PNG content fraction is baked into the spawn-time anchor; per-region `roadScale` divergences are absorbed because the gap is computed from the SAME projection that produces the road edge.

- **Collision rect synced** ([GameScene.js](src/scenes/GameScene.js):~4435) — when the invariant is active, `spL`/`spR` derive from `desiredInnerEdgeX ± paintedWidth` (painted bbox × targetW). Authority is the projected road edge, not `proj.sx`. The hand-tuned `collisionWidthFraction` (0.22 for `house`, 0.70 for `west_seattle_*`, etc.) becomes the legacy fallback path for non-structures.

- **`roadEdgeGapCars` set on every cycle-spawn building** ([RouteData.js](src/road/RouteData.js):1349) — was only set on `isResidentialFrontage` sprites; for Bellevue / downtown Seattle skyline buildings it was `undefined`, so the invariant's default of `1.0` was placing the painted edge ~3 car-widths closer to the road than the spawn intended. This was the **"building tracks toward the car HARD"** symptom in the earlier Bellevue screenshots. Fixed by always setting `roadEdgeGapCars: gapCars`.

- **All `_left` / `_right` suffix exceptions stripped** ([GameScene.js](src/scenes/GameScene.js):10028, 10121, 12248) — per user convention, **every scenery PNG is authored as a right-side building**. The `_left` / `_right` suffix in filenames is purely cosmetic. The renderer now flips any building/house with `sp.offset < 0` unconditionally; the painted-edge invariant's `flipped` flag is exactly `autoFlipLeft` with no exception branch.

- **Rest-stop ramp-clearance bypass** ([GameScene.js](src/scenes/GameScene.js):10133, 4514, 8938) — identified via the G-dump diagnostic (see below): inside the 1.3-mi ramp window around each rest stop (mile 9.5 Mercer, mile 12.5 Bellevue, etc.), the existing ramp-clearance block at `_renderSceneSprites` ~9957 mutates `visualOffset` from `~2.56 → ~5.42` to shove the building past the ramp gore. The painted-edge invariant uses this mutated `visualOffset` to compute `centerX = proj.sx − proj.roadHalfW × visualOffset`, which is mathematically consistent but anchors to a road edge that's far outside the viewport. The buildings end up off-screen (`renderX = 1257` on an 800-px screen) AND the invariant's frame of reference is wrong for the ramp gore geometry. Fix: skip the invariant when `sp.rampClearance` is true; the legacy ramp-push handles those sprites' positioning. Gated at all three sites — render, live collision, F3 overlay.

- **F2 painted-edge overlay (independent of F3)** ([GameScene.js](src/scenes/GameScene.js):641 + `_renderSceneSprites` per-sprite block) — dedicated `_paintedEdgeGfx` layer at depth 19, cleared per-frame, drawn into directly from inside the painted-edge invariant block using the SAME values the renderer applies. Lines:
  - **Yellow** — projected road edge at the building's depth
  - **Cyan** — actual painted inner edge (drawn taller, pokes out top/bottom)
  - **Magenta** — desired painted inner edge (drawn on top; if invariant holds, magenta sits dead-centre over cyan and you only see magenta in the middle)
  - **Dim cyan** — outer painted edge (back of the building's painted footprint)
  Toggles independently of F3 so the user can view only the lines, no blue frames / red boxes / labels. F2 was initially nested under F3; user pointed out this was wrong and the refactor split it out onto its own graphics layer.

- **G — telemetry dump** ([GameScene.js](src/scenes/GameScene.js):994 + `_renderSceneSprites` end-of-loop) — one-shot console.table dump of every visible structure's painted-edge math when the user presses G. Each row: `tex, sp_off, vis_off, sign, flipped, proj_sx, roadHalfW, centerX, roadEdgeX, gapCars, gapPx, desiredInner, targetW, bboxL, bboxR, innerFrac, renderX, n`. This is what bridges the **"I wish you could play this and see what I see"** asymmetry — the user pauses, hits G, pastes the table into chat, and I have exactly the per-frame numeric state needed to diagnose. The Mercer ramp-clearance bug above was identified in ~10 seconds from a single dump (rows showed `sp_off=2.562, vis_off=5.423` — 2.86-lane mutation traced to the ramp-push block).

- **B-key conflict** — initially bound as F2 fallback "in case some OS captures F2"; turned out the user had B mapped to game-go-back and it was clobbering. Removed; F2 is the only painted-edge toggle.

- **Verified behaviors per the G-dump**: for normal (non-ramp) Mercer left-side homes at varying depths, `desiredInnerEdgeX` is always strictly LEFT of `roadEdgeX` by exactly `gapPx`, depth-independent in lane units. For right-side: always RIGHT by `gapPx`. The "magenta in the road" perception remaining for distant left-side buildings is the natural perspective compression — at far depths the left road edge projects near the screen vanishing point (inside the near-road area from the player's viewpoint), so the line geometrically belongs at the road edge *at that depth* even though it visually overlaps the near road.

**Open**: the user reports the *near-distance* invariant holds well (residual motion is much reduced, no more crowding/encroachment, no ramp overlap), but perceives some remaining "movement" — likely the natural perspective effect of building scale growth on approach (outer edge expansion away from road) which the invariant intentionally does NOT lock. The horizon-backdrop approach remains the only path to a fully static row, with the tradeoffs of lost collision and lost approach depth.

### 2026-05-31 — Long session: pass-through city signs, NPC freight + farm equipment, HUD/signage overhaul, scenery polish, launcher app

**Signage pass.**
- New `PASS_THROUGH_CITIES` table in [constants.js](src/constants.js) — Preston (Exit 22), Kittitas (Exit 115), George (Exit 149), Endicott Rd. Starter set with a comment block listing more candidates the user can append. Spawned in [RouteData.js](src/road/RouteData.js) right after the rest-stop loop using `exit_sign_green` with `passThrough: true` — no `stopId`, no ramp paint, no amenities placard.
- Render diverged from rest-stop signs via `sp.passThrough`: yellow REST STOP plaque in Road.js gated off, "REST STOP" text in GameScene gated off, exit label switched to `MILE XX` (game mile) for pass-throughs / `Exit XX` (real WSDOT number or game mile) for rest stops.
- Non-I-90 rest stops swapped from highway-name labels (WA-262, WA-17, Airport Rd, US-195 S, WA-271 E) to `Exit <mileage>` — the shield badge already shows the highway so the text was duplicating it.
- `exit_sign_green` baseW/baseH bumped 4800×6600 → **6400×8800** with offset 2.0 → **2.4** to keep the wider face off the right travel lane. Font multipliers dropped ~20 % so PRESTON / EXIT 22 etc. fit inside the bigger frame.
- Town text raised: single-word at `signH * 0.45`, multi-line at `0.37 / 0.53` (centered between EXIT row and bottom border instead of sagging at the bottom).
- Highway shield nudged left (`padX 0.04 → 0.015`) to sit tight against the white border.
- Sign text threshold dropped `signW < 3` → `< 0.25` so green-sign text populates the moment the frame becomes visible, not after a "blank green rectangle on horizon" stage.
- Grade signs (TRUCKS USE LOWER GEAR / STEEP GRADE / etc.) bumped 2800×3400 → 4400×5400 for legibility at 120 mph.
- "NEXT EXITS" placard spawn suppressed — render code retained for legacy save compatibility, no sprites of this type spawned.
- Removed the per-segment EXIT chevron triangle and the right-shoulder delineator posts in Road.js — at game scale they stacked into white-hash-mark artifacts across consecutive segments instead of reading as discrete chevrons/posts.
- Off-ramp width is now **constant** within the window — `t = 1` always inside `if (seg.rampStrength > 0)`. Removed the smoothstep narrow→wide pull-out animation. Ramp opens at full divergence (1.25 lanes × 2.05-lane gore wedge) the moment rampStrength > 0 and stays that size through the after-window taper.

**Wind sign at Vantage (mile 137).**
- New asset `freeway_sign_wind.png` (1263×864 cantilever composite — pole on right, sign body hangs left over the road). Profiled in SCENERY_IMAGE_PROFILES + FOG_PROFILE_MULTS with widthMult 4.20.
- Spawned as a `building` sprite with `collidable: false` (the sign body over the road would otherwise crash the car); segment carries `windSignPoleSide: 1`.
- Pole-base collision mirrors `utility_pole` exactly — −10 HP, 1.5 s cooldown, crash-recovery handshake — with a separate `WIND SIGN POLE` popup. Logic block added in [GameScene.js](src/scenes/GameScene.js) right under the utility-pole check.

**Hatton multi-fix.**
- Asset `sign_H.png` does NOT exist on disk; amenities placard was rendering as a blank white frame. Introduced `STOPS_WITHOUT_BAKED_SIGN = new Set(['H'])` — skips the amenities-sign spawn for stops in the set. Green exit sign + ramp still spawn normally.
- Hatton exit label changed `WA-26` → `Exit 205` (the badge already shows WA-26).
- Hatton added to `_CP_RAW` (CHECKPOINTS) — the custom-mode location picker filters CHECKPOINTS, not REST_STOPS, so Hatton was visible on the in-game map but not in the start menu.
- Hatton added to `GEO_WAYPOINTS` at real lat/lon (46.759, -118.825) — previously it was being interpolated on the straight Othello→Washtucna line.

**HUD city label — last sign passed.**
- New `getLastSignTown(currentMile)` in [constants.js](src/constants.js) — scans REST_STOPS + PASS_THROUGH_CITIES for the latest sign whose `mileage − 1` is ≤ currentMile, returns that town name.
- GameScene's bottom-center label switched from `getLocationName(progress)` → `getLastSignTown(mileNow) || getLocationName(progress)`. Pass-through city signs now drive the HUD too — pass Preston's sign at mile 21 and the label reads "Preston" until Snoqualmie's sign at mile 24.

**Custom-mode location picker tail fix.** Denominator was `CHECKPOINTS.length - 1` but the picker filters out the `isFinish` entry, leaving a dangling line tail past the last dot suggesting more stops. Switched to `customStartCities.length - 1` so the last dot (Pullman) lands exactly at `mapRight` under the PULLMAN label.

**Issaquah / Snoqualmie scenery cleanup.**
- `RESIDENTIAL_FRONTAGE_GAP_CARS` bumped 1.25 → **2.75** — eastside homes were crowding the sidewalk and the tall codex_issaquah_highlands silhouette read as "floating" at far perspective because its near-edge sat almost on the fog line. (For reference: Mercer 3.00, West Seattle 3.50.)
- `addExitScenery` strip restricted to Seattle rest stop only. The Issaquah strip texture was spawning at every rest stop past Bellevue — at Snoqualmie (mile 25) it appeared as the apartment building "still blocking the exit". Per the prior `project_dui_bellevue_issaquah_swap` memory ("Issaquah fully bare"), it shouldn't have been there at all.
- **`rampClearance` push de-gated.** Was `if (rs > 0.30)` at three sites (renderer, live collision, F3 overlay). A home spawned at mile 24.14 sits in a segment whose own rampStrength is 0.14 — below threshold — so the push never fired and the home stayed at spawn offset all the way through the approach. Now always pushes to the FULL ramp extent (`1 + 3.30 = 4.30`) the moment a rampClearance sprite is rendered.

**E. WA Silos — hand-placed Vantage→Pullman.** 5 deterministic spots: mile 165 (Royal slope) R, 195 (Hatton coulee) L, 232 (Washtucna) R, 260 (Endicott) L, 280 (Colfax) R. Texture `codex_east_wa_silos` (1388×779) registered with widthMult 3.20.

**Doublewide tripled.** `widthMult 2.85 → 8.55`, `maxW 320 → 960`, `maxH multiplier 1.85 → 5.55` for both tan and white variants. Matched in FOG_PROFILE_MULTS so spawn placement uses the same effective width.

**NPC traffic — Eastern WA freight + farm equipment.** New assets in [AssetManifest.js](src/systems/AssetManifest.js): `car_back_codex_semi`, `car_front_codex_semi_red/green` (shared back, two front colors), `car_back_codex_tractor` (back-only, same-direction only), `car_back/front_codex_white_truck`, `car_back/front_codex_work_truck`. Full rewrite of vehicle-class selection in `_spawnTraffic`:

| Mile | car / white_truck / work_truck / semi / tractor |
|---|---|
| < 17 | car 100 |
| 17–52 | 90 / 6 / 3 / 1 |
| 53–69 | 82 / 8 / 6 / 4 |
| 70–136 | 70 / 10 / 8 / 12 |
| 137+ | 50 / 10 / 9 / 22 / 9 |

- **Semi**: 70 ± 10 mph same-dir, 60 ± 8 oncoming, `visualScale 1.35` (renders ~lane-wide). 50/50 red/green front. **Pair-spawn**: when a same-dir semi spawns east of Vantage, 35 % chance an oncoming semi also spawns within ±1500 units of the same Z — the "almost impossible to drive between" scenario.
- **White truck** / **Work truck**: highway speed vs 45 ± 5 mph slow contractor pace.
- **Tractor**: same-direction only (we only have a Back PNG — player always overtakes), 30 ± 3 mph, spawns at fog line (`laneOffset 0.95`), drifts sinusoidally between 0.95 and 0.75 every ~16 s. **Throttled by 10-mile cooldown** via `this._lastTractorMile` — a tractor roll inside the window downgrades to a semi. **2x damage multiplier** on all crash types (`classDmgMul = car.vClass === 'tractor' ? 2 : 1`) — hitting one is like slamming a small bulldozer.

**70 ft NPC follow distance.** `FOLLOW_DIST` bumped 1800 → **4250** units (≈ 70 ft at 60.76 units/ft). Spawn-conflict gate matched to 4250 so freshly-spawned cars can't appear closer than the in-traffic gap rule allows.

**Bush stick-and-roll-off.** Replaces the old "car blows through with light damage" shrub behavior. `_sceneryGlance` now sets `this._bushStuckUntil = now + 3000` and pops `🌿 BUSH STUCK!`. New cap in `_updatePlayer` (same shape as flat-tire cap) clamps `targetSpeed` to 40 mph while the timer is live. Lateral nudge + sprite kick stay the same.

**Snow windshield accumulation.** Two-layer model in [EffectsSystem.js](src/systems/EffectsSystem.js):
- `_wsSnowCoverage` (0–1) — opaque white pack covering the windshield rect, grows `0.20 × weatherInt × (0.6 + 0.4 × sevSnT)` per mile. Full intensity + peak severity → 5 mi to opaque (user spec).
- Wiper sweep removes 0.40 additive (3 sweeps clear a fully-covered windshield).
- Decorative `_wsSnow` flake particle layer kept for visual texture, scaled by `flakeFade = 1 − coverage` so flakes fade out as the pack thickens.
- Drains 6 %/frame outside snow zones; mile-tracker reset on exit so the next snow band restarts the 5-mi clock at 0.

**Power poles + wire treated like fog/fence line.**
- Pole offset 2.42 → **2.0** — close enough to read as shoulder, far enough that the closest visible pole doesn't appear to drop into the road as it nears the bottom edge.
- Per-pole scale `[0.93, 1.04, 0.97, 1.08]` + rotation `[0.010, -0.012, 0.007, -0.009]` variation mirroring the fence-post render, so poles read as natural wooden posts.
- Wire rendering split into two passes: **continuous ribbon at WIRE_STEP=14** (same cadence as fence rail) sampling the surface densely so the wire follows the road's curve exactly, plus pole sprites at the real-world **SPACING=61** (~200 ft) pitch. Resolved the "wire drops down at screen exit" — the single-pass 61-spacing draw cut straight-line shortcuts across road curves.
- Edge continuation: hold Y constant past the closest visible wire sample (matches fence rail continuation) so the wire still doesn't dive into the road at the screen edge.

**Phone-menu fixes ([index.html](index.html)).**
- Root cause for the "music / garage / maps / start-over / checkpoint / menu buttons do nothing" bug: `public/assets/ui/iphone_menu_bg.png` had been compressed from the original **1408×2641** to **819×1536**, but every `data-px` hit-zone coordinate was still authored against the 1408×2641 image. Bottom-row Y=2317 projected to off-screen dead space. Restored the original from `Archive/runtime-image-originals/`.
- The `data-action="menu"` button had no handler at all (separate latent bug). Added `window.__mainMenu` in [main.js](src/main.js) (uses `scene.start('Game', {})` the same way GameOverScene's "MAIN MENU" does); wired the hit zone with a confirmation prompt.
- Stale 819×1536 comment in index.html updated to 1408×2641 with a warning so a future image-compression pass doesn't clobber the alignment again.

**Amenities sign decal fade removed.** Threshold dropped `signW < 2` → `< 0.5`, decalAlpha forced to 1. Shield/brand logos now appear at the same instant the white frame does, eliminating the "white sign → blue sign with logos" pop on approach.

**Mac launcher app.** `~/Desktop/DUI Dev.app` bundle + `~/Desktop/DUI Dev.command` shell script. Double-click → opens Terminal, runs `npm run dev`, polls `https://localhost:3000/` every 0.5 s, opens the browser the moment Vite responds, leaves logs visible. Custom icon: melted pink steering wheel dripping into a cyan-bordered "DUI:LOCAL" server rack. Source SVG + iconset live under [scripts/](scripts/) — `dui-icon.svg`, `DUI.iconset/`, `DUI.icns`.

**Tunable hot-spots left in the working tree (callouts for future iteration):**
- Wind sign sprite offset `-0.30` — adjust if the pole base isn't landing exactly on the right shoulder.
- Semi `visualScale: 1.35` — bump if "almost a lane wide" reads too narrow.
- Spawn-class % tables — first big-volume drive will tell whether Eastern WA feels too truck-heavy.
- Silo offsets `±3.20` per placement.

### 2026-05-30 (latest) — Water-sink decoupled from guardrails (the working model)

**Design rule (locked):** the guardrails and the water-sink are TWO SEPARATE SYSTEMS and must stay decoupled. Never modify a barrier to make sinking work. The intended behavior: **bridges have guardrails (you cannot drive or get knocked off the bridge deck), but you CAN drive into the water on the open approaches BEFORE the rails, and the car sinks.**

**Guardrail = gap-less hard wall via `_preMoveX`** ([GameScene.js](src/scenes/GameScene.js) lateral-physics block, ~3490 capture + ~3560 rail block)
- Capture `const _preMoveX = p.x` at the END of last frame, before this frame's steering/impulse integration.
- The rail snap gates on `_preMoveX`, NOT the current landed `p.x`: `railsRightSide && p.x > BRIDGE_RAIL && _preMoveX <= SINK_EDGE` → snap to +0.95 (mirror left with `_preMoveX >= -SINK_EDGE`). If the car was ON the road last frame and tries to cross, it is BLOCKED no matter how fast it steered or how hard it was hit. There is no gap to slip through — you can't drive or get knocked off a railed bridge.
- If `|_preMoveX| > SINK_EDGE`, the car was ALREADY deep in the lake last frame (only possible by arriving off a NON-railed land approach, e.g. driving off Mercer Island onto the lake apron). The snap is skipped → scrape-damage → the dunk below sinks it. The rail never rescues a car that is already in the water.

**Dunk / sink** ([GameScene.js](src/scenes/GameScene.js) ~3730) — unchanged trigger: sink when on water past `DUNK_THRESH = 1.15`. `_bothSidedWater = seg.water || seg.bridgeWaterChannel`; plus `waterLeft` / `waterRight`. `SINK_EDGE` in the rail block must stay equal to `DUNK_THRESH` so the hand-off is seamless. A `!this._sinkState` guard skips the rail while the sink animation plays so it can't yank the sinking car.

**Geometry** ([Colors.js](src/utils/Colors.js) `REGION_ORDER`, [RouteData.js](src/road/RouteData.js)) — only the floating-bridge stretches are `lake_washington` (water:true → railed): Murrow 5.7–7.2, East Channel 9.8–10.2. Between them 7.2–9.8 is `mercer_island` LAND (no rail). A 0.10 mi `seg.water` apron is flagged before/after each bridge (~2318) — that apron is the unrailed water the player can drive into off the Mercer land approach and sink.

**Approaches that were tried and REVERTED (do not re-add):**
- Hard-rail every water segment → car couldn't sink (rail "replaced it on the bridge").
- Latched crash "punch-through" the rail (`p.punchThrough`, `PUNCH_IMPULSE`) — coupled the systems; removed.
- Band-gated snap `[0.95, 1.15]` keyed on current `p.x` — left a GAP: a fast steer/crash jumps past 1.15 in one frame, skips the snap, drives off the bridge. Replaced by the `_preMoveX` gate.
- `seg.shoreWall` — a both-sided hard wall on the land approaches behind the houses. Blocked ALL off-road exit on the approach; the approach is meant to stay drivable-into-water. Fully removed. If a barrier is ever wanted there it must be water-side ONLY and set out past the shoulder, never both-sided at the lane edge.

### 2026-05-30 (later session) — Long thrash on roadside building parallax, collision fidelity, headlight clamp, water dunk

Single very long session. Mostly successful, but the roadside-building work hit a dead-end and the root cause was only identified at the end — the proper fix is teed up but **not yet applied**.

**Milky Way visuals** ([Road.js](src/road/Road.js) `render`)
- Reshaped the band: galactic core via Gaussian at `CORE_T = 0.78` with `mwBright(t)` and `mwGirth(t)` curves so the band fattens 3–5× through the core and tapers to thin star-rich tails. Added a 150-blob low-alpha "cohesion wash" *underneath* the granular 1000-blob layer for the old continuous-cloud feel, plus 380-puff core plume with mild swirl, dust rivers as 3 meandering Bezier streams, and brighter cluster knots.
- **Real bug**: `azAlt()` had a leftover `H() * HORIZON_Y_FRAC (0.80)` from when `H()` meant SCREEN HEIGHT — now `H()` is the horizon-Y itself, so altitude=0° was projecting 20 % of horizon-Y ABOVE the horizon, putting the band mid-sky instead of rising from the ground. Fixed `azAlt` so altitude=0° lands on `H()` exactly. Moon path benefits too.
- **Rotation anchored to reveal**: Milky-Way-only rotation now zeros at mile 215 (first reveal) and the rate is scaled to `MW_ROT_SCALE = 0.20` so it doesn't lap multiple times over the visible window. Field stars use the original `skyRot`.

**Custom-start menu** ([GameScene.js](src/scenes/GameScene.js) `_buildSliderModal`)
- "PICK A CITY. SET YOUR CHAOS. THEN DRIVE." prompt replaced with a small `Location:` label sitting just left of the dynamic city readout (`cityReadout`) so they read together as one line.

**Bellevue building audit** (multi-agent workflow `bellevue-building-audit`)
- 26 agents (4 mappers, 12 diagnostics, 9 adversarial verifiers, 1 synthesizer). 4 of 12 candidate failure modes survived adversarial review.
- Applied 4 of 5 punch-list fixes in [RouteData.js](src/road/RouteData.js):
  - **De-duped right pool** (was 8 entries with `residential_cluster` listed twice; now 7) so pool lengths are coprime with the 8-entry left pool — combined L+R cycle stretches from 0.8 mi to ~5.6 mi.
  - **Hash-mixed picker + recent-key window** — replaced the modulo walk with an xorshift index + per-side rolling window of last `floor(len/2)` picks, so the same building can't reappear within a few slots.
  - **Halved skyline slot density** (20/mi → 10/mi) and bumped vacant-slot skip 0.20 → 0.35 — old pitch produced overlapping projected widths.
  - **Reduced eastside_urban heightBoost** 3.0 → 2.2 so projected widths fit inside the new slot pitch. Seattle downtown unchanged.
- Skipped Fix 5 (per-distance sprite fog blend) as out-of-scope for the Bellevue complaint.

**Shrubs no longer stop the car** ([GameScene.js](src/scenes/GameScene.js) `_sceneryGlance`)
- **Long-standing bug, finally fixed.** Sage bushes used to scrub speed to 40 mph and reapply every 200 ms while inside the bush volume — read as "the car won't go through this bush." Now: 1 HP damage, light lateral nudge, **`sp.collidable = false`** marks the specific shrub flattened so it can't damage twice, **no speed cap**. Hit a bush at 90 mph, you take 1 HP, hear the thump, keep going at 90.

**Space Needle moved to the opening mile** ([RouteData.js](src/road/RouteData.js), [GameScene.js](src/scenes/GameScene.js))
- From mile 3.5 → **mile 1.85** (just past the crane stretch, 1.05–1.75), offset −1.6 → **−3.0** (far left horizon landmark). Visibility lookahead bumped to `DRAW_DIST * 9` (~2.1 mi) so the Needle pops in at game start when the cranes do.

**Drunk double-vision suppressed during debug overlay** ([GameScene.js](src/scenes/GameScene.js))
- F3 debug mode now zeros `doubleVision` and `shroomMelt` at the render call (3 sites: road, cars/cops, drug pickups). Underlying effect values untouched — only the rendering pass sees zeros. User was rightly annoyed that "beer shouldn't affect debugger tools." Single ghost copy removed when debug is on.

**Collision tunneling at high closing speeds** ([GameScene.js](src/scenes/GameScene.js) `_checkCollisions`)
- `aabbHit` gained a motion-aware swept window: `sweep = |p.speed − entitySpeed| × frameDt × 0.60`, so the `|Δz| < CAR_LEN_Z` threshold expands proportionally to closing speed. Without this, Rx-boosted player + oncoming traffic could step from `Δz = +600` to `Δz = −500` in a single frame and pass through each other.
- **Dual gate for vehicle collisions**: a hit fires if EITHER `aabbHit` (world-space lane proximity) OR `classifyHit` (screen-space rectangle overlap of the rendered sprites) passes. Both traffic and cop loops now use this. Catches NPCs that visually overlap but were outside the lane-offset gate.

**Tunnel lane clamp removed** ([GameScene.js](src/scenes/GameScene.js) `_renderVehicles`)
- The line `const tunnelLaneOffset = inTunnel ? clamp(laneOffset, -0.48, 0.48) : laneOffset` was pulling the **sprite** for outer-lane cars to ±0.48 visually while the **collision** stayed at the real ±0.75. Cars rendered on the hash marks between oncoming lanes, collision rects off to the side. Removed the clamp; tunnel walls sit outside the road shoulder so cars at ±0.75 are still on the pavement.

**Building fade-in clock bug — `gameTime` → `this.time.now`** ([GameScene.js](src/scenes/GameScene.js:9806](src/scenes/GameScene.js#L9806))
- **Long-standing "buildings only appear after I press L/R" bug.** Fade-in used `this.gameTime` as its clock, but gameTime is gated on first L/R/tap input (the ready-state freeze). Every building's `_fadeInStart` got stamped to 0, `elapsed = 0`, `fadeAlpha = 0` → **buildings were rendered but invisible until the first input**. Pressing L/R or pause/unpause (SPACE) cleared the ready state, gameTime started ticking, fade resolved to 1, and the user perceived "buildings appearing." Switched to `this.time.now` (Phaser's monotonic clock).

**Tunnel cull: see homes through the exit** ([Road.js](src/road/Road.js):1329, [GameScene.js](src/scenes/GameScene.js):9468)
- `_cameraInTunnel` + `_tunnelExitN` now published from `Road.render()`. Scenery renderer uses `tunnelExitN` as the cull boundary while inside (or `-1` = no cull) so homes past the exit render through the bright mouth opening, exactly the way trees already did. The old past-tunnel cull only fired on `type === 'building' || 'house'`, so trees showed and buildings didn't — that asymmetry is gone.

**Headlight beam vertical-clamp** ([GameScene.js](src/scenes/GameScene.js):8198 `_renderHeadlights`)
- On steep grades the original `roadTipY = HORIZON_Y + max(40, …)` formula was free to drag the beam tip up to the horizon line (or above when the camera pitched), giving the "cones shooting straight up into the sky" look. Threw out the formula entirely: **`roadTipY = beamBaseY − 55`** (hard-anchored 55 px above the base, period). Cones now stay a stubby forward pool just ahead of the bumper regardless of road tilt. Tunable — the `55` is the single dial.

**Water dunk now actually fires** ([GameScene.js](src/scenes/GameScene.js):3445, 3614)
- Comment block said "Plain `water` segments have no clamp" but the code condition `onWaterAnySide = !!(seg?.bridge || seg?.water)` included plain water — so the car was pinned at ±0.95 on lake-adjacent segments and could never reach the ±1.5 dunk threshold. **Drove off the bridge → respawned without sinking.**
- Fix: clamp only on `seg.bridge`. Plain water + `waterLeft`/`waterRight` get *damage* on shoulder scrape but no positional snap. Dunk threshold dropped 1.5 → **1.15** so even moderate drift fires the sink.

**Roadside building parallax — long dead-end with the real cause finally identified**
- Spent the session attempting several fixes for "houses crowd the roadway when far, back off when close" perception. All rejected:
  - Bumped/uniform `widthMultOverride = 9.0` in `fogLineOffset` (reverted; pushed narrow variants further back, made things worse).
  - 40 % parallax dampening on building sprite positions (reverted; broke road↔building alignment).
  - 100 % anti-parallax (`+ playerX × roadHalfW`) — locked sprites to fixed screen positions but caused the "fly outward" effect as you approach (`screenW × L` grows with depth).
  - Massive setback bumps (gap 3.5 → 7.0, skyline 4.0 → 8.0) — user rejected, "no way to crash into a house."
  - All reverted to baseline parallax.
- **Per user's analytical prompt, did the actual math:** sprite half-width in lane units is `(825 × mult × aspect) / 7200` — a **constant in lane units regardless of depth**. Gap from sprite inner edge to road edge is invariant in lane units, linear in pixels with depth. Projection math does NOT cause sprite width to outpace setback. Concluded the cause is elsewhere.
- **Applied (correctly identified user-suggested fixes, kept):**
  - `usesFarPerspective` in `_renderSceneSprites` extended to include `sp.type === 'building' || 'house'` so every structure gets the `1/n` perspective falloff + vanishing-point pull.
  - **Unified scaling** for all structures: forced through the height-led path (`targetH = proj.sw × unifiedMult`, `targetW = targetH × baseW/baseH`), converting `widthMult` to an equivalent on the fly. Removes the height-led vs width-led split that made adjacent variants expand at different rates.
  - **Skipped the `shrink` cap** for all structures (was only skipped for `roadEdgeGapCars` sprites). Different assets hitting `maxW` vs `maxH` first was producing mismatched effective scales per depth.
  - **Bypassed the dynamic clearance push** (`proj = shifted` reassignment) for `sp.type === 'building' || 'house'` in BOTH the render path ([line 9753](src/scenes/GameScene.js#L9753)) AND the matching collision-side mirror ([line 4306](src/scenes/GameScene.js#L4306)). Buildings now honor their spawn-time `fogLineOffset` lateral position end-to-end.

- **Root cause found at end of session, fix not yet applied:** PNG transparent-padding ratio varies dramatically across the West Seattle home pool:

  | PNG | Frame | Content | Content / Frame |
  |---|---|---|---|
  | ws_3 / ws_4 | full-bleed RGBA | — | **~99.9 %** |
  | ws_2 | 768×576 palette | 720 | **93.8 %** |
  | ws_5 | 768×512 palette | 703 | **91.5 %** |
  | ws_1 | 768×512 palette | 680 | **88.5 %** |
  | ws_6 | 768×512 palette | 653 | **85.0 %** |

  `fogLineOffset()` computes the half-width in lane units from the **frame** dimensions (`heightMult × baseW/baseH`), not the **content** dimensions. So when the slot cycler picks different variants at adjacent slots, the **visible building edge** lands at different lane offsets even though every sprite center is correctly anchored. The visible inner edge for ws_3/ws_4 (full-bleed) sits at lane ~1.69; for ws_6 (15 % padding) it sits at lane ~1.97 — a swing of ~0.30 lane units variant-to-variant. THIS is the "the closer I get, the further they move" / "houses wobble" perception.

  **TODO — proposed fix is teed up:** in `fogLineOffset()`, multiply `halfW` by a per-PNG **content fraction** (new `FOG_CONTENT_FRAC` lookup) so the *visible* building edge — not the frame edge — lands at the designed gap. ws_6 spawns ~0.155 lane units closer to road; ws_3 spawns at the current position; every variant's visible facade ends up at the same fog-line offset. No renderer changes, no asset re-export, no spawn-loop changes. Awaiting user direction to implement.

- **Lessons:** stop reaching for math-level rewrites when the cause is asset-level inconsistency. The user's analytical framing ("does sprite width growth outpace setback growth?") forced the precise dimensional check that ruled out projection and pointed at the PNGs.

### 2026-05-30 — Wildlife overpass TWIN-ARCH rebuild (mile 65)

Rebuilt the Snoqualmie Pass wildlife crossing from real reference photos (I-90 overcrossing) after the bundled workflow reshape below broke. Built **one verified step at a time** (each gated to wildlife so Mt Baker / Mercer lid are untouched). It is a short, low cement **hill over a divided road** — two arches, a solid center pier on the median, a low earthen mound sloping to the forest on each side.

- **Twin-arch facade** ([Road.js](src/road/Road.js) `_drawTunnelFacade`, dedicated `isWildlifeFacade` early-return branch) — two segmental arches (one per carriageway) flanking a SOLID central pier, under a low flat-ish mound that slopes down on the outer flanks so sky/forest shows to the sides. Drawn as two solid concave pieces split at the centerline (each carves one arch + half the pier). **Geometry numerically pre-validated** for non-self-intersection across the perspective range (`/tmp/twin_arch_proto.py`) before writing — no more blind breakage. Knobs: pier half-width `mouthW*0.05`, arch rise `archHalf*0.92`, deck band, flank `mouthW*0.32`.
- **Two-opening mask** ([Road.js](src/road/Road.js) publishes `_tunnelMouthShapes`; [GameScene.js](src/scenes/GameScene.js) `_updateTunnelMask`) — the interior stencil is now the TWO arch polygons (not a single rect), so the interior shows through both arches while the solid center pier stays opaque. The geometry mask (a Graphics shape, not a hard rect) made this feasible. Non-wildlife facades set `_tunnelMouthShapes = null` → fall back to the rect.
- **Road split** — RouteData tags a **median zone** (mile 64.93–65.07, `seg.medianZone` + `seg.medianW` 0→1→0 taper). [GameScene.js](src/scenes/GameScene.js) barrier block adds a **soft pier collision** (nudges the player off the median to whichever side they lean — can't drive through the pillar, but still free to pick left OR right; never a crash). [Road.js](src/road/Road.js) `_drawSegment` draws a **visible raised concrete median curb** down the centerline (scales with `medianW`).
- **Bore** — lengthened to **~100 ft** (`WILDLIFE_OVERPASS_RANGE [65.00, 65.0189]`) and the interior **shaded dark** in `_drawTunnelShell` (a `0.62`-alpha overlay, sodium ceiling lights skipped for wildlife) so the openings read as a shaded recess you drive UNDER, not a bright see-through hole.
- User confirmed the facade shape + median read right; shade/length/proportions are single-number dials for further tuning. Generators/protos in `/tmp` (`twin_arch_proto.py`).

### 2026-05-29 (latest+3) — Wildlife overpass reshape (mile 65, multi-agent workflow) — ⛔ REVERTED

**This whole reshape was REVERTED** (superseded by the 2026-05-30 twin-arch rebuild above). In play it broke: cutting `W_FLANK` to 1800 left the facade too thin → holes → see-through to the sky ("abstract art installment"), and the 16-strip `sin` vault read as "fishbone" striped walls instead of solid. Lesson logged: big bundled blind facade changes break; the rebuild was done one verified step at a time. Original (now-reverted) approach for reference:

Designed + adversarially verified via the `wildlife-overpass-redesign` workflow (4 agents), then applied (12 patches, all gated on `isWildlifeFacade`/`seg.wildlife` so Mt Baker + Mercer lid render byte-for-byte unchanged).
- **Facade: wall → land-bridge** ([Road.js](src/road/Road.js) `_drawTunnelFacade`) — the old wildlife branch built one screen-filling sine half-dome (`W_FLANK=160000`) that read as the Great Wall. Replaced with a low FLAT-TOPPED earthen deck: `W_FLANK` cut to 1800 (modest abutment embankments, sky to the sides further back), arch springer lowered (`WL_H_OPEN=2300` vs the 4500 highway ceiling) and made SEGMENTAL (`WL_RISE_FRC=0.45` — keeps the liked arch shape but shorter), with a thin earthen deck band (`WL_DECK_THK=1100`) above the crown. crestY/dropY re-pointed to the deck top (only inside the wildlife branch). Ring/shadow/jamb edits follow the new segmental arch.
- **Bore: rectangular → arched vault** ([Road.js](src/road/Road.js) `_drawTunnelShell`) — wildlife ceiling raised (`H_CEIL` 4500→9000) and a `sin(π·t)` arched vault underside drawn as 16 trapezoid strips springing from the inside wall tops. Gated on `seg.wildlife`.
- **Verify caught a blocker:** the facade mask patch referenced `mouthRadius` before its `const` declaration (temporal-dead-zone ReferenceError, would crash every frame the overpass was visible) — applied the corrected inlined version.
- **Known eyeball caveats** (flagged by verify, for iteration): at the nearest render distance (n=30) the deck still spans full width — side sky only opens at n≥40; the facade deck silhouette is bare concrete + rim band (the grass/dirt/trees live in the BORE renderer, not the facade, so the deck has no painted greenery yet); the arched bore crown coincides with the raised flat ceiling (reads as a curved ceiling, not a deep cathedral vault).

### 2026-05-29 (latest+2) — Mercer/Seattle scenery fixes (multi-agent workflow)

Diagnosed + adversarially verified via a 6-agent workflow (`mercer-scenery-fixes`), then applied.
- **Mercer homes pop-in past the lid tunnel** ([GameScene.js](src/scenes/GameScene.js) `_renderSceneSprites`) — buildings/houses now fade in 0→1 over 450ms via a per-sprite `sp._fadeInStart` stamp instead of snapping to full opacity. The past-tunnel cull stamps `-1` while a structure is occluded so it re-fades the instant it's uncovered at the mouth. Generalizes to all structures entering draw range (smooths route-wide pop-in). Tunnel stays opaque (facade at depth 9.82 draws over sprites regardless of alpha); mirror pool + night-tint unaffected.
- **Mercer homes crowding the road** ([RouteData.js](src/road/RouteData.js)) — root cause: the `mercer_island` region had no case in the cycle-spawn `carWidthsPastFog` switch, so it fell through to `default: 0.90` car-widths (~0.21 normalized gap). Added explicit `case 'mercer_island': return MERCER_FRONTAGE_GAP_CARS` (=3.00, ~0.69 gap). Scoped exactly — Mercer was the only CYCLE_POOLS region hitting the default; West Seattle homes (separate path, 3.50) and eastern scenery untouched.
- **Bellevue/Seattle skyline sinking into Lake Washington** — first attempt (`SKYLINE_SHORE_LIFT=4`, lifting the silhouette base above the waterline) was **REVERTED**: the user clarified the skyline silhouette exists specifically to COVER a charcoal "junk" backdrop band on the bridge crossings, so lifting it just exposed that junk (visible as a dark band on the West Seattle bridge). Correct understanding: the silhouette must stay LOW (covering the charcoal), and the real bug on the Murrow floating bridge is a DRAW-ORDER problem — the per-segment lake-water fills are painted into the same roadGfx layer AFTER the silhouette, so they overpaint its lower edge ("sinks into the lake"). Proper fix (TODO) is a layer/draw-order change (silhouette above the water fills, behind the cranes), NOT a vertical lift.
- **Process note:** a diagnosis subagent overstepped and applied the tunnel-popin edit to GameScene.js directly during the workflow; the change was independently verified correct and kept.

### 2026-05-29 (latest+1) — Weather storm-build + seamless rain→snow, curve de-wiggle

**Weather** ([Weather.js](src/world/Weather.js), [EffectsSystem.js](src/systems/EffectsSystem.js))
- **Seamless rain→snow** (was a clear-weather gap): rain `intensity` no longer fades out over mile 38-40 and snow no longer fades in over 40-42 — both hold full at the mile-40 boundary, so rain hands directly to snow with no "it cleared up then snow started" gap.
- **Rain strong by mile 35**: rain `severity` ramp steepened (`(mile-30)/7`) → ~2.0 by mile 35, peak 2.4 by 37. Falling-streak `COUNT` and opacity now scale with `sevT` (`110·int·(1+1.4·sevT)`), so it builds into a wipers-needed downpour.
- **Windshield build-up** (was instant whole-glass fill): removed the 60-drops/sec bulk pre-fill; drops now accrue at a gentle severity-scaled rate (`5+34·sevT`/sec) and spawn in the lower 45% of the glass, so the windshield fills bottom-to-top over a few seconds and rebuilds after each wipe.

**Curves de-wiggled** ([routeGeo.json](src/road/routeGeo.json))
- Local feedback: Snoqualmie Pass "felt a lot curvier than I recall" — the GPS regen had rapid mile-to-mile S-curves. Regenerated with a wider curvature window (DELTA 0.30→0.50 mi) + 2 moving-average smoothing passes (calibration re-normalizes peak magnitude). North Bend→Pass direction-flips dropped from many to 2; reads as long sweeps now. Side benefit: the Mercer Island crowding-bend softened +0.0106→+0.0064. Bridges still verify straight. Generator: `/tmp/gen_curves_gps.py`.

### 2026-05-29 (latest) — Real GPS+DEM elevation (route no longer flat)

**Root cause of the flatness** ([routeGeo.json](src/road/routeGeo.json), [RouteData.js](src/road/RouteData.js))
- `routeGeo.json` had real `curves[]` (350 samples) but an **empty `hills[]`**, so `HAS_REAL_HILLS` was false and ALL elevation fell back to ~48 hand-typed keyframes in `I90_ELEV_FT`. In the east those keyframes are 15–25 mi apart, Catmull-Rom smoothed into featureless ramps — the Palouse rolling hills rendered as a flat tilt.

**Fix: populate hills[] from real road geometry + USGS DEM**
- Pulled the actual road polyline (4,286 vertices, 296.6 mi) for the Seattle→Pullman corridor from OSRM (OpenStreetMap routing), forced onto I-90 → WA-26 → US-195 → WA-270 via Vantage/La Crosse waypoints.
- Sampled 350 points along the **true roadbed** (not straight chords — earlier hand-waypoint attempts cut over Cascade peaks, producing a fake 4,600-ft summit flanking a valley) and queried elevation from OpenTopoData `ned10m` (USGS 10m DEM), converted m→ft, stored as feet-above-start in `hills[]`.
- **Rubber-sheet alignment**: pinned each town's real road-location to its game checkpoint mile (piecewise-linear game_mile→real_distance map) so terrain features land on their signs despite the 296.6→293 mi compression.
- Result verified against reality: summit peak 3030 ft @ mile 51, Vantage gorge drop to 589 ft, Ryegrass 2430, Cle Elum 1916, Washtucna coulee 1042, Pullman 2362 — all within ~30–80 ft of real. Generator script at `/tmp/gen_hills_gps.py` (reads `/tmp/osrm.json`).
- `I90_ELEV_FT` keyframes are now a **fallback only** (used if `hills[]` is ever cleared). Also corrected the Hyak/Keechelus ordering in that fallback array (summit before the lake; Hyak named once).
**Curves regenerated from the same GPS too (accurate turns)**
- The existing `curves[]` was "hand-keyframed I-90 data" — a sign cross-check showed it correlated ~−0.09 with reality (i.e. not geographically real). Regenerated from the OSRM polyline as signed curvature (bearing-change per arc length), using the **same rubber-sheet alignment** so turns and hills agree.
- Sign convention from Road.js (`screenDX += seg.curve` → positive = bends right). **Scale-calibrated to the existing curves' 90th-percentile magnitude** so turn *intensity/feel* matches today's tuning while turns land in real places/directions. Only ~2% of samples hit the ±0.022 clamp (isolated at the start + post-finish Pullman approach).
- Turns now fall on the genuinely curvy stretches: Yakima River Canyon (mile ~96, sharpest), the Cascade climb (~36), the Palouse / US-195 Colfax jog (~240–276); the Columbia Basin stays straight. Bridge/tunnel curve-flattening in `buildRoute` still overrides on those segments. Generator: `/tmp/gen_curves_gps.py`.

**Alignment fix (start point + curved-bridge bug)**
- First pass anchored game-mile 0 to the *Seattle* coordinate and pulled an OSRM route that started at Seattle — so the whole mile 0–13 urban corridor (WS Bridge, Mt Baker, Murrow, East Channel) was shifted ~5 mi relative to the hand-placed bridges/tunnels. Re-pulled OSRM **starting at West Seattle** (301.9 mi) and added correct dense anchors (West Seattle=0, Seattle=5, Mercer=9.5, Bellevue=12.5). Curve sign cross-check went −0.09 → **+0.92**; hills start now reads the real 324-ft West Seattle hilltop descending to the floating bridge.
- **Curved-bridge bug**: `smooth(rawCurves, 0.04)` ran AFTER the bridge-zeroing, so a real GPS curve adjacent to a straight bridge bled onto it (visible as a curved East Channel bridge leaving Mercer). Refactored to `applyStructureCurves(arr, pad)` called **twice** — pre-smooth with a 0.10-mi pad (approaches ramp cleanly to 0) and post-smooth with pad 0 (exact straight cores). Verified: WS/Mt Baker/Murrow/East Channel/Vantage bridges all `max|curve|=0.00000`; Mercer Lid keeps its intentional 0.012 right bend.

**Hybrid hills — urban keyframes + open-road DEM**
- DEM returns *terrain*, but the mile 0-13 urban corridor is packed with engineered structures whose roadbed is off the terrain: the WS high bridge decks OVER the Duwamish, the Mt Baker + Mercer-lid tunnels run UNDER ridges, and the Murrow + East Channel FLOATING bridges sit on the lake surface. Raw DEM floated the Murrow bridge at 135 ft. Fixed in the generator: hand roadbed keyframes (RouteData `I90_ELEV_FT`) through mile 12, crossfade to DEM over mile 12-16, DEM beyond. Verified roadbed: Murrow 21 ft / East Channel 28 ft (lake), Mercer lid 70 ft (ridge), WS bridge 236 ft (deck); open route unchanged (summit 3030, Vantage 572). Curves don't need this — bridge curve-flattening already forces them straight.

### 2026-05-29 (later) — Left-side off-road dead-zone closed (asymmetric clamp)

**Asymmetric lateral clamp** ([GameScene.js](src/scenes/GameScene.js) ~3699)
- The lateral clamp `_maxX = 2.8 + rampStrength * 3.7` opened the drivable corridor **symmetrically** to ±6.5 on exit-ramp segments. Since all off-ramps are right-side only, this exposed an empty off-road dead-zone on the LEFT near every exit — the player could drift far left into a space with no scenery, NPCs, or cops (the old "±5.5 tree wall in a space nobody should drive" problem).
- Split into `_maxXRight = 2.8 + rampStrength * 3.7` (unchanged — exits still work) and `_maxXLeft = 2.3` (hard wall, never opens). The ±5.5 tree-wall crash is left intact as a backstop (the left clamp now prevents the car from ever reaching it).
- Left-side off-road deterrent: past `x = -1.5` (half a lane beyond the ±1.0 fog line) the car bleeds **1 HP/sec** until it returns toward the road, up to the 2.3 wall. No crash/recovery-warp; the i-frame absorbs it so it won't stack onto a crash recovery. Right side gets no penalty (exit territory).
- Decision: chose a soft clamp + graduated bleed over decorating the dead space with visible trees — the player shouldn't be out there at all, so walling it off beats signposting it.

### 2026-05-29 (late) — Mirror lights, oncoming-car headlights, beam cleanup, Vite 6

**Rearview mirror lighting** ([GameScene.js](src/scenes/GameScene.js))
- Same-direction NPCs behind the player (facing the player in the mirror) get the full forward-view oncoming treatment: yellow lamp halos at headlight housings (cars `0.50`, trucks/SUVs `0.65` of sprite height), two cones meeting at the centerline at the bottom, bottom-half yellow splash whose flat top kisses the cone bottoms. Brightened ~1.5× in the mirror only (`MIRROR_HL_BOOST = 1.5`) so the tiny sprites still read at night.
- Oncoming-then-passed NPCs (going AWAY from the player in the mirror) now show their `car_back_*` texture and get simple red brake-light halos at the tail-light housings (cars `0.50`, trucks `0.55`), outer edge of the halo aligned with the outer edge of the sprite. No cones/splash — brake lights are emissive only, they don't project beams onto the road.
- Mirror near-cull bumped to `vz > PLAYER_VIRTUAL_Z` for both `carsBehind` and `copsBehind` — cars only appear in the rearview once they've truly slipped past the player's physical position, so big sprites on the main screen no longer "double-show" enormous in the mirror.

**Oncoming-car headlights, forward view** ([GameScene.js](src/scenes/GameScene.js))
- The OG `drawHeadlights` helper at line ~8995 was painting bright yellow halos at `ly = sy - w * 0.10` (inside the wheel base) for every oncoming car since before this work — those have been disabled. The OG same-direction tail-light pair at the wheel base is also disabled; proper mid-height tail lights come from `_renderHeadlights` instead (cars `0.50`, trucks `0.55`, halo outer edge at `targetW * 0.50 - haloR` so it touches the sprite outer edge).
- New oncoming-car lighting in `_renderHeadlights`: yellow lamp halos at the headlight housings (cars `0.50`, trucks `0.65`), two cones meeting at the centerline at the bottom (outer corners reach the splash equator tips), bottom-half yellow splash whose flat top sits at `coneEndY` (= the widest line of a would-be full ellipse). No upper half = no ADD-blend overlap brightening at the seam.

**Player car beam cleanup** ([GameScene.js](src/scenes/GameScene.js))
- `drawBeamQuad` now clamps each beam's inner toe-in to at most `hubOffset` so left and right halos can't cross the car centerline and create an ADD-blend brighter triangular stripe at the tip.
- Outer halo tip width is sized so each beam's outer-tip edge lands exactly on the road-patch oval's outer edge: `outerOvalHalf = max(outerTipHalf * 0.5, outerTipHalf * 1.2 * patchBoost - hubOffset)`.
- Inner cores now stop at the oval's bottom edge instead of running through it — `drawBeamQuad` takes an optional `tipYOverride`, inner-core calls pass `coreTipY = roadTipY + 4 + 11 * patchBoost`.
- Inner cores thinned: `innerTipHalf = 24 * profile.width` (was `30`).
- Beater's mismatched left bulb gets a cool tint: `asymInner = 0xC0D0DC` (was warm pale yellow `0xE8E2A0`, then briefly the colder `0xB8D0E8`).
- Road shoulder reflectors moved from `±1.25` lane units (outboard in the gravel) onto the fog line itself at `±1.0`.

**Vite 6 upgrade** ([package.json](package.json))
- `vite` `^5.0.0` → `^6.0.0` (resolves to 6.4.2); `@vitejs/plugin-basic-ssl` `^1.2.0` → `^2.0.0` (resolves to 2.3.0) since the 1.x branch only supports Vite 5. Build verified, no behavioral changes — bundle sizes ~480 kB app, ~1.48 MB Phaser.

### 2026-05-29 — Night lighting pass, astronomy model, audio polish, audit cleanup, roadside barriers, finish-line move

**Night lighting pass (multi-day arc on tip)** ([GameScene.js](src/scenes/GameScene.js), [src/utils/Colors.js](src/utils/Colors.js), [src/road/Road.js](src/road/Road.js), [src/road/RouteData.js](src/road/RouteData.js))
- Palette tweaks: Ellensburg grass pushed yellower; new `late_palouse` region (mile 240→293) tweens golden wheat into dried late-summer brown. `REGION_TRAITS.late_palouse` mirrors `palouse` traits so the road geometry doesn't break at the visual boundary.
- Scenery sprites tinted by `TimeOfDay.darkness()` × 55%, with a slight cool bias on the blue channel for moonlight cast. Full night = 45% sprite brightness with a blue lean.
- **Player headlight cones** rebuilt from the ground up over ~10 iterations: two-layer beam (outer halo + inner core) with a road-tip illumination ellipse, origin at mid-sprite (`carY - carH × 0.50`), tip lands on pavement not horizon. Final occlusion uses a `Phaser.Display.Masks.BitmapMask` from the player sprite with `invertAlpha = true` — body silhouette occludes the beam, transparent PNG areas show it through. Depth-ordering alone wasn't enough because the player PNGs have subtle semi-transparency throughout the body.
- **Per-vehicle headlight profiles** in `_vehicleHeadlightProfile(id)`: brightness (0.30 beater → 0.70 playdoutS3X), tip width, central road-pool boost (EVs get wider middle), inner/outer colors (warmer for EVs, neutral for ICE), `asymInner` for the beater's barely-mismatched bulb tint on the left side.
- **NPC same-direction headlights** use a parallel pool of 36 masked Graphics objects, one per `_carSpritePool` slot, each `BitmapMask`-occluded by its NPC sprite. `_drawNpcForwardBeams(slotIdx, t)` is called from inside `_renderVehicles.place()` so the beam Graphics tracks its NPC's mask. NPC peak alpha capped at 0.10 (below the beater's 0.145 core) so the player's beams always dominate.
- **NPC traffic dots** (in shared `headlightGfx`): warm-white halos + cores for oncoming traffic (with a minimum-size floor so distant lights remain visible), red mid-height corner-positioned tail lights for same-direction traffic. Lights cull at `proj.sw < 8` and match the vehicle render's `nearCull` (cockpit 100 / chase 1950) so no orphan glows after a car despawns.
- **Road shoulder reflectors** drawn additively in the headlight gfx, white dots both sides every ~22 segments (~120 ft), darkness-gated.
- **Headlight + reflector + dim-tint together** kick in around mile 130 (start of dusk) and ramp to full at mile 180.

**Astronomical model — moon + Milky Way** ([src/road/Road.js](src/road/Road.js))
- Replaced left-to-right linear arc with proper azimuth/altitude projection assuming east-facing observer.
- **Moon at 3× real speed**: rises ESE (azimuth 110°, altitude 0°) at mile 160, transits Due South at mile 184 (peak altitude 55°), sets West at mile 208. The phase calc starts at -0.10 (mile ~155) with negative altitude so the disc physically rises through the horizon line — ground/landscape graphics drawn after the sky naturally clip the lower half.
- **Milky Way** comes out at mile 215 (7-mile gap after moon set), fades in over 10 miles. Bezier band starts as a low flat NNE→SE arch (faint NNE end at azimuth 22°, bright Sagittarius core at SE/135°). Over the 75 miles to Pullman the core sweeps toward Due South while the band tilts up — implemented as time-varying bezier control points + a midpoint that bulges higher as `mwSky` advances. Core-brightening Gaussian moved from `t=0.55` (middle) to `t=0.88` (near SE/S end) so the bright cluster reads where the spec puts it.

**Audio polish** ([src/systems/AudioSystem.js](src/systems/AudioSystem.js), [src/main.js](src/main.js), [src/scenes/GameScene.js](src/scenes/GameScene.js), [index.html](index.html))
- **Page-level audio unlock via inline `<script>` in index.html `<head>`**: runs before Vite even fetches the module bundle. First user gesture (touchstart / pointerdown / touchend / pointerup / click / mousedown / keydown / keyup on `window` or `document`) creates ONE throwaway AudioContext, plays a 1-second silent buffer, calls `resume()`. iOS Safari + Chrome iOS need the silent-buffer trick — `resume()` alone snaps back to suspended. After success the listeners self-detach, and `window.__audio.init()` boots music immediately so the user hears something even on their first tap.
- **Pause-music ducking**: `setPaused(true)` clamps `audio.volume` DOWN to `PAUSE_DUCK_CEILING = 0.15` (only if it was higher — never raises). Slider always reads `audio.volume`, so the visible position matches what plays (WYSIWYG). User dragging during pause marks `_userTouchedVolumeWhilePaused`; on resume the pre-pause volume restores only if the user didn't override.
- **Perceptual volume curve**: `AudioSystem.volumeToGain(v) = v * v` quadratic. Linear slider feels logarithmic to the ear so 50% sounds like half (not "nearly max").
- **Default volume lowered** 0.32 → 0.20 to address "game runs loud."
- **`_applyMasterGain()` helper** is the single source of truth for the master node — every `_master.gain.value =` write was redirected through it.
- **AudioSystem track-error infinite-recursion safeguard**: `_onTrackEnded()` was synchronously calling `_startTrack()` which re-attached the error handler → tight loop on a bad URL. Added a consecutive-failure counter that bails after 6 fast failures within 1.5s, with the `playing` event resetting the counter on success.

**Roadside crash barriers** ([GameScene.js](src/scenes/GameScene.js))
- Three concentric barriers fire in the speed-math update, after the bridge-rail block:
  - **±2.35 utility pole** — one-shot −10 HP + crash recovery (2s i-frame, 1s hold, ramp to 60), 1.5s cooldown. Active inside `seg.utilityLineSide` runs.
  - **±2.00 fence rail** — sustained −3 HP/sec while in contact, bounces back. Active inside `seg.ruralFence` segments.
  - **±5.50 outer treeline wall** — full crash (−10 HP + recovery, `_postCrashLaneX()` reset). Active past mile 14. **Fires unconditionally regardless of water/bridge flags** so the previous Vantage exploit (water-tagged segment let players drive infinitely off-road on grass) is closed.
- `_applyDamage` already absorbs HP during i-frames, but the lane-clamp and crash-recovery setup fire anyway — so even mid-blink the player gets yanked back to the recovery lane.

**Bushes / shrubs as glances** ([GameScene.js](src/scenes/GameScene.js))
- Shrub collision now goes through `_sceneryGlance(proj, damage, sp)` instead of `_triggerSceneryRespawn`. No crash, no smoke, no respawn. Small HP nick (0.5–1.0), strong lateral push (`xImpulse = ±0.18`), speed clamps to 40 mph through the brush, 200ms i-frame to prevent retrigger.
- Bush sprite stamps with `sp.kickDir` and `sp.kickUntil` — renderer in `_renderSceneSprites` applies `kickPx = (sp.kickDir) * targetW * 0.12 * remain` over 400ms so the shrub visibly leans away from the car then settles back.

**Pullman finish line moved to mile 289** ([src/constants.js](src/constants.js), [src/scenes/GameScene.js](src/scenes/GameScene.js), [src/road/RouteData.js](src/road/RouteData.js))
- Was at mile 279 (`Pullman` city limit) which auto-busted players with 5★+late-clock at the wrong time. Split into two checkpoints: `Pullman` (city limit, mile 279) for the label, and `Pullman, WA` (`isFinish: true`, mile 289) for the actual finish + bust evaluation.
- HARD-mode autocheckpoint gate: at line ~2740 in `GameScene.js`, passing a `CHECKPOINT` marker no longer auto-sets `_lastCheckpoint` when `Difficulty.mode() === 'hard'`. Only pulling off at a rest stop counts as a save point on HARD.
- Pullman Party House landmark relocated from `EASTERN_TOWN_WINDOWS` mile 271-272 to a fresh window at 288.4-289.0 with `homes: 0` so just the landmark spawns next to the finish.
- Mile-279 bust path retained for the case the user IS already at 5★+late when crossing the actual finish at 289 — `_endGame('busted_late')`.

**Crash screen rebuild** ([src/scenes/GameOverScene.js](src/scenes/GameOverScene.js))
- Buttons rewired to match the baked artwork labels: leftmost pink polygon → `_retrySameSettings()` (was `_startOver()`), middle blue → `_restartAtCheckpoint(cp.position)` falling back to retry if no checkpoint (was `_retrySameSettings()`), rightmost white → `_returnToTitle()` (unchanged). Visible labels (RETRY / LOAD SAVE / MAIN MENU) now do what they say.
- Polygon hit zones on Graphics objects → invisible Rectangle game objects sized to the polygon bounding box. Phaser polygon hit testing on Graphics is unreliable on touch (especially iOS Chrome); rectangle hit zones on dedicated game objects are bulletproof.
- Defensive scene-input setup at the top of `create()`: `this.input.setTopOnly(false)`, `this.input.enabled = true`, `this.scene.bringToTop()`. Recovers from edge cases where scene transitions left input disabled on the new scene.

**Bug + dead-code + perf audit pass** (3 parallel agents)
- **Deleted**: `src/road/Road 2.js`, `src/road/Road 3.js` (Finder backup duplicates); lifecycle `console.log` spam in `BootScene.js` and `GameScene.js`; all `.DS_Store` files in `public/assets/**`; the `_stateDebugTxt` debug overlay (was running every frame); the `[F12]` per-init console log.
- **`DEV_WARP` removed then RESTORED** — initially deleted by the audit, then restored after the user clarified that "Release" means actual public/App Store release, not Netlify deploys or beta. Memory note `feedback-dui-skip-ci-does-not-work` and `project-dui-dev-warp-removal` updated to reflect that the cheats stay through every Netlify deploy and the entire beta phase; only strip them for actual ship.
- **Tilt SHUTDOWN reset**: `_tiltShutdownHooked = false` now resets in `init()` so the `events.once(SHUTDOWN, …)` cleanup re-arms across scene-instance reuse. Without this the second-and-later restarts after the first crash left the orient listener leaking.
- **HUD setText diffing**: every per-frame setText on `hudScore / hudHP / hudGas / hudDist / hudSpeed / hudRegion / hudStars / hudRadio / hudPartyClock` now compares `obj.text !== str` before calling setText. Avoids forcing Phaser to rebuild the Text texture each frame when the string hasn't changed. Same diff applied to color setters on HP / gas / party clock.

**Driving-type carousel color-tinted** ([GameScene.js](src/scenes/GameScene.js))
- Title screen "DRIVING TYPE" value label now colors by mode: **THUMBS pink** (`#FF39AF`), **TAP blue** (`#39A8FF`), **TILT red** (`#FF2244`), matching the in-game palette. Stroke and blurb stay unchanged.

**East WA building profiles + utility-run alignment** ([GameScene.js](src/scenes/GameScene.js), [src/road/RouteData.js](src/road/RouteData.js))
- Added rendering profiles for `codex_east_wa_doublewide_tan/_white` and `codex_east_wa_fenced_house_tan/_white` (they were spawning but falling through to the default profile). Doublewides use `widthMult: 2.85` with a low `maxH` so they read as flat single-stories; fenced houses use `heightMult: 2.80–2.85`.
- Two new `EASTERN_UTILITY_RUNS` entries (mile 94.6–96.8 and 270.6–277.0) and extended-end edits on four others so every eastern town window now has a power-line corridor overlapping it. Existing runs gained `nearHomes: true` where they overlap a town so transformer cadence tightens around frontages.

---

### 2026-05-28 — phone-menu tilt fix, steering mode normalization

**Tilt steering from phone menu** ([GameScene.js](src/scenes/GameScene.js), [index.html](index.html), [src/main.js](src/main.js))
- Final root cause: mobile browser motion permission is not consistently exposed on `DeviceOrientationEvent.requestPermission`. Chrome/iOS paths can expose the permission prompt on `DeviceMotionEvent.requestPermission` instead. Checking only `DeviceOrientationEvent` made Tilt appear selected while the browser never delivered useful tilt events.
- `_armTiltPrefetch()` now selects the permission API in this order:
  - `DeviceOrientationEvent.requestPermission`
  - `DeviceMotionEvent.requestPermission`
  - no permission gate → attach `deviceorientation` directly
- The prefetch listener now watches `touchstart`, `pointerdown`, `pointerup`, and `mousedown` on both the Phaser canvas and `document`. This matters because the phone-menu confirm modal is HTML and uses pointer handlers; listening only on the canvas / only to touch could miss the Continue gesture.
- The phone-menu Tilt button writes `titleThumbsPick = 'tilt'` before showing the confirm modal, then restores the prior pick if canceled. This lets the native DOM prefetch know the next gesture is intended to authorize Tilt.
- `window.__steeringMode.set()` now routes live scene changes through `GameScene._setSteeringMode()` instead of only writing `registry.steeringMode`. The direct registry write skipped `_enableTiltSteer()` and could leave the UI selected but no orientation listener attached.
- `_setupTilt()` now reattaches the orientation listener when a scene starts and persisted `steeringMode` is already `tilt`. Without this, a restart/cold-load could have mode=`tilt` with no listener.
- `_setSteeringMode('tilt')` is allowed to run again if mode is already `tilt` but `_tiltAttached` is false. This fixes the “stuck selected, cannot re-arm” state after a failed permission attempt.
- `_tiltSteerAmt` is reset on setup/disable so stale analog input cannot bleed between modes.

**Steering vocabulary cleanup** ([index.html](index.html), [src/main.js](src/main.js), [GameScene.js](src/scenes/GameScene.js), [SaveSystem.js](src/systems/SaveSystem.js))
- Gameplay mode names are:
  - `classic` = L/R two-thumb steering
  - `flappy` = one-thumb tap steering
  - `tilt` = motion steering
- The phone UI previously sent `lr` for L/R while gameplay expected `classic`; the save system also accepted storage names `tap/classic/tilt` while UI/game used `flappy/classic/tilt`. This caused UI highlight, runtime mode, and save-profile selection to drift.
- Phone menu now maps L/R to `classic`. `main.js` and `GameScene._steeringMode()` normalize old values (`lr → classic`, `tap → flappy`). `SaveSystem.setMode()` aliases `flappy → tap` and `lr → classic` for backward-compatible profile buckets.

**Retest notes**
- Use a hard refresh after editing tilt code; stale Vite/client state can keep old registry values around.
- Test Tilt via `https://<LAN-IP>:3000`, not plain `http://`.
- If Tilt appears selected but behaves like L/R, inspect whether `_tiltAttached` is true and whether `steeringMode` is actually `tilt`; the likely failure is permission/listener attachment, not the analog steering branch.

### 2026-05-27 — HUD restructure, crash-recovery rolling start, iOS tilt permission fix, asset cleanup, building auto-flip

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
