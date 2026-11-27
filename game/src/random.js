// Seeded randomness for Merapi Airlift: one tiny generator (mulberry32) plus a
// deterministic value-noise helper, so the same seed always grows the same islands,
// the same clouds and the same mission weather. Nothing here touches Math.random,
// which is what keeps the screenshot scenes repeatable frame for frame.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 2D hash: the same integer cell and seed always give the same 0..1 value. */
export function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296);
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise over the x/z plane; frequency is in 1/metres. */
export function valueNoise(x, z, frequency, seed) {
  const fx = x * frequency;
  const fz = z * frequency;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = smooth(fx - ix);
  const tz = smooth(fz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/** Ridged multi-octave noise in 0..1, for mountain ridges and coastline wobble. */
export function ridgeNoise(x, z, seed) {
  let total = 0;
  let amp = 0.55;
  let freq = 1 / 900;
  for (let octave = 0; octave < 3; octave += 1) {
    const n = valueNoise(x, z, freq, seed + octave * 101);
    total += amp * (1 - Math.abs(2 * n - 1));
    amp *= 0.5;
    freq *= 2.3;
  }
  return total;
}
