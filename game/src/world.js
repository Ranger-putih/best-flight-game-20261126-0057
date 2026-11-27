// The world of Merapi Airlift: a procedural volcanic archipelago, its four grass
// airstrips, the drifting ash clouds over the volcanoes, the white clouds and the
// golden bonus rings. No drawing here and no browser in it — just the heightfield,
// the placed things and the questions the flight model asks: how high is the ground
// here, am I over a runway, am I inside an ash cloud, did I fly through a ring?

import { BONUS_RINGS, ISLANDS, MISSIONS, SEA_LEVEL, STRIPS, WORLD_SIZE } from './config.js';
import { hash2, ridgeNoise, valueNoise } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_LANDED_STRIP = 1;
export const EVENT_CRASHED = 2;
export const EVENT_RING = 4;
export const EVENT_ASH = 8;

/** How far a landing may stray from a runway centreline and still count as "on strip". */
const STRIP_TOLERANCE = 60;
/** A touchdown softer than this vertical speed (m/s) is a good landing. */
const SOFT_TOUCHDOWN = 3.5;
/** A touchdown harder than this is a crash, whatever the surface. */
const CRASH_TOUCHDOWN = 9;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function smooth01(t) {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

/** Distance from (x, z) to the centreline of a strip's runway, and along it. */
export function stripFrame(strip, x, z) {
  const dx = x - strip.x;
  const dz = z - strip.z;
  const sin = Math.sin(strip.heading);
  const cos = Math.cos(strip.heading);
  // Runway local axes: along = forward along heading, across = sideways.
  return { along: dx * sin + dz * cos, across: dx * cos - dz * sin };
}

export function createWorld(seed) {
  const islandNoise = seed * 7 + 13;

  /** The analytic ground height; run once per grid cell at boot, then interpolated. */
  function rawGroundHeight(x, z) {
    let height = -26;
    for (let i = 0; i < ISLANDS.length; i += 1) {
      const island = ISLANDS[i];
      const dx = x - island.x;
      const dz = z - island.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist >= island.radius) continue;
      const t = 1 - dist / island.radius;
      const shape = t * t * (3 - 2 * t);
      let peak = island.peak * shape;
      // Ridges on the flanks, and a crater bowl on the volcanoes.
      peak *= 0.85 + 0.15 * ridgeNoise(x + island.x, z + island.z, islandNoise + i * 31);
      if (island.volcano && dist < island.radius * island.crater) {
        peak *= 0.78 + 0.22 * smooth01(dist / (island.radius * island.crater));
      }
      height = Math.max(height, peak);
    }
    // Gentle rolling hills on the bigger islands, fading out at the shore.
    const hills = (valueNoise(x, z, 1 / 260, islandNoise + 5) - 0.5) * 34;
    if (height > SEA_LEVEL + 4) height += hills * smooth01((height - SEA_LEVEL - 4) / 60);
    // Flatten the ground around every airstrip so the runway sits on level grass.
    // The flat pad follows the runway rectangle (plus a margin), then feathers out
    // over 160 m — a radial blend leaves the runway ends buried in the hillside.
    for (let i = 0; i < STRIPS.length; i += 1) {
      const strip = STRIPS[i];
      const frame = stripFrame(strip, x, z);
      const alongExcess = Math.max(0, Math.abs(frame.along) - (strip.length / 2 + 30));
      const acrossExcess = Math.max(0, Math.abs(frame.across) - (strip.width / 2 + 30));
      const excess = Math.sqrt(alongExcess * alongExcess + acrossExcess * acrossExcess);
      if (excess < 160) {
        const blend = smooth01(excess / 160);
        height = strip.elev + (height - strip.elev) * blend;
      }
    }
    return height;
  }

  // A precomputed heightfield grid: the voxel renderer samples the ground tens of
  // thousands of times a frame, so it reads bilinear-interpolated grid values instead
  // of re-running the island and noise maths. 512 cells over 5200 m is ~10 m a cell,
  // fine for rolling volcanic terrain; the analytic function still answers off-grid.
  const GRID_N = 512;
  const GRID_CELL = WORLD_SIZE / GRID_N;
  const GRID_HALF = WORLD_SIZE / 2;
  const grid = new Float32Array((GRID_N + 1) * (GRID_N + 1));
  for (let gz = 0; gz <= GRID_N; gz += 1) {
    for (let gx = 0; gx <= GRID_N; gx += 1) {
      grid[gz * (GRID_N + 1) + gx] = rawGroundHeight(-GRID_HALF + gx * GRID_CELL, -GRID_HALF + gz * GRID_CELL);
    }
  }

  /** Ground height in metres at (x, z), bilinear from the heightfield grid. */
  function groundHeight(x, z) {
    const fx = (x + GRID_HALF) / GRID_CELL;
    const fz = (z + GRID_HALF) / GRID_CELL;
    const ix = Math.max(0, Math.min(GRID_N - 1, Math.floor(fx)));
    const iz = Math.max(0, Math.min(GRID_N - 1, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - ix));
    const tz = Math.max(0, Math.min(1, fz - iz));
    const row = GRID_N + 1;
    const a = grid[iz * row + ix];
    const b = grid[iz * row + ix + 1];
    const c = grid[(iz + 1) * row + ix];
    const d = grid[(iz + 1) * row + ix + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
  function stripAt(x, z) {
    for (let i = 0; i < STRIPS.length; i += 1) {
      const strip = STRIPS[i];
      const frame = stripFrame(strip, x, z);
      if (Math.abs(frame.along) < strip.length / 2 + STRIP_TOLERANCE
        && Math.abs(frame.across) < strip.width / 2 + STRIP_TOLERANCE) {
        return strip;
      }
    }
    return null;
  }

  /** Is (x, z) on the runway surface itself (not just the flattened apron)? */
  function onRunway(strip, x, z) {
    const frame = stripFrame(strip, x, z);
    return Math.abs(frame.along) <= strip.length / 2 && Math.abs(frame.across) <= strip.width / 2;
  }

  // Ash clouds hang over the three volcanoes and drift slowly with the wind.
  const ashClouds = [];
  for (const island of ISLANDS) {
    if (!island.volcano) continue;
    ashClouds.push({
      island: island.name,
      x: island.x,
      z: island.z,
      y: island.peak + 90,
      radius: 190,
      drift: 0.35 + valueNoise(island.x, island.z, 1 / 500, seed) * 0.4,
      phase: valueNoise(island.z, island.x, 1 / 700, seed + 3) * Math.PI * 2,
    });
  }

  // White cumulus clouds, scattered and seeded, for the sky and the screenshots.
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    const angle = valueNoise(i * 17, i * 31, 1, seed + 11) * Math.PI * 2;
    const radius = 500 + valueNoise(i * 7, i * 13, 1, seed + 17) * 1900;
    clouds.push({
      x: Math.sin(angle) * radius,
      z: Math.cos(angle) * radius,
      y: 320 + valueNoise(i * 3, i * 5, 1, seed + 23) * 260,
      size: 90 + valueNoise(i * 11, i * 19, 1, seed + 29) * 150,
      speed: 2 + valueNoise(i * 23, i * 29, 1, seed + 37) * 3,
    });
  }

  // Bonus rings, each with a "taken" flag that resets when a new run starts.
  const rings = BONUS_RINGS.map((ring) => ({ ...ring, taken: false }));
  // Trees beside every airstrip, so the flat grass around a strip is not bare:
  // five per strip, on both sides of the runway, clear of the strip itself.
  // Positions come from the fixed strip geometry plus a stable hash, so the
  // same trees stand in the same places every run.
  const props = [];
  for (let s = 0; s < STRIPS.length; s += 1) {
    const strip = STRIPS[s];
    for (let i = 0; i < 5; i += 1) {
      const along = (hash2(s, i, 41) - 0.5) * strip.length * 0.85;
      const side = i % 2 === 0 ? 1 : -1;
      const across = side * (46 + hash2(s, i, 43) * 34);
      const sin = Math.sin(strip.heading);
      const cos = Math.cos(strip.heading);
      props.push({
        kind: 'tree',
        x: strip.x + along * sin + across * cos,
        z: strip.z + along * cos - across * sin,
        height: 9 + hash2(s, i, 47) * 7,
      });
    }
  }
  // The destination beacon ring hovers over the current mission's target strip.
  const beacon = { x: 0, y: 0, z: 0, radius: 58, active: false };

  function moveBeaconTo(strip) {
    beacon.x = strip.x;
    beacon.z = strip.z;
    beacon.y = strip.elev + 175;
    beacon.active = true;
  }

  function resetRings() {
    for (const ring of rings) ring.taken = false;
  }

  /**
   * One fixed step of the world itself: clouds drift, ash puffs breathe. Returns nothing;
   * the flight model asks the questions below after it moves the plane.
   */
  function step(dt, time) {
    for (const cloud of clouds) {
      cloud.x += cloud.speed * dt;
      if (cloud.x > WORLD_SIZE / 2 + 300) cloud.x = -WORLD_SIZE / 2 - 300;
    }
    for (const ash of ashClouds) {
      ash.x += Math.sin(time * 0.05 + ash.phase) * ash.drift * dt * 8;
      ash.z += Math.cos(time * 0.04 + ash.phase) * ash.drift * dt * 6;
    }
  }

  /** True while the point is inside any ash cloud (ash damages the engine). */
  function inAsh(x, y, z) {
    for (const ash of ashClouds) {
      const dx = x - ash.x;
      const dy = y - ash.y;
      const dz = z - ash.z;
      if (dx * dx + dy * dy * 2.2 + dz * dz < ash.radius * ash.radius) return ash;
    }
    return null;
  }

  /** True while the point is inside a white cloud (just weather, no damage). */
  function inCloud(x, y, z) {
    for (const cloud of clouds) {
      const dx = x - cloud.x;
      const dy = (y - cloud.y) * 1.6;
      const dz = z - cloud.z;
      if (dx * dx + dy * dy + dz * dz < cloud.size * cloud.size * 0.55) return true;
    }
    return false;
  }

  /**
   * A ring pass: the plane crossed within `radius` of a bonus ring's centre this step.
   * Returns the ring, or null. Taken rings stay taken until a new run.
   */
  function ringPassed(x, y, z) {
    for (const ring of rings) {
      if (ring.taken) continue;
      const dx = x - ring.x;
      const dy = y - ring.y;
      const dz = z - ring.z;
      if (dx * dx + dy * dy + dz * dz < ring.radius * ring.radius) {
        ring.taken = true;
        return ring;
      }
    }
    return null;
  }

  /**
   * What happens when the plane's wheels touch the ground. Returns an event flag and,
   * for a strip landing, which strip and whether it was soft.
   */
  function touchdown(x, z, verticalSpeed, roll) {
    const ground = groundHeight(x, z);
    const strip = stripAt(x, z);
    const hard = verticalSpeed < -CRASH_TOUCHDOWN || Math.abs(roll) > 0.9;
    if (hard) return { event: EVENT_CRASHED, strip: null, soft: false, ground };
    if (!strip) {
      // Rough ground, water or hillside: a survivable but damaging bump.
      return { event: EVENT_LANDED_STRIP, strip: null, soft: false, ground };
    }
    const soft = verticalSpeed > -SOFT_TOUCHDOWN;
    return { event: EVENT_LANDED_STRIP, strip, soft, ground };
  }

  function missionLeg(index) {
    const mission = MISSIONS[index];
    if (!mission) return null;
    return {
      ...mission,
      fromStrip: STRIPS.find((strip) => strip.id === mission.from),
      toStrip: STRIPS.find((strip) => strip.id === mission.to),
    };
  }

  return {
    groundHeight,
    stripAt,
    onRunway,
    inAsh,
    inCloud,
    ringPassed,
    touchdown,
    missionLeg,
    moveBeaconTo,
    resetRings,
    step,
    ashClouds,
    clouds,
    rings,
    props,
    beacon,
  };
}
