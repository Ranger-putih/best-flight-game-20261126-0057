// Every tuning number, colour and place name for Merapi Airlift in one file, so the
// rest of the game never hard-codes a value. Distances are metres, speeds metres per
// second, angles radians. The archipelago is four volcanic islands around a home base,
// each with one grass airstrip; the missions fly a loop between them.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** Sea level; terrain below this is ocean. */
export const SEA_LEVEL = 0;

/** The world is a square of this size, centred on (0, 0); the map edge is open sea. */
export const WORLD_SIZE = 5200;

/** What the canvas draws at: the 3D scene is painted on a small buffer, then scaled up. */
export const VIEW = { width: 1280, height: 800, bufferWidth: 640, bufferHeight: 400 };

export const PLANE = {
  name: 'Elang STOL',
  callsign: 'PK-MRA',
  maxSpeed: 58,
  cruiseSpeed: 42,
  stallSpeed: 23,
  climbRate: 11,
  turnRate: 0.85,
  rollRate: 2.4,
  pitchRate: 1.1,
  fuelCapacity: 100,
  /** Fuel percent burned per second at full throttle; idle burns a quarter of that. */
  fuelBurn: 0.32,
  damageLimit: 100,
};

export const CAMERA = {
  chaseDistance: 15,
  chaseHeight: 4.5,
  cockpitHeight: 1.1,
  fov: 1.22,
  mouseYaw: 0.9,
  mousePitch: 0.45,
};

/** Volcanic islands: centre, radius, peak height and whether it smokes. */
export const ISLANDS = [
  { name: 'Merapi', x: -900, z: -700, radius: 1050, peak: 750, volcano: true, crater: 0.24 },
  { name: 'Sumbing', x: 1150, z: -950, radius: 900, peak: 680, volcano: true, crater: 0.2 },
  { name: 'Sindoro', x: 1250, z: 1050, radius: 820, peak: 580, volcano: false, crater: 0 },
  { name: 'Slamet', x: -1150, z: 1150, radius: 980, peak: 820, volcano: true, crater: 0.28 },
  { name: 'Pulau Kecil', x: 150, z: 1800, radius: 520, peak: 180, volcano: false, crater: 0 },
];

/**
 * Airstrips. `heading` is the runway direction in radians (0 = north, -z). `elev` is the
 * flattened ground height at the strip. Each strip sits on its island's coast with
 * the runway along the shore, so both approaches come in over the sea, not over
 * the volcano's flank — a strip up the slope has no safe way down to it.
 */
export const STRIPS = [
  { id: 'merapi', name: 'Merapi Field', island: 'Merapi', x: -350, z: 60, heading: 2.2, elev: 20, length: 260, width: 22 },
  { id: 'sumbing', name: 'Sumbing Strip', island: 'Sumbing', x: 1150, z: -100, heading: 1.57, elev: 12, length: 230, width: 20 },
  { id: 'sindoro', name: 'Sindoro Strip', island: 'Sindoro', x: 470, z: 1050, heading: 0, elev: 15, length: 220, width: 20 },
  { id: 'slamet', name: 'Slamet Ridge', island: 'Slamet', x: -230, z: 1150, heading: 0, elev: 18, length: 240, width: 20 },
];

/** The courier loop: one delivery per leg, each with its own cargo and weight. */
export const MISSIONS = [
  { id: 1, cargo: 'Obat & vaksin', from: 'merapi', to: 'sumbing', weight: 120, brief: 'Bawa obat dan vaksin ke klinik lereng Sumbing.' },
  { id: 2, cargo: 'Suku cadang pompa', from: 'sumbing', to: 'sindoro', weight: 190, brief: 'Pompa air Sindoro mati — antar suku cadangnya.' },
  { id: 3, cargo: 'Surat & paket pos', from: 'sindoro', to: 'slamet', weight: 90, brief: 'Kantong pos mingguan untuk desa di Slamet.' },
  { id: 4, cargo: 'Bantuan darurat', from: 'slamet', to: 'merapi', weight: 260, brief: 'Muatan paling berat: bantuan darurat kembali ke base.' },
];

/** Golden bonus rings floating between the islands; flying through one pays 50 points. */
export const BONUS_RINGS = [
  { x: 120, z: -820, y: 210, radius: 26 },
  { x: 1180, z: 60, y: 230, radius: 26 },
  { x: 60, z: 1400, y: 190, radius: 26 },
  { x: -1050, z: 120, y: 240, radius: 26 },
  { x: -200, z: -1400, y: 260, radius: 26 },
];

export const SCORE = {
  deliveryBase: 500,
  timeBonusPerSecond: 2,
  fuelBonusPerPercent: 3,
  ringBonus: 50,
  softLandingBonus: 100,
};

export const PALETTE = {
  skyTop: '#2f6db3',
  skyMid: '#7fb2dd',
  skyHorizon: '#cfe6f2',
  haze: '#d8e8f0',
  sun: '#fff3c4',
  seaDeep: '#0d4d7a',
  seaShallow: '#2a8fb5',
  seaGlint: '#bfe6f2',
  sand: '#e8d9a0',
  grass: '#4d8a3f',
  grassDry: '#7a9a4a',
  forest: '#2e6b2f',
  rock: '#6b5a52',
  ash: '#4a4642',
  runway: '#3c3f45',
  runwayLine: '#f5d76e',
  planeWhite: '#f4f1e8',
  planeRed: '#c93a2e',
  planeDark: '#2b2f36',
  hudText: '#eef6fb',
  hudAmber: '#ffb02e',
  hudGreen: '#7be495',
  hudRed: '#ff5a4e',
  panel: 'rgba(10, 22, 34, 0.82)',
  panelEdge: '#4d7ea6',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'merapi-airlift.best';
