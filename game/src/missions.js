// The courier loop for Merapi Airlift: four deliveries around the archipelago, each
// with its own cargo, weight and destination strip. A leg starts on the ground at the
// departure strip, pays out when the plane lands on the right strip, and refuels and
// repairs the plane there. Landing anywhere else is just a stop, not a delivery.

import { MISSIONS, SCORE } from './config.js';

export const MISSION_FLYING = 'flying';
export const MISSION_DELIVERED = 'delivered';
export const MISSION_DONE = 'done';

/** Seconds a leg is expected to take; faster legs earn a time bonus. */
const PAR_TIME = [150, 150, 170, 190];

export function createMissions(world) {
  let index = 0;
  let phase = MISSION_FLYING;
  let legTime = 0;
  let delivered = 0;
  let score = 0;
  let lastPayout = 0;
  let lastNote = '';

  function leg() {
    return world.missionLeg(index);
  }

  function reset() {
    index = 0;
    phase = MISSION_FLYING;
    legTime = 0;
    delivered = 0;
    score = 0;
    lastPayout = 0;
    lastNote = '';
    const first = leg();
    if (first) world.moveBeaconTo(first.toStrip);
  }

  function current() {
    const currentLeg = leg();
    if (!currentLeg) return null;
    return {
      id: currentLeg.id,
      cargo: currentLeg.cargo,
      weight: currentLeg.weight,
      brief: currentLeg.brief,
      from: currentLeg.fromStrip,
      to: currentLeg.toStrip,
      phase,
      legTime,
      delivered,
      score,
      lastPayout,
      lastNote,
    };
  }

  /** Distance in metres from the plane to the destination strip. */
  function distanceToTarget(plane) {
    const currentLeg = leg();
    if (!currentLeg) return 0;
    const dx = plane.x - currentLeg.toStrip.x;
    const dz = plane.z - currentLeg.toStrip.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  /**
   * Call when the plane lands on a strip. Returns true when that strip is the leg's
   * destination: the payout is scored, the plane is serviced, and the next leg starts.
   * Landing on the wrong strip (or rough ground) scores nothing.
   */
  function landedOn(plane, strip, soft, fuelPercent) {
    const currentLeg = leg();
    if (!currentLeg || phase !== MISSION_FLYING) return false;
    if (!strip || strip.id !== currentLeg.to) return false;
    const timeBonus = Math.max(0, Math.round((PAR_TIME[index] - legTime) * SCORE.timeBonusPerSecond));
    const fuelBonus = Math.round(fuelPercent * SCORE.fuelBonusPerPercent);
    const softBonus = soft ? SCORE.softLandingBonus : 0;
    lastPayout = SCORE.deliveryBase + timeBonus + fuelBonus + softBonus;
    score += lastPayout;
    delivered += 1;
    lastNote = `${currentLeg.cargo} terkirim ke ${currentLeg.toStrip.name}! +${lastPayout}`;
    index += 1;
    legTime = 0;
    if (index >= MISSIONS.length) {
      phase = MISSION_DONE;
      world.beacon.active = false;
    } else {
      phase = MISSION_DELIVERED;
      world.moveBeaconTo(leg().toStrip);
    }
    return true;
  }

  /**
   * Totals that stay readable after the last leg, when current() is null:
   * the phase, the score, how many legs were delivered and the last payout.
   */
  function summary() {
    return { phase, score, delivered, lastPayout, lastNote };
  }

  /** Acknowledge the delivery banner and start flying the next leg. */
  function nextLeg() {
    if (phase === MISSION_DELIVERED) phase = MISSION_FLYING;
  }

  /** Jump to a leg (used by the screenshot scenes to start mid-loop). */
  function startAt(legIndex) {
    index = Math.max(0, Math.min(MISSIONS.length - 1, legIndex));
    phase = MISSION_FLYING;
    legTime = 0;
    const currentLeg = leg();
    if (currentLeg) world.moveBeaconTo(currentLeg.toStrip);
  }

  function addRingBonus() {
    score += SCORE.ringBonus;
    lastNote = `Ring emas! +${SCORE.ringBonus}`;
    lastPayout = SCORE.ringBonus;
  }

  function step(dt, airborne) {
    if (phase === MISSION_FLYING && airborne) legTime += dt;
  }

  reset();
  return { current, summary, distanceToTarget, landedOn, nextLeg, startAt, addRingBonus, step, reset };
}
