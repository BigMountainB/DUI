import Phaser from 'phaser';
import {
  SCREEN_W, SCREEN_H, DRUGS, DRUG_CONFIG,
  VEHICLES, REST_STOPS,
  GAS_USD_PER_MI, CHARGE_COST_FACTOR, GAS_ROBBERY_CHANCE, GAS_ROBBERY_FRAC,
} from '../constants.js';
import { Difficulty } from '../systems/Difficulty.js';

const CX = SCREEN_W / 2;
const IMPACT = 'Impact, "Arial Black", Arial, sans-serif';

// Drug texture key — alcohol's pickup asset is named drug_beer; everything
// else maps directly.
const DRUG_TEX = (id) => (id === 'alcohol' ? 'drug_beer' : `drug_${id}`);

// Per-drug rest-stop pricing — each click adds +10 % to that bar, capped
// at 80 %.  Prices scaled so 8 clicks (0 → 80 %) costs roughly the same
// as the old single +50 % click did.
const DRUG_PRICE = {
  alcohol:  80,  weed:   80,   cocaine: 220,  shrooms: 140,
  lsd:     180,  heroin: 280,  rx:      180,  fentanyl: 360,
  ketamine:260,  meth:   300,
};

const DRUG_DISPLAY = (id) => DRUG_CONFIG[id]?.label?.replace(/^[^A-Za-z]+/, '').trim() ?? id;

const drugItems = (unlocks /* { id: bool } | Set<id> | null */) => {
  const items = [
    { id: 'coffee',     label: 'COFFEE',           emoji: '☕',
      cost: 5000, desc: 'Reduces all drug bars 50%', payload: { reduceDrugs: 0.5 } },
    { id: 'snooze',     label: 'TAKE A SNOOZE',    emoji: '😴',
      cost: 10000, desc: 'Reduces all drug bars 100%', payload: { reduceDrugs: 0 } },
    { id: 'top_all_50', label: 'TOP UP ALL TO 50%', emoji: '⬆️',
      cost: 2500, desc: 'Every unlocked bar to ≥50 %', payload: { topAllTo: 0.5 } },
  ];
  // Drug unlocks are stored in the registry by DrugSystem.snapshotUnlocks
  // as a PLAIN OBJECT { alcohol: true, weed: true, shrooms: true, ... },
  // not a Set.  Accept either form so the filter works regardless.
  const isUnlocked = (id) => {
    if (unlocks instanceof Set) return unlocks.has(id);
    if (unlocks && typeof unlocks === 'object') return !!unlocks[id];
    return !!DRUG_CONFIG[id]?.unlocked;
  };
  for (const id of Object.values(DRUGS)) {
    if (!isUnlocked(id)) continue;
    items.push({
      id:    `drug_${id}`,
      label: DRUG_DISPLAY(id).toUpperCase(),
      icon:  DRUG_TEX(id),
      cost:  DRUG_PRICE[id] ?? 200,
      desc:  '+10 % to this bar (cap 80 %)',
      payload: { drugTopUp: id, amount: 0.10 },
    });
  }
  return items;
};

// Per-shop drug allow-lists.  Each shop sells a small subset; the item
// only appears if the player has ALREADY sampled the drug at least
// once (pickupCounts[drug] > 0).  Camp / charging / gas / hunting /
// dealer each have their own personality (sketchy back-country deals,
// EV-station hippie shrooms, dive-bar beer at gas pumps, etc.).
//
// PharmaBros at the rest-stop drug tab keeps the full menu (the
// pharmacy is the dedicated drug shop and isn't gated by exposure).
const SHOP_DRUGS = {
  gas:     ['alcohol', 'weed'],                       // Beer + weed at the pump
  hunting: ['alcohol'],                               // Beer at the gun store
  charge:  ['shrooms', 'lsd', 'weed'],                // Hippie EV crowd
  camp:    ['fentanyl', 'ketamine', 'meth'],          // Sketchy back-country
  dealer:  ['cocaine'],                               // Dealership = blow
};
// Camp + charging + dealer charge a 2.5× markup over PharmaBros.
const SHOP_DRUG_MARKUP = 2.5;

function shopDrugItems(shopKey, pickupCounts) {
  const allow = SHOP_DRUGS[shopKey] ?? [];
  const out = [];
  for (const id of allow) {
    if (!pickupCounts || (pickupCounts[id] ?? 0) <= 0) continue;
    const base = DRUG_PRICE[id] ?? 200;
    const cost = Math.round(base * SHOP_DRUG_MARKUP);
    out.push({
      id:    `shopdrug_${id}`,
      label: DRUG_DISPLAY(id).toUpperCase(),
      icon:  DRUG_TEX(id),
      cost,
      desc:  '+10% to this bar (markup vs PharmaBros)',
      payload: { drugTopUp: id, amount: 0.10 },
    });
  }
  return out;
}

// Vehicle catalog items for the DEALER tab — derived from VEHICLES.
// `fuelFilter` (optional) restricts the list to gas-only or electric-only
// so SUCK Dealership (east, gas) and Lord Motors (west, electric) sell
// distinct inventories per the user's spec.
function dealerVehicleItems(fuelFilter = null) {
  const out = [];
  for (const v of Object.values(VEHICLES)) {
    if (v.priceUsd == null || v.priceUsd <= 0) continue;
    if (fuelFilter && v.fuel !== fuelFilter) continue;
    out.push({
      id: `veh_${v.id}`,
      label: `🚗  ${v.label}`,
      cost: v.priceUsd,
      desc: `${v.hp} HP · ${v.rangeMi} mi · ${v.topMph} mph · ${v.drive} · ${v.fuel}`,
      payload: { buyVehicle: v.id },
    });
  }
  return out;
}

const SECTIONS = {
  // Existing drug menu — kept as a 5th tab; not part of the 4 sign panels
  // but it's been at rest stops since launch and the player still buys
  // drugs from inside the brown sign.
  drugs: {
    label: '💊  DRUGS',
    items: drugItems(null),
  },
  // ── 4-panel highway-services sections (match the rest stop sign) ──
  gas: {
    label: '⛽  GAS',
    // items[] populated dynamically in create() because refuel cost is
    // a function of the player's current gas tank.
    items: [],
  },
  hunting: {
    label: '🦌  HUNTING',
    items: [
      { id: 'gun',     label: 'PISTOL',          icon: 'weapon_gun',         cost: 1500, desc: '+6 bullets',                                payload: { f12: 'gun' } },
      { id: 'rocket',  label: 'ROCKET LAUNCHER', icon: 'weapon_rocket',      cost: 2250, desc: '+1 directional rocket',                     payload: { f12: 'rocket' } },
      { id: 'spike',   label: 'SPIKE STRIP',     icon: 'weapon_spike_strip', cost:  500, desc: '+1 rear strip — heat goes UP (max 3)',      payload: { f12: 'spike_strip', spikeHeat: true } },
      { id: 'paint',   label: 'PAINT BOMB',      icon: 'weapon_paint_bomb',  cost: 1000, desc: '+1 directional bomb',                       payload: { f12: 'paint_bomb' } },
      { id: 'camo',    label: '🥷  CAMOUFLAGE',  cost: 1500, desc: 'Single-use: clears 2 stars on resume',                                  payload: { camouflage: true } },
    ],
  },
  camp: {
    label: '🏕  CAMP',
    items: [
      { id: 'hitch',    label: '🧍  PICK UP HITCHHIKER',  cost:   0, desc: 'Free — but it\'s a gamble',                              payload: { hitchhike: true } },
      { id: 'sleep',    label: '😴  SLEEP IT OFF',         cost: 500, desc: 'Watch ad (5s); −25% on every drug; party-clock penalty', payload: { sleep: true,  reduceDrugs: 0.75 } },
      { id: 'coffee',   label: '☕  COFFEE',                cost: 150, desc: '−50% on every drug',                                     payload: { coffee: true, reduceDrugs: 0.50 } },
      { id: 'campfix',  label: '🔧  CAMP REPAIR',          cost: 500, desc: 'Repair up to 65% HP (cheaper than dealership)',          payload: { campRepair: true } },
      { id: 'sexworker',label: '💋  PAY A SEX WORKER FOR HER TIME', cost: 2000, desc: '1-in-10 chance she has dirt on a politician (no >2★ for 100 mi)', payload: { sexworker: true } },
    ],
  },
  // DEALER's landing tile opens a chooser screen (see _showDealerChooser)
  // that branches to dealer_cars or dealer_acc.  The `dealer` section
  // here is intentionally items:[] — its placard is the entry point for
  // the chooser, not a sub-menu of its own.
  dealer: {
    label: '🏬  DEALER',
    items: [],
  },
  dealer_acc: {
    label: '🔧  ACCESSORIES',
    items: [],   // populated dynamically per-vehicle in create()
  },
  dealer_cars: {
    label: '🚗  CARS',
    items: [],   // populated dynamically per-stop in create()
  },
};

// Landing tab order (5 brand placards).  dealer_acc / dealer_cars are
// reached via the Dealer chooser, not the landing.
const TAB_ORDER = ['gas', 'hunting', 'camp', 'dealer', 'drugs'];
const ALL_SECTIONS = ['gas', 'hunting', 'camp', 'dealer', 'dealer_acc', 'dealer_cars', 'drugs'];

// Charger availability — west-side rest stops carry the CarGo brand
// which sells both gas AND charging.  East-side stops are Huff's,
// gas only (per user spec).  REST_STOPS is canonical order; west = the
// first three (Bellevue / Issaquah / North Bend) by mile.
function hasCharger(stopId) {
  const rs = REST_STOPS.find(r => r.id === stopId);
  return !!(rs && rs.mileage < 100);
}

// Per-stop brand catalog — west-side gets the cleaner brands (CarGo +
// Lord Motors EV), east-side the dustier set (Huff's + Sam's gas).
// CowBella, AOK Camp, and PharmaBros are universal.  Returned object
// has every brand key; the landing screen filters by stop.amenities to
// decide which placards actually render.
function brandsForStop(stop) {
  const isWest = (stop?.mileage ?? 0) < 100;
  return {
    gas: isWest
      ? { name: 'CarGo',       logo: 'biz_cargo' }
      : { name: "Huff's Gas",  logo: 'biz_huffs' },
    hunting: { name: 'CowBella',   logo: 'biz_cowbellas' },
    camp:    { name: 'AOK Camp',   logo: 'biz_aok' },
    dealer:  isWest
      ? { name: 'Lord Motors',          logo: 'biz_lord', carFuel: 'electric' }
      : { name: "Sam's Used Car Kingdom", logo: 'biz_suck', carFuel: 'gas' },
    drugs:   { name: 'PharmaBros', logo: 'biz_pharmabros' },
  };
}

// Per-rest-stop NPC vignettes — 3 lines each, randomly picked on entry.
// Builds the "party crowd" lore as the player progresses east.  All ten
// rest stops keyed by their IDs (B, I, N, C, E, V, Y, O, W, L).
const VIGNETTES = {
  B: [   // Bellevue
    'Tell Mike I\'ll be there as soon as I find my keys.',
    'Bellevue Square parking lot, 11pm — bring the good stuff.',
    'My ex works at the bank — no, the OTHER bank.',
  ],
  I: [   // Issaquah
    'Saw two cops at the QFC on 17th. Take the back roads.',
    'Did you grab the salmon? It\'s a Pullman tradition.',
    'My cousin\'s couch is open if you blow the clock.',
  ],
  N: [   // North Bend
    'Twin Peaks reruns at the diner — order pie, not the coffee.',
    'Snow chains on sale next door. Just sayin\'.',
    'The pass is closing in three hours. MOVE.',
  ],
  C: [   // Cle Elum
    'You driving?? You\'re WASTED.',
    'Bakery\'s got those salted-caramel things. Ten minutes max.',
    'My truck broke down. Five star, no luck.',
  ],
  E: [   // Ellensburg
    'WSU rivalry game tonight — half of Pullman is on this road already.',
    'Coffee\'s on. You look like hell.',
    'Watch for state troopers around Kittitas. They love a quota.',
  ],
  V: [   // Vantage
    'The bridge view is unreal. Don\'t crash into it.',
    'Last gas before the basin. I\'m serious.',
    'Wind\'s up — mind the trailer.',
  ],
  Y: [   // Royal City
    'Free apples in the orchard, just don\'t get caught.',
    'My uncle says the cops here all play poker on Friday nights.',
    'It\'s gonna be a desert sunset. Floor it.',
  ],
  O: [   // Othello
    'Mexican food at the truck stop — life-changing.',
    'You missed Royal? They had cocaine.',
    'Watch for combines on 26 — those things are rolling roadblocks.',
  ],
  W: [   // Washtucna
    'Population: 200. Cop: 1. Don\'t test him.',
    'My grandma made cookies for the party. Don\'t eat them all.',
    'Last shower in 50 miles. Fair warning.',
  ],
  L: [   // La Crosse
    'Almost there. Don\'t blow it now.',
    'Everyone\'s asking where the f— you are.',
    'Pullman\'s lit up like a Christmas tree tonight.',
  ],
};

function pickVignette(stopId) {
  const lines = VIGNETTES[stopId];
  if (!lines?.length) return null;
  return lines[Math.floor(Math.random() * lines.length)];
}

export class RestStopScene extends Phaser.Scene {
  constructor() { super({ key: 'RestStop' }); }

  init(data) {
    this._stop     = data?.stop     ?? { id: '?', name: 'Rest Stop' };
    this._code     = data?.code     ?? '????';
    this._score    = data?.score    ?? 0;
    this._stars    = data?.stars    ?? 0;
    this._position = data?.position ?? 0;
    this._odometer = data?.odometer ?? 0;
    // Drug-bar snapshot — drug status pauses at the rest stop and resumes
    // from these levels.  COFFEE / SNOOZE multiply, drug top-ups stack on
    // top.  Just stopping doesn't change anything anymore.
    this._drugLevelsAtEntry = data?.drugLevelsAtEntry ?? {};
    // Car durability — preserved by default so the rest stop doesn't
    // silently heal damage; REPAIR CAR sets it to 100.
    this._durabilityAtEntry = data?.durabilityAtEntry ?? 100;
    // Mutated as the player buys things; passed to GameScene on continue.
    this._purchases = {
      repair: false, restock: false, clearStars: false,
      scoreBonus: 0, upgrade: [], f12: [],
      // Default preserves the entry drug levels verbatim.
      drugLevelsOnResume: { ...this._drugLevelsAtEntry },
      // Default preserves the entry durability; REPAIR CAR overrides to 100.
      durabilityOnResume: this._durabilityAtEntry,
    };
    // Player's current vehicle + tank state — passed in by GameScene so
    // we can price refuel/charge based on missing range and gate dealer
    // vehicle purchases by what's already owned.
    this._vehicleId    = data?.vehicleId    ?? 'beater';
    this._gasMi        = data?.gasMi        ?? 0;
    this._gasMaxMi     = data?.gasMaxMi     ?? 250;
    this._ownedVehicles = data?.ownedVehicles ?? ['beater'];
    this._drugPickupCounts = data?.drugPickupCounts ?? {};
    this._activeTab     = 'gas';
    this._activeSection = null;
    this._screenStack   = ['landing'];
    this._tabContent    = {};
    this._sectionContainers = null;
    this._sectionScroll     = null;
    this._sectionContentH   = null;
    this._landingObjs       = null;
    this._dealerChooserObjs = null;
    this._buttonRefresh = [];
    // CRITICAL: Phaser reuses the RestStopScene instance, so we have to
    // explicitly clear stateful flags that survive between visits.
    // `_continuing` was leaking from the first stop's HIT THE ROAD click,
    // which made the second visit's button silently no-op.  Same kind of
    // bug as GameScene's `_takingExit`.
    this._continuing    = false;
    this._statusTimer   = null;
    this._tabBgs        = null;
    this._tabLbs        = null;
    this._scoreText     = null;
    this._statusText    = null;
  }

  create() {
    // Stamp visit-start time so _continue() can compute the real-time
    // penalty (× 0.5 deducted from party clock) when the player leaves.
    this._sceneStartTime = Date.now();
    this.cameras.main.setBackgroundColor(0x110A05);

    // Rebuild the drugs section using THIS player's unlock state — the
    // module-level SECTIONS.drugs.items was computed at import time
    // before the registry existed, so it would show every drug.
    SECTIONS.drugs.items = drugItems(this.registry?.get?.('drugUnlocks'));

    // ── GAS section: dynamic pricing ─────────────────────────────────
    // Refuel cost = missing miles × $0.333.  Charge cost = 35% of that
    // (only at chargers — every other rest stop).  Pre-tax preview;
    // robbery roll happens on confirm.
    const _missingMi = Math.max(0, this._gasMaxMi - this._gasMi);
    const _refuelCost = Math.max(1, Math.round(_missingMi * GAS_USD_PER_MI));
    const _chargeCost = Math.max(1, Math.round(_refuelCost * CHARGE_COST_FACTOR));
    const _isCharger  = hasCharger(this._stop?.id);
    const _vehFuel    = VEHICLES[this._vehicleId]?.fuel ?? 'gas';
    // Display gallons needed, rounded UP to the nearest 1/4 gal.
    // Game economy: $10 per 30 mi = $10/gal at 30 mpg, so 30 mi = 1 gal.
    const _galRaw     = _missingMi / 30;
    const _galDisplay = Math.ceil(_galRaw * 4) / 4;
    const gasItems = [];
    if (_missingMi > 0) {
      gasItems.push({
        id: 'refuel', label: '⛽  REFUEL',
        cost: _refuelCost,
        desc: `Fill tank (${_galDisplay} gal / +${_missingMi} mi). 10% chance of robbery (-${Math.round(GAS_ROBBERY_FRAC*100)}% cash).`,
        payload: { refuel: true, refuelMi: _missingMi },
      });
    } else {
      gasItems.push({
        id: 'refuel', label: '⛽  TANK FULL',
        cost: 0,
        desc: 'No refuel needed.',
        payload: {},
      });
    }
    if (_isCharger) {
      gasItems.push({
        id: 'charge', label: '🔌  FAST CHARGE',
        cost: _chargeCost,
        desc: _vehFuel === 'electric'
          ? `Watch ad (5s) + party-clock penalty. Cheaper but slower.`
          : `Available — but your vehicle is gas-powered.`,
        payload: _vehFuel === 'electric' ? { charge: true, chargeMi: _missingMi } : {},
      });
    } else {
      gasItems.push({
        id: 'charge', label: '🔌  NO CHARGER',
        cost: 0, desc: 'This stop has gas only.',
        payload: {},
      });
    }

    // ── Quart of 710 Oil — +15 HP top-up.  "710" = "OIL" upside down. ──
    const _vehMaxHp     = VEHICLES[this._vehicleId]?.hp ?? 100;
    const _hpAtEntry    = this._durabilityAtEntry ?? _vehMaxHp;
    const _hpAlreadyMax = _hpAtEntry >= _vehMaxHp;
    if (_hpAlreadyMax) {
      gasItems.push({
        id: 'oil_710', label: '🛢  710 OIL',
        cost: 0, desc: 'HP already maxed.',
        payload: {},
      });
    } else {
      gasItems.push({
        id: 'oil_710', label: '🛢  ADD A QUART OF 710 OIL',
        cost: 50,
        desc: `+15 HP (capped at ${_vehMaxHp} max).`,
        payload: { oil710: true },
      });
    }

    SECTIONS.gas.items = gasItems;

    // ── DEALER_CARS: build region-filtered vehicle catalog ──────────
    const _stopBrands = brandsForStop(this._stop);
    const _carFuel    = _stopBrands.dealer.carFuel;
    SECTIONS.dealer_cars.items = dealerVehicleItems(_carFuel).filter(
      it => !this._ownedVehicles.includes(it.payload.buyVehicle)
    );
    SECTIONS.dealer_cars.label = `🚗  CARS — ${_stopBrands.dealer.name}`;

    // ── DEALER_ACC: per-vehicle accessory shop ──────────────────────
    // Repair + Paint are always available.  Bumper, Traction, and NOS
    // are filtered against the CURRENT vehicle's accessory state so
    // already-installed items disappear (and NOS shows the next tier's
    // price + a tier indicator).
    const _save = this.registry?.get?.('save');
    const _accAll = _save?.get?.('accessories') ?? {};
    const _vAcc   = _accAll[this._vehicleId] ?? {};
    const _vHasBumper   = !!_vAcc.bumper;
    const _vHasTraction = !!_vAcc.traction;
    const _vNosTier     = Math.max(0, Math.min(3, _vAcc.nos ?? 0));
    const NOS_PRICES = [5000, 10000, 15000];

    const accItems = [
      { id: 'repair',  label: '🔧  REPAIR CAR', cost: 1000,
        desc: 'Restore full health', payload: { repair: true } },
      { id: 'paint',   label: '🎨  PAINT JOB',  cost: 4500,
        desc: 'Drops ALL stars — only way out from under a 5★ chopper.',
        payload: { clearStars: true } },
    ];
    if (_vNosTier < 3) {
      const nextTier = _vNosTier + 1;
      accItems.push({
        id: 'nos', label: `⚡  NOS UPGRADE — LV ${nextTier}`,
        cost: NOS_PRICES[_vNosTier],
        desc: `+5 mph cruise & boost (total +${nextTier * 5}).`,
        payload: { vehicleAccessory: 'nos' },
      });
    }
    if (!_vHasBumper) {
      accItems.push({
        id: 'armor', label: '🛡  REINFORCED BUMPER', cost: 3500,
        desc: 'Take 20% less crash damage on this vehicle.',
        payload: { vehicleAccessory: 'bumper' },
      });
    }
    if (!_vHasTraction) {
      accItems.push({
        id: 'traction', label: '❄️  TRACTION TIRES', cost: 2500,
        desc: '−40% slide penalty on any car (−100% with 4x4).',
        payload: { vehicleAccessory: 'traction' },
      });
    }
    SECTIONS.dealer_acc.items = accItems;

    // ── Per-shop drug menus (gated by pickupCounts on registry) ────
    // Each shop keeps its base items + appends the drugs it sells (only
    // for drugs the player has already sampled on the road).
    const _pickupCounts = this.registry.get('drugPickupCounts')
      ?? this._drugPickupCounts ?? {};
    SECTIONS.gas.items     = [...SECTIONS.gas.items,     ...shopDrugItems('gas',     _pickupCounts)];
    SECTIONS.hunting.items = [...SECTIONS.hunting.items, ...shopDrugItems('hunting', _pickupCounts)];
    SECTIONS.camp.items    = [...SECTIONS.camp.items,    ...shopDrugItems('camp',    _pickupCounts)];
    SECTIONS.dealer_acc.items = [...SECTIONS.dealer_acc.items, ...shopDrugItems('dealer', _pickupCounts)];
    // Charging-station drugs only appear if the stop actually has a
    // charger (CarGo west-side stops); add to the gas tab so they
    // sit alongside refuel/charge.
    if (_isCharger) {
      // Dedupe against gas shop's own drugs — weed overlaps both pools
      // and the user was seeing it listed twice at chargers.
      const _alreadyListed = new Set(SECTIONS.gas.items.map(it => it.id));
      const _chargeExtras  = shopDrugItems('charge', _pickupCounts)
        .filter(it => !_alreadyListed.has(it.id));
      SECTIONS.gas.items = [...SECTIONS.gas.items, ..._chargeExtras];
    }

    // ── Background — blue highway services sign ─────────────────────
    // Mimics the real-world blue services placard (the user's reference
    // image): big blue panel with a thick white border, an "EXIT N"
    // tab top-right, and white panel dividers between the four
    // service categories.  Brand-logo placards are rendered per-button
    // by _makeButton.
    this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x07111F).setOrigin(0);
    // Main sign body — services blue.
    this.add.rectangle(20, 18, SCREEN_W - 40, SCREEN_H - 36, 0x1E5BB8).setOrigin(0)
      .setStrokeStyle(4, 0xFFFFFF);
    // Subtle highlight band at the top edge of the sign for depth.
    this.add.rectangle(24, 22, SCREEN_W - 48, 4, 0x4789D8).setOrigin(0);
    // EXIT-NUMBER tab — small white-bordered panel sitting OUTSIDE the
    // top-right corner of the main sign, like the reference image.
    {
      const _exitMile = this._stop?.mileage ?? '';
      const tabW = 130, tabH = 38;
      const tabX = SCREEN_W - 30 - tabW;
      const tabY = 0;
      this.add.rectangle(tabX, tabY, tabW, tabH, 0x1E5BB8).setOrigin(0)
        .setStrokeStyle(3, 0xFFFFFF);
      this.add.text(tabX + tabW / 2, tabY + tabH / 2, `EXIT ${_exitMile}`, {
        fontSize: '20px', fontFamily: IMPACT,
        color: '#FFFFFF', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5);
    }

    // ── Title ────────────────────────────────────────────────────────────
    this.add.text(CX, 30, `${this._stop.name.toUpperCase()}`, {
      fontSize: '18px', fontFamily: IMPACT,
      color: '#FFEEAA', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 0);

    // ── Save code ─────────────────────────────────────────────────────────
    this.add.text(40, 56, 'SAVE CODE', {
      fontSize: '10px', fontFamily: 'Arial', color: '#FFCC66',
    }).setOrigin(0, 0);
    const codeText = this.add.text(40, 67, this._code, {
      fontSize: '24px', fontFamily: IMPACT, letterSpacing: 4,
      color: '#FFEE00', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0, 0);
    this.tweens.add({ targets: codeText, alpha: 0.7, duration: 900, yoyo: true, repeat: -1 });

    // ── Score header ─────────────────────────────────────────────────────
    this._scoreText = this.add.text(SCREEN_W - 30, 60, '', {
      fontSize: '15px', fontFamily: IMPACT, color: '#FFEE00',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(1, 0);
    this._refreshScore();

    // ── NPC vignette — flavor one-liner picked from per-stop pool ──
    const vignette = pickVignette(this._stop?.id);
    if (vignette) {
      this.add.text(SCREEN_W / 2, 90, `“${vignette}”`, {
        fontSize: '12px', fontFamily: 'Arial, sans-serif',
        color: '#CCCCCC', stroke: '#000', strokeThickness: 2,
        align: 'center', wordWrap: { width: SCREEN_W - 80 },
      }).setOrigin(0.5, 0);
    }

    // ── Landing screen — 5 brand-style category placards ──────────────
    // Mimics the highway services sign: each section is a white-bordered
    // placard with the category title + brand name, laid out in a grid
    // inside the blue sign.  Click a placard → drill into its sub-menu.
    const contentY = 110;
    const contentH = SCREEN_H - contentY - 60;
    this._contentX = 40;
    this._contentY = contentY;
    this._contentW = SCREEN_W - 80;
    this._contentH = contentH;

    // Brand logo + label per landing tile, region-aware via brandsForStop.
    const stopBrands = brandsForStop(this._stop);
    // Filter the landing tiles to only the amenities present at this
    // stop (per the REST_STOPS amenities field).  A camp-only stop now
    // shows just the Camp tile; Pullman shows all 5.  Falls back to
    // showing every tile if the stop doesn't carry an amenities list.
    const stopAmenities = this._stop?.amenities;
    const visibleTabs = Array.isArray(stopAmenities) && stopAmenities.length
      ? TAB_ORDER.filter(k => stopAmenities.includes(k))
      : TAB_ORDER;

    // Layout grid sizes to fit visible tile count (1-5 tiles).  Single-
    // tile stops get a big centered placard; multi-tile stays 3×2.
    const tileN = visibleTabs.length;
    const cols  = tileN <= 1 ? 1 : (tileN <= 4 ? 2 : 3);
    const rows  = Math.ceil(tileN / cols);
    const gap   = 14;
    const cellW = (this._contentW - gap * (cols - 1)) / cols;
    const cellH = (this._contentH - gap * (rows - 1)) / rows;
    this._landingObjs = [];
    visibleTabs.forEach((key, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const cx = this._contentX + c * (cellW + gap);
      const cy = this._contentY + r * (cellH + gap);
      const brand = stopBrands[key] ?? { name: key, logo: null };
      // White-bordered placard (Olive Garden / Red Lobster style).
      const card = this.add.rectangle(cx, cy, cellW, cellH, 0xFFFFFF, 1)
        .setOrigin(0, 0).setStrokeStyle(3, 0xFFFFFF)
        .setInteractive({ useHandCursor: true });
      this._landingObjs.push(card);

      // Brand LOGO image — fills most of the placard, leaving room
      // below for the category label.  Falls back to a colored accent
      // strip + brand-name text when the logo asset isn't loaded.
      const logoArea = { x: cx + 6, y: cy + 6, w: cellW - 12, h: Math.round(cellH * 0.62) };
      if (brand.logo && this.textures.exists(brand.logo)) {
        const img = this.add.image(logoArea.x + logoArea.w / 2, logoArea.y + logoArea.h / 2, brand.logo)
          .setOrigin(0.5);
        const tex = this.textures.get(brand.logo).source[0];
        const baseW = tex?.width || logoArea.w;
        const baseH = tex?.height || logoArea.h;
        const k = Math.min(logoArea.w / baseW, logoArea.h / baseH);
        img.setDisplaySize(baseW * k, baseH * k);
        this._landingObjs.push(img);
      } else {
        const accentFor = { gas: 0xFFCC22, hunting: 0x6E3F1A, camp: 0x2E7A35, dealer: 0xCC1122, drugs: 0x9A36CC };
        const accent = accentFor[key] ?? 0x888888;
        const strip = this.add.rectangle(logoArea.x, logoArea.y, logoArea.w, logoArea.h, accent, 1)
          .setOrigin(0, 0);
        const t = this.add.text(logoArea.x + logoArea.w / 2, logoArea.y + logoArea.h / 2, brand.name, {
          fontSize: '17px', fontFamily: IMPACT, color: '#FFFFFF',
          stroke: '#000', strokeThickness: 3, wordWrap: { width: logoArea.w - 8 }, align: 'center',
        }).setOrigin(0.5);
        this._landingObjs.push(strip, t);
      }

      // Category label on the lower strip of the placard.
      const catLabel = this.add.text(cx + cellW / 2, cy + cellH - Math.round(cellH * 0.12),
        SECTIONS[key].label.replace(/^[^A-Za-z]+/, '').trim(), {
        fontSize: '16px', fontFamily: IMPACT,
        color: '#1E5BB8', stroke: '#FFFFFF', strokeThickness: 2,
      }).setOrigin(0.5);
      this._landingObjs.push(catLabel);

      card.on('pointerover', () => card.setFillStyle(0xF0E8C0));
      card.on('pointerout',  () => card.setFillStyle(0xFFFFFF));
      card.on('pointerdown', (ptr) => {
        ptr.event?.stopPropagation?.();
        // DEALER tile opens the Cars / Accessories chooser instead of
        // a flat sub-menu; everything else drills directly into its list.
        if (key === 'dealer') this._showDealerChooser();
        else                  this._showSection(key);
      });
    });

    // ── Sub-menus — built once, hidden until a placard is clicked ────
    // Each section's items live in a Phaser Container with a geometry
    // mask so long lists (DEALER) scroll INSIDE the sign instead of
    // bleeding past the border.  Includes dealer_acc and dealer_cars
    // (the two screens the DEALER chooser drills into).
    this._sectionContainers = {};
    this._sectionScroll     = {};
    this._sectionContentH   = {};
    for (const key of ALL_SECTIONS) {
      // Skip the chooser's own placeholder section (no items).
      if (key === 'dealer') continue;
      const container = this.add.container(0, 0).setVisible(false);
      const items = this._buildTabContent(key, this._contentX, this._contentY, this._contentW, this._contentH);
      for (const obj of items) {
        if (obj && obj.setVisible) obj.setVisible(true);
        container.add(obj);
      }
      const maskGfx = this.make.graphics({ x: 0, y: 0, add: false });
      maskGfx.fillStyle(0xFFFFFF);
      maskGfx.fillRect(this._contentX - 4, this._contentY - 4,
                       this._contentW + 8, this._contentH + 8);
      container.setMask(maskGfx.createGeometryMask());
      this._sectionContainers[key] = container;
      this._sectionScroll[key]     = 0;
      const itemCount = SECTIONS[key].items.length;
      const colsK = key === 'drugs' ? 2 : 1;
      const rowsK = Math.ceil(itemCount / colsK);
      const itemH = Math.min(56, Math.max(30, (this._contentH - (rowsK - 1) * 6) / rowsK));
      this._sectionContentH[key] = rowsK * (itemH + 6) - 6;
    }

    // ── DEALER chooser — two big tiles: Cars / Accessories ──────────
    this._dealerChooserObjs = [];
    {
      const tileW = (this._contentW - 14) / 2;
      const tileH = this._contentH * 0.6;
      const tileY = this._contentY + (this._contentH - tileH) / 2;
      const choices = [
        { key: 'dealer_cars', title: 'CARS',        sub: stopBrands.dealer.name, color: 0x1E5BB8 },
        { key: 'dealer_acc',  title: 'ACCESSORIES', sub: 'Repair · Paint · Tires', color: 0x4A6E3F },
      ];
      choices.forEach((ch, i) => {
        const tx = this._contentX + i * (tileW + 14);
        const card = this.add.rectangle(tx, tileY, tileW, tileH, 0xFFFFFF, 1)
          .setOrigin(0, 0).setStrokeStyle(3, 0xFFFFFF)
          .setInteractive({ useHandCursor: true });
        const strip = this.add.rectangle(tx, tileY, tileW, Math.round(tileH * 0.55), ch.color, 1)
          .setOrigin(0, 0);
        const lbl = this.add.text(tx + tileW / 2, tileY + Math.round(tileH * 0.27), ch.title, {
          fontSize: '32px', fontFamily: IMPACT,
          color: '#FFFFFF', stroke: '#000', strokeThickness: 5,
        }).setOrigin(0.5);
        const sub = this.add.text(tx + tileW / 2, tileY + Math.round(tileH * 0.78), ch.sub, {
          fontSize: '14px', fontFamily: IMPACT,
          color: '#222222', stroke: '#FFFFFF', strokeThickness: 2,
        }).setOrigin(0.5);
        card.on('pointerover', () => card.setFillStyle(0xF0E8C0));
        card.on('pointerout',  () => card.setFillStyle(0xFFFFFF));
        card.on('pointerdown', (ptr) => {
          ptr.event?.stopPropagation?.();
          this._showSection(ch.key, /* parent: */ 'dealer');
        });
        this._dealerChooserObjs.push(card, strip, lbl, sub);
      });
      for (const o of this._dealerChooserObjs) o.setVisible(false);
    }

    // ── BACK button (shown only on sub-menus) ────────────────────────
    {
      const bx = this._contentX, by = contentY - 32;
      this._backBtnBg = this.add.rectangle(bx, by, 80, 26, 0xFFFFFF, 1)
        .setOrigin(0, 0).setStrokeStyle(2, 0x000000)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);
      this._backBtnLbl = this.add.text(bx + 40, by + 13, '← BACK', {
        fontSize: '13px', fontFamily: IMPACT, color: '#1E5BB8',
      }).setOrigin(0.5).setVisible(false);
      this._backBtnBg.on('pointerover', () => this._backBtnBg.setFillStyle(0xF0E8C0));
      this._backBtnBg.on('pointerout',  () => this._backBtnBg.setFillStyle(0xFFFFFF));
      this._backBtnBg.on('pointerdown', () => this._popScreen());
      // Section header text — repurposed when a sub-menu opens.
      this._sectionHeader = this.add.text(this._contentX + this._contentW / 2, by + 13, '', {
        fontSize: '15px', fontFamily: IMPACT,
        color: '#FFFFFF', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setVisible(false);
    }

    // ── Wheel + drag scroll for sub-menus ────────────────────────────
    this.input.on('wheel', (_p, _go, _dx, dy) => {
      if (!this._activeSection) return;
      this._scrollSection(this._activeSection, dy * 0.5);
    });
    let dragStartY = null;
    this.input.on('pointerdown', (ptr) => {
      if (!this._activeSection) return;
      // Only start drag if the press lands in the content area.
      if (ptr.x < this._contentX || ptr.x > this._contentX + this._contentW) return;
      if (ptr.y < this._contentY || ptr.y > this._contentY + this._contentH) return;
      dragStartY = ptr.y;
      this._dragStartScroll = this._sectionScroll[this._activeSection] ?? 0;
    });
    this.input.on('pointermove', (ptr) => {
      if (dragStartY == null || !this._activeSection) return;
      if (!ptr.isDown) { dragStartY = null; return; }
      const dy = ptr.y - dragStartY;
      this._setSectionScroll(this._activeSection, this._dragStartScroll - dy);
    });
    this.input.on('pointerup', () => { dragStartY = null; });

    this._showLanding();

    // ── HIT THE ROAD button ─────────────────────────────────────────────
    const contY = SCREEN_H - 30;
    const cont  = this.add.rectangle(CX, contY, 240, 36, 0x44AA44)
      .setStrokeStyle(3, 0xFFFFFF)
      .setInteractive({ useHandCursor: true });
    this.add.text(CX, contY, '▶  HIT THE ROAD', {
      fontSize: '17px', fontFamily: IMPACT,
      color: '#FFFFFF', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    cont.on('pointerover', () => cont.setFillStyle(0x66CC66));
    cont.on('pointerout',  () => cont.setFillStyle(0x44AA44));
    cont.on('pointerdown', () => this._continue());

    // ── Status line ─────────────────────────────────────────────────────
    this._statusText = this.add.text(CX, SCREEN_H - 56, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#88FF88',
    }).setOrigin(0.5);

    // Keyboard shortcuts
    this.input.keyboard?.once('keydown-ENTER', () => this._continue());
    this.input.keyboard?.once('keydown-SPACE', () => this._continue());
  }

  // ── Hide-all helper ──────────────────────────────────────────────
  _hideAllScreens() {
    for (const obj of (this._landingObjs ?? [])) obj.setVisible?.(false);
    for (const obj of (this._dealerChooserObjs ?? [])) obj.setVisible?.(false);
    for (const c of Object.values(this._sectionContainers ?? {})) c.setVisible(false);
  }

  /** Show the landing screen (5 brand placards). */
  _showLanding() {
    this._screenStack = ['landing'];
    this._activeSection = null;
    this._hideAllScreens();
    for (const obj of (this._landingObjs ?? [])) obj.setVisible?.(true);
    this._backBtnBg?.setVisible(false);
    this._backBtnLbl?.setVisible(false);
    this._sectionHeader?.setVisible(false);
  }

  /** Show the dealer chooser (Cars / Accessories). */
  _showDealerChooser() {
    this._screenStack = ['landing', 'dealer'];
    this._activeSection = null;
    this._hideAllScreens();
    for (const obj of (this._dealerChooserObjs ?? [])) obj.setVisible?.(true);
    this._backBtnBg?.setVisible(true);
    this._backBtnLbl?.setVisible(true);
    if (this._sectionHeader) {
      this._sectionHeader.setText('🏬  DEALER').setVisible(true);
    }
  }

  /** Show a sub-menu for a section key.  parent (optional) = the
   *  intermediate screen to return to on BACK; defaults to 'landing'. */
  _showSection(key, parent = 'landing') {
    this._screenStack = parent === 'dealer'
      ? ['landing', 'dealer', key]
      : ['landing', key];
    this._activeSection = key;
    this._hideAllScreens();
    if (this._sectionContainers?.[key]) {
      this._sectionContainers[key].setVisible(true);
    }
    this._backBtnBg?.setVisible(true);
    this._backBtnLbl?.setVisible(true);
    if (this._sectionHeader) {
      this._sectionHeader.setText(SECTIONS[key]?.label ?? key.toUpperCase()).setVisible(true);
    }
    this._setSectionScroll(key, 0);
  }

  /** BACK pops one screen off the stack. */
  _popScreen() {
    if (!this._screenStack || this._screenStack.length <= 1) {
      this._showLanding();
      return;
    }
    this._screenStack.pop();
    const next = this._screenStack[this._screenStack.length - 1];
    if (next === 'landing')      this._showLanding();
    else if (next === 'dealer')  this._showDealerChooser();
    else                          this._showSection(next);
  }

  _setSectionScroll(key, y) {
    const max = Math.max(0, (this._sectionContentH[key] ?? 0) - this._contentH);
    const clamped = Math.max(0, Math.min(max, y));
    this._sectionScroll[key] = clamped;
    const c = this._sectionContainers[key];
    if (c) c.y = -clamped;
  }
  _scrollSection(key, dy) {
    this._setSectionScroll(key, (this._sectionScroll[key] ?? 0) + dy);
  }

  _buildTabContent(key, x, y, w, h) {
    const items = SECTIONS[key].items;
    // Drugs section needs 2 columns to fit 12 entries; others stay 1-col.
    const cols  = key === 'drugs' ? 2 : 1;
    const rows  = Math.ceil(items.length / cols);
    const cellW = (w - (cols - 1) * 6) / cols;
    const cellH = Math.min(56, Math.max(30, (h - (rows - 1) * 6) / rows));
    const objs  = [];
    items.forEach((item, i) => {
      const r  = Math.floor(i / cols);
      const c  = i % cols;
      const cx = x + c * (cellW + 6);
      const cy = y + r * (cellH + 6);
      const created = this._makeButton(cx, cy, cellW, cellH, item);
      created.forEach(o => objs.push(o));
    });
    return objs;
  }

  _makeButton(x, y, w, h, item) {
    const bg = this.add.rectangle(x, y, w, h, 0x2A1808)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xFFCC66)
      .setInteractive({ useHandCursor: true });

    const created = [bg];
    let textX = x + 12;

    // Icon image (drug or weapon texture).  Falls back to the emoji prefix
    // if the texture isn't loaded.
    const iconSize = Math.min(h - 10, 36);
    if (item.icon && this.textures.exists(item.icon)) {
      const img = this.add.image(x + 8 + iconSize / 2, y + h / 2, item.icon)
        .setOrigin(0.5);
      // Scale so the long edge fits iconSize.
      const tex   = this.textures.get(item.icon).source[0];
      const baseW = tex?.width  || iconSize;
      const baseH = tex?.height || iconSize;
      const k     = iconSize / Math.max(baseW, baseH);
      img.setDisplaySize(baseW * k, baseH * k);
      created.push(img);
      textX = x + 8 + iconSize + 8;
    } else if (item.emoji) {
      const emo = this.add.text(x + 8 + iconSize / 2, y + h / 2, item.emoji, {
        fontSize: `${Math.round(iconSize * 0.7)}px`, fontFamily: 'Arial',
      }).setOrigin(0.5);
      created.push(emo);
      textX = x + 8 + iconSize + 8;
    }

    const compact = h <= 40;
    const label = this.add.text(textX, y + (compact ? h / 2 - 6 : 6), item.label, {
      fontSize: compact ? '12px' : '14px', fontFamily: IMPACT,
      color: '#FFEEAA', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0);
    const desc = this.add.text(textX, y + (compact ? h / 2 + 7 : 28), item.desc, {
      fontSize: compact ? '9px' : '10px', fontFamily: 'Arial', color: '#CCBB88',
    }).setOrigin(0, 0);
    // Custom mode runs noScore=true and gives every shop item for FREE
    // (the player chose their starting drug levels via the slider, so
    // there's no $ to spend and the shop shouldn't gate them out).
    const freeMode = Difficulty.noScore?.() === true;
    const effectiveCost = freeMode ? 0 : item.cost;

    const cost = this.add.text(x + w - 8, y + h / 2,
      effectiveCost > 0 ? `$${effectiveCost}` : 'FREE', {
        fontSize: compact ? '11px' : '13px', fontFamily: IMPACT,
        color: '#FFEE00', stroke: '#000', strokeThickness: 2,
      }).setOrigin(1, 0.5);
    created.push(label, desc, cost);

    const refresh = () => {
      const ok = this._score >= effectiveCost;       // always true in freeMode
      bg.setFillStyle(ok ? 0x2A1808 : 0x1A0E04);
      bg.setStrokeStyle(2, ok ? 0xFFCC66 : 0x664422);
      label.setAlpha(ok ? 1 : 0.45);
      desc.setAlpha(ok ? 1 : 0.45);
      cost.setColor(effectiveCost === 0 ? '#88FFCC' : (ok ? '#FFEE00' : '#886622'));
    };
    refresh();
    this._buttonRefresh.push(refresh);

    bg.on('pointerover', () => { if (this._score >= effectiveCost) bg.setFillStyle(0x44280C); });
    bg.on('pointerout',  () => refresh());
    bg.on('pointerdown', (ptr) => {
      ptr.event?.stopPropagation?.();
      if (this._score < effectiveCost) {
        this._flash(bg, 0xFF4444);
        this._setStatus(`Need $${effectiveCost - this._score} more!`, '#FF6666');
        return;
      }
      if (effectiveCost > 0) this._score -= effectiveCost;
      this._refreshScore();
      this._applyPurchase(item);
      this._setStatus(this._purchaseConfirmation(item), '#88FF88');
      this._flash(bg, 0x44FF44);
      this._buttonRefresh.forEach(fn => fn());
    });

    return created;
  }

  _purchaseConfirmation(item) {
    if (item.payload?.hitchhike) {
      const outcome = this._rollHitchhiker();
      return outcome.message;
    }
    return `✓ ${item.label.replace(/[^\w ]/g, '').trim()}`;
  }

  /** Random hitchhiker outcome — accumulates effects into _purchases so
   *  GameScene applies them on resume.  Mix of generous and shady riders. */
  _rollHitchhiker() {
    const r = Math.random();
    if (r < 0.18) {
      this._purchases.f12.push('rocket');
      return { message: '🤝 Friendly biker — gave you a ROCKET!' };
    }
    if (r < 0.40) {
      const bonus = 800;
      this._purchases.scoreBonus += bonus;
      return { message: `🤝 Off-duty trucker — tipped you $${bonus}!` };
    }
    if (r < 0.55) {
      this._purchases.restock = true;
      return { message: '🤝 Old hippie — RESTOCKED your drugs!' };
    }
    if (r < 0.75) {
      const loss = Math.min(this._score, 600);
      this._score -= loss;
      this._refreshScore();
      return { message: `💀 Sketchy stranger ROBBED you of $${loss}!` };
    }
    if (r < 0.90) {
      const loss = Math.min(this._score, 1200);
      this._score -= loss;
      this._refreshScore();
      this._purchases.f12 = [];           // wipe any tokens we'd been giving
      return { message: `💀 Armed robbery — lost $${loss} + pending weapons!` };
    }
    return { message: '😐 Hitchhiker bailed at the next exit. Nothing happened.' };
  }

  _applyPurchase(item) {
    const p = item.payload;
    if (!p) return;
    if (p.repair) {
      this._purchases.repair             = true;
      this._purchases.durabilityOnResume = 100;
    }
    // ── Phase 2-4 payloads ────────────────────────────────────────
    if (p.refuel) {
      this._purchases.refuelToFull = true;
      // 10% robbery roll — drains a fraction of the player's cash.
      // Done here so the popup ("ROBBED!") fires alongside the refuel.
      if (Math.random() < GAS_ROBBERY_CHANCE) {
        const loss = Math.floor(this._score * GAS_ROBBERY_FRAC);
        this._score = Math.max(0, this._score - loss);
        this._refreshScore();
        this._setStatus?.(`💀 ROBBED at the pump! −$${loss}`, '#FF4444');
      }
    }
    if (p.charge) {
      this._purchases.refuelToFull = true;     // tank fills the same way
      this._purchases.chargeAdMs   = 5000;     // 5-sec ad screen on resume
      this._purchases.partyClockPenalty = (this._purchases.partyClockPenalty ?? 0) + 60;
    }
    if (p.sleep) {
      this._purchases.sleepAdMs       = 5000;
      this._purchases.partyClockPenalty = (this._purchases.partyClockPenalty ?? 0) + 180;
    }
    if (p.coffee) {
      this._purchases.partyClockPenalty = (this._purchases.partyClockPenalty ?? 0) + 30;
    }
    if (p.campRepair) {
      // Repair to 65 % of the CURRENT vehicle's max HP, not a flat 65
      // points — otherwise low-HP cars (Beater = 50 max) get clamped to
      // full when setDurability(65) caps against _max.  Never DECREASE
      // current durability.
      const vehMax = VEHICLES[this._vehicleId]?.hp ?? 100;
      const target = Math.round(vehMax * 0.65);
      this._purchases.durabilityOnResume = Math.max(this._purchases.durabilityOnResume ?? 0, target);
    }
    if (p.oil710) {
      // +15 HP, capped at the vehicle's max.  Stacks if bought multiple
      // times in one stop.
      const vehMax = VEHICLES[this._vehicleId]?.hp ?? 100;
      const cur    = this._purchases.durabilityOnResume ?? this._durabilityAtEntry ?? vehMax;
      this._purchases.durabilityOnResume = Math.min(vehMax, cur + 15);
    }
    if (p.tractionTires) {
      // Legacy payload (global flag) — kept so existing call sites don't
      // break, but the new per-vehicle path below is the real source.
      this._purchases.tractionTires = true;
    }
    if (p.vehicleAccessory) {
      // Per-vehicle accessory purchase (bumper / traction / nos).  Write
      // directly into the per-mode save profile under accessories[vid]
      // so the new VehicleId carries it across runs.
      const save = this.registry?.get?.('save');
      if (save) {
        const all = save.get('accessories') ?? {};
        const cur = all[this._vehicleId] ?? {};
        if (p.vehicleAccessory === 'bumper')   cur.bumper   = true;
        if (p.vehicleAccessory === 'traction') cur.traction = true;
        if (p.vehicleAccessory === 'nos') {
          cur.nos = Math.min(3, (cur.nos ?? 0) + 1);
        }
        all[this._vehicleId] = cur;
        save.set('accessories', all);
      }
      // Stash a flag GameScene reads on resume so the HUD updates
      // immediately if needed.  Rebuilds shop card on next visit.
      this._purchases.accessoryRefresh = true;
    }
    if (p.camouflage) {
      // Single-shot star clear — implemented as "drop 2 stars on resume".
      // GameScene reads this and subtracts from the entry star count.
      this._purchases.starsToDrop = (this._purchases.starsToDrop ?? 0) + 2;
    }
    if (p.spikeHeat) {
      // Spike-strip purchase also bumps heat (player heard from store
      // workers gossiping — cops + NPCs hunt them harder).
      this._purchases.bumpStarsOnResume = (this._purchases.bumpStarsOnResume ?? 0) + 1;
    }
    if (p.buyVehicle) {
      this._purchases.boughtVehicles = this._purchases.boughtVehicles ?? [];
      this._purchases.boughtVehicles.push(p.buyVehicle);
    }
    if (p.reduceDrugs && (p.coffee || p.sleep)) {
      // Multiplicative drug reduction handled below in the existing
      // reduceDrugs branch — leave as-is so the math composes.
    }
    if (p.sexworker) {
      // 1-in-10 chance she has dirt on a politician — gives the player
      // a "no more than 2 stars for 100 miles" cap.  9/10 it's just a
      // pleasant detour with nothing to show for it.
      this._purchases.sexworker = true;
      if (Math.random() < 0.10) {
        this._purchases.starCapMiles = (this._purchases.starCapMiles ?? 0) + 100;
        this._purchases.starCapMax   = 2;
        this._setStatus?.('🗞  SHE HAD DIRT! Cops capped at 2★ for 100 mi.', '#88FFCC');
      } else {
        this._setStatus?.('She had a nice time. Thanks for asking.', '#FFFFFF');
      }
    }
    if (p.restock)    this._purchases.restock = true;
    if (p.clearStars) this._purchases.clearStars = true;
    if (p.scoreBonus) this._purchases.scoreBonus += p.scoreBonus;
    if (p.f12)        this._purchases.f12.push(p.f12);
    if (p.upgrade)    this._purchases.upgrade.push(p.upgrade);
    if (p.drugTopUp) {
      // Per-drug top-up: each click ADDS p.amount (+10%) up to a cap of
      // 0.80.  Multiple clicks accumulate — the GameScene reads the
      // final amount on resume and bumps the bar to that level.
      this._purchases.drugTopUps = this._purchases.drugTopUps || {};
      const cur = this._purchases.drugTopUps[p.drugTopUp] ?? 0;
      this._purchases.drugTopUps[p.drugTopUp] = Math.min(0.80, cur + (p.amount ?? 0.10));
    }
    if (p.topAllTo) {
      // "Top all to N" — every unlocked bar lifts to >= this threshold.
      this._purchases.topAllTo = Math.max(this._purchases.topAllTo ?? 0, p.topAllTo);
    }
    if (typeof p.reduceDrugs === 'number') {
      // Multiplier on every drug bar at resume.  Multiple buys multiply
      // (so 2× coffee = ×0.25; coffee + snooze = ×0).  Lowest multiplier
      // wins effectively because they multiply.
      const cur = this._purchases.reduceDrugs ?? 1;
      this._purchases.reduceDrugs = cur * p.reduceDrugs;
    }
    // hitchhike outcome handled in _purchaseConfirmation → _rollHitchhiker
  }

  _refreshScore() {
    this._scoreText.setText(`CASH: $${this._score.toLocaleString()}`);
  }

  _setStatus(msg, color) {
    this._statusText.setText(msg).setColor(color);
    if (this._statusTimer) this._statusTimer.remove();
    this._statusTimer = this.time.delayedCall(2400, () => this._statusText.setText(''));
  }

  _flash(obj, color) {
    const orig = obj.fillColor;
    obj.setFillStyle(color);
    this.time.delayedCall(120, () => obj.setFillStyle(orig));
  }

  _continue() {
    if (this._continuing) return;
    this._continuing = true;
    this.registry.get('audio')?.setPaused?.(false);
    // Time penalty for visiting the stop — real seconds spent here ×
    // 0.5 deducted from the party clock.  Per spec: each stop costs
    // (real time × 0.5) of party-clock time.  Folded onto whatever
    // purchases already added (charge ad, sleep, coffee, etc.).
    const visitSec = this._sceneStartTime
      ? Math.max(0, (Date.now() - this._sceneStartTime) / 1000)
      : 0;
    const visitPenalty = Math.round(visitSec * 0.5);
    this._purchases.partyClockPenalty =
      (this._purchases.partyClockPenalty ?? 0) + visitPenalty;
    this.cameras.main.fadeOut(280, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const finalScore = this._score + (this._purchases.scoreBonus ?? 0);
      this.scene.start('Game', {
        resumeFromStop: this._stop.id,
        resumeScore:    finalScore,
        resumeStars:    this._purchases.clearStars ? 0 : this._stars,
        purchases:      this._purchases,
      });
    });
  }
}
