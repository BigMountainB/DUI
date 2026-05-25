/**
 * AudioSystem — 10-station radio.  Stations with a `tracks: []` list play
 * real MP3 files (the user's MIDI library, batch-converted via FluidSynth
 * + GeneralUser GS).  Stations without tracks fall back to the original
 * procedural Web Audio synthesis (chorus, supersaw, plate reverb, etc.).
 */

// Real-track playlist per genre.  Files live in public/assets/music/
// in per-genre subfolders.  Stations whose name doesn't appear here
// keep their procedural sound.
const STATION_TRACKS = {
  'ARCADE': [
    'assets/music/arcade/8-bit_bounce.mp3',
    'assets/music/arcade/90s_kid.mp3',
    'assets/music/arcade/ass_fault.mp3',
    'assets/music/arcade/curbside_chaos.mp3',
    'assets/music/arcade/drop_coin.mp3',
    'assets/music/arcade/drop_the_soap.mp3',
    'assets/music/arcade/electric_gerbil.mp3',
    'assets/music/arcade/final_boss.mp3',
    'assets/music/arcade/neon_pursuit.mp3',
    'assets/music/arcade/side_quest.mp3',
    'assets/music/arcade/sidewalk_slide.mp3',
    'assets/music/arcade/static_punch.mp3',
  ],
  'SYNTHWAVE': [
    'assets/music/80s/arcade_renegades.mp3',
    'assets/music/80s/concrete_animal.mp3',
    'assets/music/80s/crystal_speedway.mp3',
    'assets/music/80s/mall_riot_summer.mp3',
    'assets/music/80s/nitro_saints.mp3',
    'assets/music/80s/perms_pistols.mp3',
    'assets/music/80s/powder_vision.mp3',
  ],
  'CLASSIC ROCK': [
    'assets/music/classic_rock/2000_miles_to_mexico.mp3',
    'assets/music/classic_rock/acid_picnic_at_vantage.mp3',
    'assets/music/classic_rock/free_love_motel.mp3',
    'assets/music/classic_rock/rain_on_the_ferry.mp3',
    'assets/music/classic_rock/snoqualmie_moon.mp3',
    'assets/music/classic_rock/the_last_beer_in_ritzville.mp3',
    'assets/music/classic_rock/through_the_palouse.mp3',
  ],
  'COUNTRY': [
    'assets/music/country/blue_lights_in_the_rearview.mp3',
    'assets/music/country/cash_in_a_feed_sack.mp3',
    'assets/music/country/powder_river_revival.mp3',
    'assets/music/country/riverboat_arson.mp3',
    'assets/music/country/roman_candles_tannerite.mp3',
    'assets/music/country/shotgun_choir.mp3',
    'assets/music/country/whiskey_bent_transmission.mp3',
  ],
  'EDM': [
    'assets/music/edm/acid_carousel.mp3',
    'assets/music/edm/anarchy_hotline.mp3',
    'assets/music/edm/crash_theory.mp3',
    'assets/music/edm/feel_the_frequency.mp3',
    'assets/music/edm/nitrous_communion.mp3',
    'assets/music/edm/tokyo_sideways.mp3',
    'assets/music/edm/velvet_laser.mp3',
  ],
  'HIP-HOP': [
    'assets/music/rap/clinic_cup.mp3',
    'assets/music/rap/exit_13.mp3',
    'assets/music/rap/interstate_fever_dream.mp3',
    'assets/music/rap/line_phantom.mp3',
    'assets/music/rap/mushed_my_turn.mp3',
    'assets/music/rap/neon_dash_foam_ghosts.mp3',
    'assets/music/rap/paint_the_asphalt_pink.mp3',
    'assets/music/rap/parking_lot_wizzard.mp3',
    'assets/music/rap/pull_up_pull_out.mp3',
  ],
  'K-POP': [
    'assets/music/kpop/black_card_valkyries.mp3',
    'assets/music/kpop/cherry_bomb_express.mp3',
    'assets/music/kpop/gangnam_ghosts.mp3',
    'assets/music/kpop/neon_vacation.mp3',
    'assets/music/kpop/pit_stopping_hearts.mp3',
    'assets/music/kpop/sugar_rush_riot.mp3',
    'assets/music/kpop/tunnel_vision.mp3',
  ],
  'REGGAE': [
    'assets/music/reggae/catch_we.mp3',
    'assets/music/reggae/concrete_jungle_bashment.mp3',
    'assets/music/reggae/ganja_speedway.mp3',
    'assets/music/reggae/high_grade_holiday.mp3',
    'assets/music/reggae/midnight_soundbwoy.mp3',
    'assets/music/reggae/pull_up.mp3',
    'assets/music/reggae/rum_revolution.mp3',
  ],
};

const STATIONS = [
  // ── ARCADE — chiptune-style instrumentals, default for new runs ─────
  // Procedural fallback fields are silent; real MP3s drive playback.
  {
    name: 'ARCADE', color: '#33DD66', bpm: 132,
    melody: { type: 'triangle', notes: [0,0,0,0], gain: 0.0 },
    bass:   { notes: [0], gain: 0.0 },
    drums:  { kick: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
              snare:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
              hat:  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] },
  },

  // ── SYNTHWAVE — detuned saw chorus, 80s Am-F-C-G progression ─────────
  {
    name: 'SYNTHWAVE', color: '#FF6EC7', bpm: 118,
    melody: {
      chorus: true, detune: 12, harmony: 1.498, reverb: 0.45, stereo: 0.7,
      notes: [
        440,0,523.3,659.3, 880,659.3,523.3,0,
        349.2,0,440,523.3, 698.5,523.3,440,0,
        523.3,0,659.3,784, 1046.5,784,659.3,0,
        392,0,493.9,587.3, 784,659.3,587.3,0,
      ],
      altNotes: [
        // Alt phrase A — descending answer
        880,0,784,698.5, 659.3,587.3,523.3,0,
        698.5,523.3,440,392, 349.2,0,440,0,
        1046.5,0,932.3,880, 784,659.3,587.3,0,
        523.3,587.3,659.3,784, 880,1046.5,880,0,
        // Alt phrase B — sparse / dotted
        659.3,0,0,523.3, 0,440,0,523.3,
        0,587.3,0,440, 392,0,349.2,0,
        523.3,0,0,659.3, 0,784,0,880,
        0,1046.5,0,784, 659.3,587.3,440,0,
      ],
      gain: 0.11,
    },
    bass: {
      notes: [
        110,0,110,0, 82.41,0,82.41,0,
        87.31,0,87.31,0, 65.41,0,65.41,0,
        65.41,0,65.41,0, 98,0,98,0,
        98,0,98,0, 73.42,0,73.42,0,
      ],
      gain: 0.30,
    },
    drums: {
      kick:    [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      snare:   [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:     [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      openHat: [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
    },
  },

  // ── HIP-HOP — triangle piano, sub-bass 808 kick, trap hats ───────────
  // 4 melody phrases cycled per-bar so the loop doesn't feel like a 4-second
  // jingle. This is the default / startup station.
  {
    name: 'HIP-HOP', color: '#AA44FF', bpm: 88,
    melody: {
      type: 'triangle', reverb: 0.55, stereo: 0.5,
      notes: [
        // Phrase A — main hook (Am pentatonic-ish)
        784,0,0,784, 932.3,0,784,0,
        1046.5,0,0,932.3, 0,784,0,0,
        698.5,0,0,698.5, 830.6,0,698.5,0,
        932.3,0,0,830.6, 0,698.5,0,0,
      ],
      altNotes: [
        // Phrase B — call & response, more space
        587.3,0,659.3,0, 784,0,0,659.3,
        523.3,0,0,587.3, 659.3,0,587.3,0,
        698.5,0,784,0, 932.3,0,0,784,
        698.5,0,0,659.3, 587.3,0,523.3,0,
        // Phrase C — climbing fill
        523.3,587.3,659.3,698.5, 784,830.6,932.3,1046.5,
        932.3,830.6,784,698.5, 659.3,587.3,523.3,0,
        698.5,830.6,932.3,0, 1046.5,932.3,830.6,0,
        932.3,830.6,698.5,587.3, 523.3,0,0,0,
        // Phrase D — sparse trap, lots of rest
        932.3,0,0,0, 0,932.3,0,0,
        0,0,784,0, 0,0,0,698.5,
        932.3,0,0,932.3, 0,0,0,1046.5,
        0,830.6,0,0, 698.5,0,0,0,
      ],
      gain: 0.14,
    },
    bass: {
      type: 'sine', long: true,
      notes: [
        98,98,0,0, 0,0,116.5,0,
        130.8,0,0,0, 0,0,146.8,0,
        155.6,155.6,0,0, 0,0,146.8,0,
        130.8,0,0,0, 0,0,98,0,
      ],
      altNotes: [
        // Bass walk B
        82.41,0,0,82.41, 98,0,87.31,0,
        110,0,0,98, 87.31,0,82.41,0,
        87.31,0,0,98, 110,0,0,116.5,
        98,0,0,87.31, 82.41,0,73.42,0,
        // Bass walk C — heavier 808 thump
        73.42,73.42,0,0, 0,0,87.31,0,
        98,98,0,0, 0,0,110,0,
        116.5,0,0,0, 110,0,0,98,
        87.31,0,0,82.41, 0,0,73.42,0,
      ],
      gain: 0.38,
    },
    drums: {
      kick:  [1,0,0,1,0,0,1,0,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0,1,0,0,1,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:   [1,1,0,1,0,1,1,0,1,1,0,1,0,1,1,0,1,1,0,1,0,1,1,0,1,1,0,1,0,1,1,0],
    },
    kickStyle: 'sub',
  },

  // ── CLASSIC ROCK — distorted sawtooth, E-minor pentatonic riff ────────
  {
    name: 'CLASSIC ROCK', color: '#FF8800', bpm: 130,
    melody: {
      type: 'sawtooth', distort: true, powerChord: true, reverb: 0.3, stereo: 0.6,
      notes: [
        329.6,329.6,0,392, 440,392,329.6,0,
        246.9,0,293.7,329.6, 440,329.6,0,0,
        293.7,293.7,0,349.2, 392,349.2,293.7,0,
        220,0,246.9,293.7, 392,293.7,246.9,0,
      ],
      altNotes: [
        // Solo run — 16th-note bursts
        659.3,587.3,523.3,440, 392,440,523.3,440,
        587.3,523.3,440,392, 329.6,392,440,329.6,
        493.9,440,392,349.2, 329.6,349.2,440,329.6,
        293.7,329.6,392,440, 493.9,440,392,329.6,
        // Riff variant — open string drop
        164.8,0,329.6,0, 246.9,0,329.6,0,
        220,0,329.6,0, 196,0,246.9,0,
        164.8,164.8,329.6,329.6, 246.9,246.9,329.6,0,
        220,220,329.6,329.6, 293.7,293.7,392,0,
      ],
      gain: 0.15,
    },
    bass: {
      notes: [
        82.41,0,164.8,0, 110,0,220,0,
        123.5,0,246.9,0, 110,0,220,0,
        73.42,0,146.8,0, 110,0,220,0,
        82.41,0,164.8,0, 123.5,0,246.9,0,
      ],
      gain: 0.28,
    },
    drums: {
      kick:  [1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:   [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
    },
    kickStyle: 'rock', snareStyle: 'rock',
  },

  // ── EDM — 5-oscillator supersaw, 4-on-floor, open hats ───────────────
  {
    name: 'EDM', color: '#00EEFF', bpm: 128,
    melody: {
      supersaw: true, reverb: 0.6, stereo: 0.85,
      notes: [
        587.3,698.5,880,1174.7, 880,698.5,587.3,698.5,
        523.3,622.3,784,1046.5, 784,622.3,523.3,622.3,
        466.2,587.3,698.5,932.3, 698.5,587.3,466.2,587.3,
        440,523.3,622.3,880, 622.3,523.3,440,523.3,
      ],
      altNotes: [
        // Pluck pattern — staccato top line
        1174.7,0,880,0, 1174.7,0,1318.5,0,
        1046.5,0,784,0, 1046.5,0,1174.7,0,
        932.3,0,698.5,0, 932.3,0,1046.5,0,
        880,0,659.3,0, 880,0,932.3,0,
        // Build / drop melody
        440,523.3,622.3,698.5, 784,880,932.3,1046.5,
        1174.7,1046.5,932.3,880, 784,698.5,622.3,523.3,
        1318.5,1174.7,1046.5,932.3, 1174.7,1046.5,932.3,880,
        1568,1318.5,1174.7,1046.5, 1318.5,1174.7,1046.5,932.3,
      ],
      gain: 0.09,
    },
    bass: {
      notes: [
        73.42,0,73.42,0, 87.31,0,87.31,0,
        98,0,98,0, 110,0,110,0,
        116.5,0,116.5,0, 98,0,98,0,
        110,0,110,0, 73.42,0,73.42,0,
      ],
      gain: 0.32,
    },
    drums: {
      kick:    [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      snare:   [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:     [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      openHat: [0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
    },
  },

  // ── COUNTRY — triangle twang, G major, boom-chick bass ───────────────
  {
    name: 'COUNTRY', color: '#AADD44', bpm: 104,
    melody: {
      type: 'triangle', reverb: 0.35, stereo: 0.4,
      notes: [
        392,0,493.9,587.3, 784,0,587.3,493.9,
        440,0,392,440, 493.9,0,587.3,0,
        523.3,0,659.3,784, 1046.5,0,784,659.3,
        587.3,0,523.3,587.3, 659.3,0,784,0,
      ],
      altNotes: [
        // Honky-tonk pickup line
        587.3,659.3,784,0, 698.5,587.3,493.9,0,
        440,493.9,587.3,0, 523.3,440,392,0,
        587.3,659.3,784,880, 784,659.3,587.3,493.9,
        440,392,330,392, 440,493.9,587.3,0,
        // Bridge — major arpeggios
        392,493.9,587.3,784, 587.3,493.9,392,0,
        440,523.3,659.3,880, 659.3,523.3,440,0,
        493.9,587.3,698.5,880, 698.5,587.3,493.9,0,
        587.3,698.5,784,880, 1046.5,880,784,0,
      ],
      gain: 0.17,
    },
    bass: {
      notes: [
        98,0,0,98, 0,0,98,0,
        146.8,0,0,146.8, 0,0,146.8,0,
        130.8,0,0,130.8, 0,0,130.8,0,
        146.8,0,0,146.8, 0,0,98,0,
      ],
      gain: 0.28,
    },
    drums: {
      kick:  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      snare: [0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0,0,0,0,0,1,0,1,0],
      hat:   [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
    },
    snareStyle: 'country',
  },

  // ── REGGAE — off-beat skank, deep bass walks ────────────────────────
  {
    name: 'REGGAE', color: '#22BB44', bpm: 78,
    melody: {
      type: 'triangle', reverb: 0.5, stereo: 0.6,
      notes: [
        0,440,0,440, 0,392,0,349.2,
        0,440,0,523.3, 0,440,0,392,
        0,329.6,0,329.6, 0,392,0,440,
        0,523.3,0,440, 0,392,0,329.6,
      ],
      altNotes: [
        // Dub stab
        0,0,440,0, 0,0,392,0,
        0,0,349.2,0, 0,0,329.6,0,
        0,0,587.3,0, 0,0,523.3,0,
        0,0,440,0, 0,0,392,0,
      ],
      gain: 0.13,
    },
    bass: {
      notes: [
        110,0,0,98, 87.31,0,82.41,0,
        87.31,0,0,98, 110,0,0,0,
        82.41,0,0,73.42, 65.41,0,73.42,0,
        82.41,0,0,98, 110,0,0,0,
      ],
      gain: 0.40,
    },
    drums: {
      kick:  [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hat:   [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
    },
    kickStyle: 'sub',
  },

  // ── K-POP — real-track only.  Procedural fields silent fallback. ────
  {
    name: 'K-POP', color: '#FF44AA', bpm: 110,
    melody: { type: 'triangle', notes: [0,0,0,0], gain: 0.0 },
    bass:   { notes: [0], gain: 0.0 },
    drums:  { kick: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
              snare:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
              hat:  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] },
  },
];

// Annotate each station with its track list (if any).  Procedural-only
// stations (Synthwave, Classic Rock, Ancient Chinese) get an empty list.
for (const st of STATIONS) {
  st.tracks = STATION_TRACKS[st.name] ?? [];
}

export class AudioSystem {
  constructor() {
    this._ctx          = null;
    this._master       = null;
    this._bus          = null;   // compressor mix bus
    this._noiseBuffer  = null;
    this._distortCurve = null;
    this._schedTimer   = null;
    this._nextStepTime = 0;
    this._currentStep  = 0;
    // Default radio station: ARCADE (index 0) — chiptune instrumentals
    // play when a fresh run starts.
    this.currentStation = 0;
    this.muted         = false;
    this.volume        = 0.32;
    this.ready         = false;

    // Song structure state — tracks where we are in the current "song" so
    // we can outro / fade / start a new song with a fresh seed.
    //   _songPhase: 'play' | 'outro' | 'silence'
    //   _songBarCount counts bars within the current song; once it hits
    //   _songBarsTotal we run an outro bar (drum fill + riser), then a
    //   silence bar, then start a new song with a fresh song-level seed.
    this._songBarCount   = 0;
    this._songBarsTotal  = 0;
    this._songPhase      = 'play';
    this._songTranspose  = 1;
    this._songOctave     = 1;
    this._drumMute       = false;
  }

  init() {
    if (this.ready) return;
    try {
      this._ctx    = new (window.AudioContext || window.webkitAudioContext)();
      this._master = this._ctx.createGain();
      // Respect any mute toggled before init ran — tapping the mute
      // button on the title screen flips `this.muted` but the gain
      // assignment in toggleMute() is a no-op while _master is null,
      // so the silence has to be re-applied here.
      this._master.gain.value = (this.muted || this.paused) ? 0 : this.volume;
      this._master.connect(this._ctx.destination);

      // Compressor bus — glues the mix, adds punch
      this._bus = this._ctx.createDynamicsCompressor();
      this._bus.threshold.value = -14;
      this._bus.knee.value      = 8;
      this._bus.ratio.value     = 4;
      this._bus.attack.value    = 0.003;
      this._bus.release.value   = 0.12;

      // Drug filter chain — sits between compressor bus and master so
      // setDrugInfluence() can muffle / brighten the whole mix in real
      // time as drug levels change.  Default cutoffs are wide-open (no
      // audible effect) until something updates them.
      this._lowpass = this._ctx.createBiquadFilter();
      this._lowpass.type            = 'lowpass';
      this._lowpass.frequency.value = 22000;
      this._lowpass.Q.value         = 0.707;
      this._highpass = this._ctx.createBiquadFilter();
      this._highpass.type            = 'highpass';
      this._highpass.frequency.value = 20;
      this._highpass.Q.value         = 0.707;
      this._bus.connect(this._lowpass);
      this._lowpass.connect(this._highpass);
      this._highpass.connect(this._master);

      this._buildNoiseBuffer();
      this._distortCurve = this._makeDistortCurve(180);

      // Reverb send: short plate-style impulse → wet bus mixed into compressor.
      // Voices opt-in by setting `reverb` (0..1) in the station config.
      this._reverb = this._ctx.createConvolver();
      this._reverb.buffer = this._buildPlateImpulse(1.6, 2.0);
      this._reverbWet = this._ctx.createGain();
      this._reverbWet.gain.value = 0.35;
      this._reverb.connect(this._reverbWet);
      this._reverbWet.connect(this._bus);

      this.ready = true;

      // Real-track playback state — set in _startTrack(), cleared when
      // switching to a procedural station.
      this._trackEl     = null;     // current HTMLAudioElement
      this._trackSource = null;     // MediaElementAudioSourceNode → master
      this._trackIdx    = 0;        // index into the station's tracks[]

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this._ctx.suspend();
        else                 this._ctx.resume();
      });

      this.play();
    } catch (e) {
      console.warn('AudioSystem init failed:', e);
    }
  }

  play() {
    if (!this.ready) return;
    if (this._ctx.state === 'suspended') this._ctx.resume();
    this._currentStep  = 0;
    this._nextStepTime = this._ctx.currentTime + 0.08;
    this._startScheduler();
    // Auto-start the right path for the current station.
    this._refreshStationPlayback();
  }

  nextStation() {
    this.currentStation = (this.currentStation + 1) % STATIONS.length;
    this._currentStep   = 0;
    // Force a fresh song on station change so the listener gets a clean
    // intro instead of inheriting whatever song-state the previous one
    // was in (e.g. switching mid-outro).
    this._songBarsTotal = 0;
    this._songPhase     = 'play';
    this._refreshStationPlayback();
  }

  /** Public API consumed by the phone-menu Music app. */
  getStations() {
    return STATIONS.map((s, i) => ({
      index:  i,
      name:   s.name,
      color:  s.color,
      tracks: (s.tracks ?? []).slice(),
    }));
  }
  setStation(idx) {
    if (idx < 0 || idx >= STATIONS.length) return;
    // Switching stations cancels any active custom playlist.
    this._playlistQueue = null;
    this._playlistIdx   = 0;
    this.currentStation = idx;
    this._currentStep   = 0;
    this._songBarsTotal = 0;
    this._songPhase     = 'play';
    this._refreshStationPlayback();
  }
  /** Force the audio system into a state where it can play music on
   *  iOS — init the system if it hasn't been booted yet (the user's
   *  tap counts as the required gesture), resume the AudioContext if
   *  suspended, clear the paused/muted flags, and unpause master
   *  gain.  Called whenever the user explicitly picks a track in the
   *  music app so playback doesn't silently fail. */
  _enablePlayback() {
    if (!this.ready) this.init();
    try { if (this._ctx?.state === 'suspended') this._ctx.resume(); } catch (_) {}
    // Clear the in-game-pause flag, but PRESERVE the user's mute
    // preference — pressing play on a song or restarting the run
    // must never override the mute toggle.
    this.paused = false;
    if (this._master) this._master.gain.value = this.muted ? 0 : this.volume;
  }
  playSpecificTrack(url) {
    // Tapping a specific track is an explicit "play this now" — it
    // overrides any standing mute (the user clearly wants sound) and
    // any in-game-pause flag.  Mute persistence still applies for
    // implicit playback (game start, station refresh).
    this.muted = false;
    this._enablePlayback();
    // Single-track play cancels any active playlist queue.
    this._playlistQueue = null;
    this._playlistIdx   = 0;
    for (let i = 0; i < STATIONS.length; i++) {
      if ((STATIONS[i].tracks ?? []).includes(url)) {
        this.currentStation = i;
        this._trackIdx = STATIONS[i].tracks.indexOf(url);
        this._currentStep   = 0;
        this._songBarsTotal = 0;
        this._songPhase     = 'play';
        this._startTrack(url);
        return true;
      }
    }
    return false;
  }
  /** Cross-genre playlist — queue an arbitrary list of track URLs.
   *  Plays them in order; on each track end the next one starts.
   *  Loops back to the start when the queue is exhausted. */
  playPlaylist(urls) {
    if (!Array.isArray(urls) || !urls.length) return;
    // Same intent as playSpecificTrack — hitting PLAY is an explicit
    // request for sound, so override any standing mute.
    this.muted = false;
    this._enablePlayback();
    this._playlistQueue = urls.slice();
    this._playlistIdx   = 0;
    this._startTrack(this._playlistQueue[0]);
  }
  /** Shuffle all real-track stations into a single rotating set. */
  shuffleAllTracks() {
    this._playlistQueue = null;
    const pool = [];
    for (const st of STATIONS) for (const t of (st.tracks ?? [])) pool.push(t);
    if (!pool.length) return;
    const url = pool[Math.floor(Math.random() * pool.length)];
    this.playSpecificTrack(url);
  }

  /** Switch playback path based on the current station: if it has real
   *  tracks, kill any procedural sound and start an MP3; otherwise stop
   *  any playing MP3 and let the procedural scheduler take over. */
  _refreshStationPlayback() {
    if (!this.ready) return;
    const st = STATIONS[this.currentStation];
    const hasTracks = st?.tracks && st.tracks.length > 0;
    if (hasTracks) {
      this._trackIdx = Math.floor(Math.random() * st.tracks.length);
      this._startTrack(st.tracks[this._trackIdx]);
    } else {
      this._stopTrack();
    }
  }

  _startTrack(url) {
    this._stopTrack();
    // Generation token — only the LATEST _startTrack call is allowed
    // to actually wire up audio.  Two taps in quick succession (or a
    // tap during the iOS context-resume delay) would otherwise leave
    // both Audio() elements playing simultaneously, with only the
    // newer one referenced by this._trackEl — the older becomes an
    // unstoppable orphan.  Incrementing _startGen per call and
    // checking it inside begin() drops the stale ones.
    const myGen = (this._startGen = (this._startGen ?? 0) + 1);
    // The FIRST .play() after AudioContext creation can silently fail
    // on iOS even when invoked from a user gesture — the context is
    // still mid-resume, so HTMLMediaElement decides "no user gesture"
    // and rejects.  Wait for the context to be running before
    // starting playback, and retry once on rejection.  If that fails
    // too, advance to the next track so the radio doesn't stall.
    const begin = () => {
      if (myGen !== this._startGen) return;       // superseded — abort
      // Defensive — kill any track that may have started during the
      // resume delay before we replace this._trackEl.
      this._stopTrack();
      try {
        const el = new Audio(url);
        el.crossOrigin = 'anonymous';
        el.loop        = false;
        el.volume      = 1;
        // Default is 'metadata' — only fetches the MP3 header, then
        // waits for play() to fetch the rest, which is a big chunk
        // of the "first song is slow" delay on iOS.  'auto' tells
        // the browser to start downloading the whole file as soon
        // as the element is created, so by the time play() runs the
        // first samples are already buffered.
        el.preload = 'auto';
        // Route through the master gain so volume/mute/pause apply.
        const src = this._ctx.createMediaElementSource(el);
        src.connect(this._master);
        el.addEventListener('ended', () => this._onTrackEnded());
        el.addEventListener('error', () => this._onTrackEnded());
        // iOS pauses the audio element when a system sound interrupts
        // (text-message ping, charger plug-in chime, Siri, etc.).
        // If our own paused/muted state says we WANT to be playing,
        // resume after a short beat so the interruption doesn't kill
        // the song.
        el.addEventListener('pause', () => {
          if (this.paused || this.muted) return;     // intentional
          if (el.ended) return;
          if (el !== this._trackEl) return;          // superseded
          setTimeout(() => {
            if (this.paused || this.muted) return;
            if (el !== this._trackEl || el.ended) return;
            el.play().catch(() => {});
          }, 120);
        });
        const tryPlay = (retries) => {
          if (myGen !== this._startGen) { try { el.pause(); } catch (_) {} return; }
          el.play().catch(() => {
            if (myGen !== this._startGen) return;
            if (retries > 0) setTimeout(() => tryPlay(retries - 1), 150);
            else             this._onTrackEnded();
          });
        };
        tryPlay(1);
        this._trackEl     = el;
        this._trackSource = src;
      } catch (e) {
        // MediaElementSource can throw if the stream isn't ready; fall
        // back silently — procedural scheduler still runs.
        console.warn('AudioSystem track start failed:', e);
      }
    };
    if (this._ctx?.state === 'suspended') {
      this._ctx.resume().then(begin, begin);
    } else {
      begin();
    }
  }

  _stopTrack() {
    if (this._trackEl) {
      try { this._trackEl.pause(); } catch (_) {}
      try { this._trackSource?.disconnect(); } catch (_) {}
      this._trackEl     = null;
      this._trackSource = null;
    }
  }

  _onTrackEnded() {
    // Active custom playlist takes priority over station auto-advance.
    if (this._playlistQueue && this._playlistQueue.length) {
      this._playlistIdx = (this._playlistIdx + 1) % this._playlistQueue.length;
      this._startTrack(this._playlistQueue[this._playlistIdx]);
      return;
    }
    const st = STATIONS[this.currentStation];
    if (!st?.tracks?.length) { this._stopTrack(); return; }
    // Advance to a different track (avoid replaying the same file).
    let next = this._trackIdx;
    if (st.tracks.length > 1) {
      while (next === this._trackIdx) {
        next = Math.floor(Math.random() * st.tracks.length);
      }
    }
    this._trackIdx = next;
    this._startTrack(st.tracks[next]);
  }

  /** Public: skip to the next track on the current station.  No-op on
   *  procedural-only stations (Synthwave / Classic Rock / Ancient Chinese). */
  skipTrack() {
    if (this._trackEl) this._onTrackEnded();
  }

  setPaused(paused) {
    this.paused = !!paused;
    if (this._master) this._master.gain.value = (this.muted || this.paused) ? 0 : this.volume;
    // Pause/resume the real-track HTMLAudioElement too — gain alone
    // would silence it but the file would keep advancing.
    if (this._trackEl) {
      if (this.paused) { try { this._trackEl.pause();  } catch (_) {} }
      else             { try { this._trackEl.play().catch(() => {}); } catch (_) {} }
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this._master) this._master.gain.value = (this.muted || this.paused) ? 0 : this.volume;
  }

  get currentName()  { return STATIONS[this.currentStation].name; }
  get currentColor() { return STATIONS[this.currentStation].color; }

  /** Update master filter chain + tempo multiplier from current drug levels.
   *  Called every frame from GameScene so the mix reacts in real time as
   *  bars rise / decay.  Effects:
   *    Depressants (alc / weed / her / fent / ket / rx) — drop the lowpass
   *      cutoff and slow the tempo.  At full ketamine the audio is a
   *      muffled rumble at half-tempo.
   *    Uppers (cocaine / meth) — raise the highpass to thin out the lows
   *      and nudge tempo faster.  Tinny + jittery feel.
   *    Psychedelics (lsd / shrooms) — push the reverb wet send so the
   *      whole mix washes into a long tail. */
  setDrugInfluence(levels) {
    if (!this.ready || !this._lowpass || !this._highpass) return;
    // Each drug only colours the music once its bar is ≥ 35 %.  Below
    // that threshold the drug contributes nothing; above it, the level
    // is rescaled so 0.35 → 0 and 1.00 → 1.  Avoids subtle wash from
    // background-trace drugs and gives each effect a clear "kicks in"
    // moment as the bar climbs past the threshold.
    const TH = 0.35;
    const get = (k) => {
      const lvl = levels?.[k] ?? 0;
      if (lvl < TH) return 0;
      return (lvl - TH) / (1 - TH);
    };
    const alc = get('alcohol'), weed = get('weed'), coke = get('cocaine');
    const lsd = get('lsd'),     shr  = get('shrooms');
    const her = get('heroin'),  fnt  = get('fentanyl');
    const ket = get('ketamine'), mth = get('meth'), rx = get('rx');

    // Lowpass — depressants progressively close the top end.
    // Alcohol intentionally excluded: the music shouldn't dull just from
    // being drunk (per design — drunk affects steering, not the radio).
    let lp = 22000;
    if (weed > 0) lp = Math.min(lp, 22000 - weed * 16000);   // → 6000 Hz
    if (her  > 0) lp = Math.min(lp, 22000 - her  * 20000);   // → 2000 Hz
    if (fnt  > 0) lp = Math.min(lp, 22000 - fnt  * 21000);   // → 1000 Hz
    if (ket  > 0) lp = Math.min(lp, 22000 - ket  * 21500);   // → 500  Hz
    if (rx   > 0) lp = Math.min(lp, 22000 - rx   * 8000);    // → 14000 Hz
    lp = Math.max(300, lp);

    // Highpass — uppers thin out the bass for a wired, tinny feel.
    let hp = 20;
    if (coke > 0) hp = Math.max(hp, 20 + coke * 280);        // → 300 Hz
    if (mth  > 0) hp = Math.max(hp, 20 + mth  * 480);        // → 500 Hz

    // Tempo nudge applied alongside the per-bar humanizing factor.
    // Alcohol left out here too — see lowpass note.
    let tempoMul = 1.0;
    tempoMul -= weed * 0.07;
    tempoMul -= her  * 0.20;
    tempoMul -= fnt  * 0.30;
    tempoMul -= ket  * 0.35;
    tempoMul += coke * 0.10;
    tempoMul += mth  * 0.18;
    tempoMul = Math.max(0.5, Math.min(1.45, tempoMul));

    // Reverb send — psychedelics wash everything into a long tail.
    let wet = 0.35;
    wet += lsd * 0.55;
    wet += shr * 0.45;
    wet  = Math.min(1.0, wet);

    // Smoothly approach targets so a fresh pickup doesn't click the
    // filter audibly.
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const T   = 0.18;
    this._lowpass.frequency.setTargetAtTime(lp, now, T);
    this._highpass.frequency.setTargetAtTime(hp, now, T);
    if (this._reverbWet) this._reverbWet.gain.setTargetAtTime(wet, now, T);
    this._drugTempoFactor = tempoMul;
  }

  destroy() {
    this._stopScheduler();
    this._ctx?.close();
  }

  // ─── Private ──────────────────────────────────────────────────────────

  _buildNoiseBuffer() {
    const len = this._ctx.sampleRate * 2;
    this._noiseBuffer = this._ctx.createBuffer(1, len, this._ctx.sampleRate);
    const d = this._noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Stereo decaying noise impulse for plate-style reverb. */
  _buildPlateImpulse(seconds, decay) {
    const sr  = this._ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this._ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _makeDistortCurve(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  _startScheduler() {
    this._stopScheduler();
    this._schedTimer = setInterval(() => this._runScheduler(), 50);
  }

  _stopScheduler() {
    if (this._schedTimer) { clearInterval(this._schedTimer); this._schedTimer = null; }
  }

  _runScheduler() {
    if (!this._ctx || this.muted || this.paused) return;
    // Skip procedural synthesis entirely when a real track is playing —
    // otherwise both would layer on top of each other.
    if (this._trackEl && !this._trackEl.paused) return;
    const st      = STATIONS[this.currentStation];
    // Apply per-bar tempo nudge so the groove doesn't lock to a perfect
    // metronome.  _tempoFactor is rolled fresh each bar in _rollVariation.
    // _drugTempoFactor layers on top so depressants slow / uppers speed
    // the entire mix in real time.
    const baseStepDur = 60 / st.bpm / 4;
    const tempoMul    = (this._tempoFactor || 1) * (this._drugTempoFactor || 1);
    const stepDur     = baseStepDur / tempoMul;
    const ahead       = 0.15;
    while (this._nextStepTime < this._ctx.currentTime + ahead) {
      // Bar boundary — advance song state, possibly transition to outro/
      // silence, and roll fresh musical variation for the next bar.
      if (this._currentStep === 0) this._handleBarBoundary(st);
      this._scheduleStep(st, this._currentStep, this._nextStepTime, stepDur);
      this._currentStep  = (this._currentStep + 1) % 32;
      this._nextStepTime += stepDur;
    }
  }

  /** Called once per bar (at step 0).  Advances song-level state machine —
   *  most bars stay in 'play' and just get fresh per-bar variation, but
   *  every 12-16 bars we run a 1-bar outro (drum fill + riser, melody
   *  muted) followed by a 1-bar silence (everything muted, then a new
   *  song boots with a fresh seed). */
  _handleBarBoundary(st) {
    // Cold start — initialize the first song.
    if (this._songBarsTotal === 0) {
      this._startNewSong(st);
      return;
    }

    this._songBarCount++;

    if (this._songPhase === 'play') {
      if (this._songBarCount >= this._songBarsTotal - 1) {
        this._songPhase = 'outro';
        this._rollOutroBar(st);
      } else {
        this._rollVariation(st);
      }
    } else if (this._songPhase === 'outro') {
      this._songPhase = 'silence';
      this._rollSilenceBar(st);
    } else if (this._songPhase === 'silence') {
      // Brand-new song — fresh seed, fresh phrase pool, fresh transpose.
      this._startNewSong(st);
    }
  }

  /** Pick a new song-level seed (transpose, octave, target bar count) and
   *  roll the first bar's per-bar variation. */
  _startNewSong(st) {
    this._songBarCount  = 0;
    this._songBarsTotal = 12 + ((Math.random() * 5) | 0);   // 12-16 bars (~40-60s)
    this._songPhase     = 'play';

    // Song-level chromatic transpose — every song lives in a different key.
    // Wider palette than the per-bar transpose so consecutive songs really
    // sound different, not "same song one whole-step up".
    const songKeys = [
      0.7491, 0.7937, 0.8409, 0.8909, 0.9438,
      1.0,    1.0,
      1.0594, 1.1225, 1.1892, 1.2599, 1.3348,
    ];
    this._songTranspose = songKeys[(Math.random() * songKeys.length) | 0];
    // Occasional octave shift across the entire song.
    const r = Math.random();
    this._songOctave    = (r < 0.20) ? 0.5 : (r < 0.30) ? 2 : 1;
    this._drumMute      = false;
    this._rollVariation(st);
  }

  /** Last bar before silence — drum fill (snare roll, hat roll, kick
   *  reinforcements), no melody, plus a noise riser into the silence bar. */
  _rollOutroBar(st) {
    // Mute melody for the entire bar.
    this._melSkipMask = new Set();
    for (let i = 0; i < 32; i++) this._melSkipMask.add(i);
    this._harmonyInterval = 0;
    this._harmonyMask     = new Set();
    this._melOctaveBoost  = new Set();
    this._melOctaveDrop   = new Set();
    this._melTranspose    = 1;
    this._bassTranspose   = 1;
    this._melPhrase       = null;
    this._basPhrase       = null;

    // Crescendoing drum fill across the bar.
    this._fillSnareMask = new Set();
    for (let s = 0; s < 32; s++) {
      const intensity = s / 32;          // 0 → 1 across the bar
      if (Math.random() < 0.15 + intensity * 0.6) this._fillSnareMask.add(s);
    }
    this._fillHatMask = new Set();
    for (let s = 16; s < 32; s++) this._fillHatMask.add(s);   // hat roll
    this._addKickMask = new Set();
    this._kickSkipStep = -1;
    this._tempoFactor  = 1;
    this._drumMute     = false;

    // Schedule a noise riser that builds across the entire bar — gives
    // the outro a satisfying "transition into the next song" feel.
    const baseStepDur = 60 / st.bpm / 4;
    const barDur      = baseStepDur * 32;
    this._scheduleRiser(this._nextStepTime, barDur);
  }

  /** Silence bar between songs — everything muted for one bar so the
   *  listener clearly hears one song end and another begin. */
  _rollSilenceBar(st) {
    this._melSkipMask = new Set();
    for (let i = 0; i < 32; i++) this._melSkipMask.add(i);
    this._harmonyInterval = 0;
    this._harmonyMask     = new Set();
    this._melOctaveBoost  = new Set();
    this._melOctaveDrop   = new Set();
    this._fillSnareMask   = new Set();
    this._fillHatMask     = new Set();
    this._addKickMask     = new Set();
    this._kickSkipStep    = -1;
    this._tempoFactor     = 1;
    this._melPhrase       = null;
    this._basPhrase       = null;
    this._drumMute        = true;
  }

  /** White-noise highpass-sweep riser — used as the outro transition FX. */
  _scheduleRiser(t, dur) {
    const ctx = this._ctx;
    if (!ctx || !this._noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop   = true;
    const flt  = ctx.createBiquadFilter();
    flt.type   = 'highpass';
    flt.Q.value = 0.8;
    flt.frequency.setValueAtTime(800, t);
    flt.frequency.exponentialRampToValueAtTime(8000, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.95);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.05);
    src.connect(flt); flt.connect(env); env.connect(this._bus);
    src.start(t); src.stop(t + dur + 0.1);
  }

  /** Pick fresh per-bar variation knobs: melody transpose, drum fills,
   *  octave jumps, harmony overlays.  Aggressively mutates the bar so two
   *  consecutive bars rarely sound identical, but stays inside the
   *  current song's seed (key/octave) so the song still reads as one song. */
  _rollVariation(st) {
    this._drumMute = false;

    // Per-bar chromatic shimmer on TOP of the song-level key.
    const trans = [1.0, 1.0, 1.0594, 1.1225, 1.1892, 1.2599, 1.3348,
                   0.9438, 0.8908, 0.8409, 0.7937];
    this._melTranspose  = trans[(Math.random() * trans.length) | 0];
    this._bassTranspose = (Math.random() < 0.55) ? this._melTranspose : 1.0;

    // 90% of bars get a skip mask — phrases need breath to not feel
    // metronomic.  Skips per bar: 2-7 (was 1-4).
    this._melSkipMask = new Set();
    if (Math.random() < 0.9) {
      const skips = 2 + ((Math.random() * 6) | 0);
      for (let i = 0; i < skips; i++) {
        this._melSkipMask.add(((Math.random() * 32) | 0));
      }
    }

    // Per-step octave shifts — much higher base rate, more steps affected.
    this._melOctaveBoost = new Set();
    this._melOctaveDrop  = new Set();
    if (Math.random() < 0.85) {
      const ups = 2 + ((Math.random() * 5) | 0);
      for (let i = 0; i < ups; i++) this._melOctaveBoost.add(((Math.random() * 32) | 0));
    }
    if (Math.random() < 0.55) {
      const dns = 1 + ((Math.random() * 4) | 0);
      for (let i = 0; i < dns; i++) this._melOctaveDrop.add(((Math.random() * 32) | 0));
    }

    // Harmony intervals — broader palette, fires more often.
    this._harmonyInterval = (Math.random() < 0.55)
      ? [1.1892, 1.2599, 1.3348, 1.498, 1.682, 1.888][(Math.random() * 6) | 0]
      : 0;
    this._harmonyMask = new Set();
    if (this._harmonyInterval) {
      const hits = 3 + ((Math.random() * 7) | 0);
      for (let i = 0; i < hits; i++) this._harmonyMask.add(((Math.random() * 32) | 0));
    }

    // Drum fills: hat ghosts, snare rolls, kick reinforcements.
    // Now fire on most bars and stretch further into the bar.
    this._fillHatMask   = new Set();
    this._fillSnareMask = new Set();
    this._addKickMask   = new Set();
    if (Math.random() < 0.85) {
      for (let s = 8; s < 32; s++) if (Math.random() < 0.40) this._fillHatMask.add(s);
    }
    if (Math.random() < 0.70) {
      const start = 16 + ((Math.random() * 12) | 0);
      for (let s = start; s < 32; s++) if (Math.random() < 0.55) this._fillSnareMask.add(s);
    }
    if (Math.random() < 0.55) {
      const adds = 1 + ((Math.random() * 3) | 0);
      for (let i = 0; i < adds; i++) this._addKickMask.add(((Math.random() * 32) | 0));
    }

    // Tempo nudge — slightly wider than before (±5% vs the old ±3%) but
    // still close enough to the song's pocket that it just feels human.
    this._tempoFactor   = 1.0 + (Math.random() - 0.5) * 0.10;

    // Random kick skip — fires more often for syncopation.
    this._kickSkipStep  = (Math.random() < 0.5) ? ((Math.random() * 32) | 0) : -1;

    // Alt-phrase rotation — strong bias to alts (was 30% main → now 15%
    // main) so consecutive bars usually pull from a fresh phrase bank.
    this._melPhrase = this._pickPhrase(st.melody, 0.15);
    this._basPhrase = this._pickPhrase(st.bass,   0.30);

    // 1-in-6 bars become a "mid-song fill" — melody mostly muted, drum
    // density spiked.  Breaks up the loop substantially without ending
    // the song.
    if (Math.random() < 0.16) {
      for (let i = 0; i < 24; i++) this._melSkipMask.add(i);
      for (let s = 8; s < 32; s++) if (Math.random() < 0.55) this._fillHatMask.add(s);
      for (let s = 12; s < 32; s++) if (Math.random() < 0.50) this._fillSnareMask.add(s);
    }
  }

  /** Pick a random 32-step note window from the channel's notes/altNotes.
   *  Returns a 32-element slice that the scheduler can index by step.
   *  `mainBias` is the probability of returning the main hook instead of
   *  an alt phrase. */
  _pickPhrase(channel, mainBias = 0.3) {
    if (!channel) return null;
    const main  = channel.notes ?? [];
    const alts  = channel.altNotes ?? null;
    const total = main.length + (alts ? alts.length : 0);
    if (total === 0) return main;
    if (!alts || Math.random() < mainBias) return main;

    // Pick a 32-note window starting at a random 32-aligned offset within
    // the alt-bank. This gives one fully different phrase per bar.
    const banks = (alts.length / 32) | 0;
    const idx   = (Math.random() * banks) | 0;
    return alts.slice(idx * 32, idx * 32 + 32);
  }

  _scheduleStep(st, step, t, dur) {
    const m       = st.melody;
    const melArr  = this._melPhrase ?? m.notes;
    let   mf      = melArr[step];

    // Apply per-phrase variation: transpose, octave shifts, skips.
    // Song-level multipliers (key + octave) wrap around the per-bar ones.
    if (mf > 0) {
      if (this._melSkipMask?.has(step)) {
        mf = 0;                                  // skip this note
      } else {
        mf *= this._melTranspose ?? 1;
        mf *= this._songTranspose ?? 1;
        mf *= this._songOctave    ?? 1;
        if (this._melOctaveBoost?.has(step)) mf *= 2;
        if (this._melOctaveDrop?.has(step))  mf *= 0.5;
      }
    }

    // ── Melody
    if (mf > 0) {
      const gate = dur * 0.82;
      const wet  = m.reverb ?? 0;
      // Stereo width per genre — alternate L/R per step so the lead breathes.
      const pan  = (m.stereo ?? 0) * (((step & 1) === 0) ? -1 : 1) * 0.6;
      if (m.supersaw) {
        this._supersaw(mf, t, gate, m.gain, wet, pan);
      } else if (m.chorus) {
        this._chorusOsc(mf, t, gate, m.gain, m.detune || 10, wet, pan);
        if (m.harmony) this._osc('triangle', mf * m.harmony, t, gate, m.gain * 0.45, wet * 0.6, -pan);
      } else if (m.distort) {
        this._distortOsc(m.type || 'sawtooth', mf, t, gate, m.gain, wet, pan);
        if (m.powerChord) {
          this._distortOsc(m.type || 'sawtooth', mf * 1.498, t, gate, m.gain * 0.65, wet, -pan);
        }
      } else {
        this._osc(m.type || 'square', mf, t, gate, m.gain, wet, pan);
      }
      // Per-phrase harmony overlay on a random subset of melody notes.
      if (this._harmonyInterval && this._harmonyMask?.has(step)) {
        this._osc('triangle', mf * this._harmonyInterval, t, dur * 0.7, m.gain * 0.32, wet * 0.5, -pan);
      }
    }

    // ── Bass (transposed when bassTranspose is set, alt phrase optional)
    const basArr = this._basPhrase ?? st.bass.notes;
    let bf = basArr[step];
    if (bf > 0) {
      bf *= this._bassTranspose ?? 1;
      bf *= this._songTranspose ?? 1;
      // Bass usually stays in its own register — only follow the song
      // octave when it's lifted, never when it's halved (would mud out).
      if ((this._songOctave ?? 1) > 1) bf *= this._songOctave;
      const bassDur = st.bass.long ? dur * 1.5 : dur * 0.88;
      this._osc(st.bass.type || 'triangle', bf, t, bassDur, st.bass.gain);
    }

    // ── Drums (with per-phrase fills + skips).  Suppressed entirely
    // during the silence bar between songs.
    if (this._drumMute) return;
    const { kick, snare, hat, openHat } = st.drums;
    const skipKick = this._kickSkipStep === step;
    if ((kick[step] && !skipKick) || this._addKickMask?.has(step)) {
      this._kick(t, st.kickStyle);
    }
    if (snare[step] || this._fillSnareMask?.has(step)) {
      this._snare(t, st.snareStyle);
    }
    if (hat[step] || this._fillHatMask?.has(step)) this._hat(t);
    if (openHat?.[step]) this._openHat(t);
  }

  // ─── Oscillator methods ───────────────────────────────────────────────

  /** Routes envelope output to the dry bus and (optionally) the reverb send.
   *  `pan` is a normalised stereo position −1..+1; `wet` is reverb send 0..1. */
  _routeVoice(env, pan = 0, wet = 0) {
    const ctx = this._ctx;
    let last  = env;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      env.connect(p);
      last = p;
    }
    last.connect(this._bus);
    if (wet > 0 && this._reverb) {
      const send = ctx.createGain();
      send.gain.value = wet;
      last.connect(send);
      send.connect(this._reverb);
    }
  }

  _osc(type, freq, t, dur, gain, wet = 0, pan = 0) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.005);
    env.gain.setValueAtTime(gain, t + dur * 0.65);
    env.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    osc.connect(env);
    this._routeVoice(env, pan, wet);
    osc.start(t);
    osc.stop(t + dur + 0.06);
  }

  /** 3-oscillator detuned chorus — synthwave thickness */
  _chorusOsc(freq, t, dur, gain, detune, wet = 0, pan = 0) {
    const ctx = this._ctx;
    const g   = gain / 2.5;
    // Spread the 3 voices across the stereo field for true chorus width.
    const pans = [pan, pan + 0.45, pan - 0.45];
    let i = 0;
    for (const d of [0, detune, -detune]) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value    = d;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(g, t + 0.012);
      env.gain.setValueAtTime(g, t + dur * 0.65);
      env.gain.linearRampToValueAtTime(0, t + dur + 0.06);
      osc.connect(env);
      this._routeVoice(env, Math.max(-1, Math.min(1, pans[i++])), wet);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
  }

  /** 5-oscillator supersaw — EDM lead wall of sound */
  _supersaw(freq, t, dur, gain, wet = 0, pan = 0) {
    const ctx     = this._ctx;
    const detunes = [0, 8, -8, 15, -15];
    const pans    = [pan, pan + 0.6, pan - 0.6, pan + 0.9, pan - 0.9];
    const g       = gain / 3.5;
    let i = 0;
    for (const d of detunes) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value    = d;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(g, t + 0.015);
      env.gain.setValueAtTime(g, t + dur * 0.6);
      env.gain.linearRampToValueAtTime(0, t + dur + 0.04);
      osc.connect(env);
      this._routeVoice(env, Math.max(-1, Math.min(1, pans[i++])), wet);
      osc.start(t);
      osc.stop(t + dur + 0.08);
    }
  }

  /** Waveshaper distortion — rock/metal crunch */
  _distortOsc(type, freq, t, dur, gain, wet = 0, pan = 0) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const ws  = ctx.createWaveShaper();
    const env = ctx.createGain();
    osc.type  = type;
    osc.frequency.value = freq;
    ws.curve      = this._distortCurve;
    ws.oversample = '2x';
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.004);
    env.gain.setValueAtTime(gain, t + dur * 0.72);
    env.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(ws);
    ws.connect(env);
    this._routeVoice(env, pan, wet);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // ─── Drum methods ─────────────────────────────────────────────────────

  _kick(t, style = 'normal') {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';

    if (style === 'rock') {
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.065);
      env.gain.setValueAtTime(0.85, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(env); env.connect(this._bus);
      osc.start(t); osc.stop(t + 0.25);
      // Transient click
      const click = ctx.createOscillator();
      const ce    = ctx.createGain();
      click.type = 'square'; click.frequency.value = 1400;
      ce.gain.setValueAtTime(0.18, t);
      ce.gain.exponentialRampToValueAtTime(0.001, t + 0.007);
      click.connect(ce); ce.connect(this._bus);
      click.start(t); click.stop(t + 0.01);
    } else if (style === 'metal') {
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.045);
      env.gain.setValueAtTime(0.75, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(env); env.connect(this._bus);
      osc.start(t); osc.stop(t + 0.15);
    } else if (style === 'sub') {
      // 808-style: low start, long tail
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(35, t + 0.12);
      env.gain.setValueAtTime(0.7, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(env); env.connect(this._bus);
      osc.start(t); osc.stop(t + 0.36);
    } else {
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.09);
      env.gain.setValueAtTime(0.65, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(env); env.connect(this._bus);
      osc.start(t); osc.stop(t + 0.22);
    }
  }

  _snare(t, style = 'normal') {
    const ctx = this._ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const flt  = ctx.createBiquadFilter();
    const env  = ctx.createGain();

    if (style === 'rock') {
      flt.type = 'bandpass'; flt.frequency.value = 1800; flt.Q.value = 0.7;
      env.gain.setValueAtTime(0.65, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
      src.connect(flt); flt.connect(env); env.connect(this._bus);
      src.start(t); src.stop(t + 0.24);
      // Fat body tone
      const o = ctx.createOscillator(); const e2 = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(240, t);
      o.frequency.exponentialRampToValueAtTime(80, t + 0.07);
      e2.gain.setValueAtTime(0.25, t);
      e2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(e2); e2.connect(this._bus);
      o.start(t); o.stop(t + 0.12);
    } else if (style === 'country') {
      // Softer brushed snare
      flt.type = 'bandpass'; flt.frequency.value = 3000; flt.Q.value = 1.5;
      env.gain.setValueAtTime(0.22, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      src.connect(flt); flt.connect(env); env.connect(this._bus);
      src.start(t); src.stop(t + 0.12);
    } else {
      flt.type = 'bandpass'; flt.frequency.value = 2200; flt.Q.value = 0.9;
      env.gain.setValueAtTime(0.48, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      src.connect(flt); flt.connect(env); env.connect(this._bus);
      src.start(t); src.stop(t + 0.18);
      // Tone snap
      const o = ctx.createOscillator(); const e2 = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(280, t);
      o.frequency.exponentialRampToValueAtTime(100, t + 0.05);
      e2.gain.setValueAtTime(0.16, t);
      e2.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      o.connect(e2); e2.connect(this._bus);
      o.start(t); o.stop(t + 0.08);
    }
  }

  _hat(t) {
    const ctx = this._ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const flt  = ctx.createBiquadFilter();
    flt.type = 'highpass'; flt.frequency.value = 7500;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.22, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(flt); flt.connect(env); env.connect(this._bus);
    src.start(t); src.stop(t + 0.06);
  }

  _openHat(t) {
    const ctx = this._ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const flt  = ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.frequency.value = 9000; flt.Q.value = 0.6;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.20, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    src.connect(flt); flt.connect(env); env.connect(this._bus);
    src.start(t); src.stop(t + 0.32);
  }
}
