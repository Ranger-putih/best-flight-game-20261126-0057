// The flight model for Merapi Airlift: an arcade STOL bush plane. Throttle sets the
// target speed, pitch trades speed for altitude, bank turns the plane in a coordinated
// turn, and below stall speed the wing stops flying and the nose drops. Fuel burns with
// throttle, ash eats the engine, and the ground decides between a landing, a rough
// bump and a crash. step() advances one fixed step and returns what happened as bit
// flags, so the caller can react without the model knowing about screens or sound.

import { PLANE, SEA_LEVEL, WORLD_SIZE } from './config.js';
import { EVENT_CRASHED } from './world.js';

export const FLIGHT_OK = 0;
export const FLIGHT_LANDED = 1;
export const FLIGHT_CRASHED = 2;
export const FLIGHT_RING = 4;
export const FLIGHT_ASH = 8;
export const FLIGHT_FUEL_EMPTY = 16;
export const FLIGHT_STALL = 32;

const GRAVITY = 9.81;
const TAXI_DRAG = 6;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/** Shortest signed angle from `from` to `to`, in -PI..PI. */
export function angleTo(from, to) {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function createFlight(world) {
  const plane = {
    x: 0, z: 0, y: 0,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, verticalSpeed: 0,
    throttle: 0, rpm: 0,
    fuel: PLANE.fuelCapacity,
    damage: 0,
    onGround: true,
    landedStrip: null,
    airborne: false,
    propAngle: 0,
    /** Vertical speed at the last touchdown, for judging soft landings. */
    lastTouchdownVs: 0,
  };

  /** Put the plane on a strip's runway, facing down it, ready to take off. */
  function placeOnStrip(strip) {
    plane.x = strip.x - Math.sin(strip.heading) * (strip.length / 2 - 30);
    plane.z = strip.z - Math.cos(strip.heading) * (strip.length / 2 - 30);
    plane.y = strip.elev;
    plane.heading = strip.heading;
    plane.pitch = 0;
    plane.roll = 0;
    plane.speed = 0;
    plane.verticalSpeed = 0;
    plane.throttle = 0;
    plane.rpm = 0;
    plane.onGround = true;
    plane.airborne = false;
    plane.landedStrip = strip;
  }

  function reset(strip) {
    plane.fuel = PLANE.fuelCapacity;
    plane.damage = 0;
    placeOnStrip(strip);
  }

  /**
   * One fixed step. `controls` carries throttle/pitch/roll/yaw axes (-1..1) and the
   * cargo weight in kg (heavy cargo climbs worse). Returns FLIGHT_* flags.
   */
  function step(dt, controls, cargoWeight) {
    let events = FLIGHT_OK;
    const heavy = 1 - Math.min(0.35, cargoWeight / 900);
    const engineHealth = 1 - plane.damage / PLANE.damageLimit;

    // Throttle eases toward the pilot's setting; a dead engine cannot spool up.
    const targetThrottle = plane.fuel > 0 && engineHealth > 0.05 ? clamp(controls.throttle, 0, 1) : 0;
    plane.throttle += clamp(targetThrottle - plane.throttle, -dt * 0.8, dt * 0.8);
    plane.rpm = plane.throttle * engineHealth;
    plane.propAngle += (4 + plane.rpm * 40) * dt;

    // Target speed follows throttle; drag grows with the square of speed.
    const targetSpeed = plane.rpm * PLANE.maxSpeed;
    const drag = 0.12 + (plane.speed * plane.speed) / (PLANE.maxSpeed * PLANE.maxSpeed) * 0.35;
    plane.speed += clamp(targetSpeed - plane.speed, -drag * 22 * dt, 1.6 * dt * 10);
    if (plane.onGround) plane.speed = Math.max(0, plane.speed - TAXI_DRAG * dt * (1 - plane.throttle));
    plane.speed = clamp(plane.speed, 0, PLANE.maxSpeed);

    // Pitch: the stick moves it, and it eases back toward level hands-off.
    plane.pitch += controls.pitch * PLANE.pitchRate * dt;
    plane.pitch = clamp(plane.pitch, -0.55, 0.6);
    if (controls.pitch === 0) plane.pitch *= Math.max(0, 1 - dt * 0.45);

    // Roll: the stick banks it; hands-off it levels itself, slowly.
    plane.roll += controls.roll * PLANE.rollRate * dt;
    plane.roll = clamp(plane.roll, -1.1, 1.1);
    if (controls.roll === 0) plane.roll *= Math.max(0, 1 - dt * 0.9);

    // A banked turn: heading follows the bank, faster when slow, plus a little rudder.
    const turnRate = (GRAVITY * Math.tan(plane.roll)) / Math.max(plane.speed, 8);
    plane.heading += (clamp(turnRate, -PLANE.turnRate, PLANE.turnRate) + controls.yaw * 0.25) * dt;

    // Lift: above stall speed the wing flies and pitch becomes climb; below it the
    // plane sinks and the nose drops on its own.
    const flying = plane.speed > PLANE.stallSpeed;
    if (flying) {
      const climb = Math.sin(plane.pitch) * plane.speed * heavy;
      plane.verticalSpeed += clamp(climb - plane.verticalSpeed, -dt * 6, dt * 6);
    } else {
      plane.verticalSpeed -= GRAVITY * 0.55 * dt;
      if (!plane.onGround) plane.pitch -= 0.25 * dt;
      events |= FLIGHT_STALL;
    }
    plane.verticalSpeed = clamp(plane.verticalSpeed, -22, PLANE.climbRate);

    // Move.
    const forwardX = Math.sin(plane.heading);
    const forwardZ = Math.cos(plane.heading);
    plane.x += forwardX * plane.speed * dt;
    plane.z += forwardZ * plane.speed * dt;
    plane.y += plane.verticalSpeed * dt;

    // Stay inside the map: open sea all around, but turn the plane back gently.
    const edge = WORLD_SIZE / 2 - 60;
    if (Math.abs(plane.x) > edge || Math.abs(plane.z) > edge) {
      plane.heading += angleTo(plane.heading, Math.atan2(-plane.x, -plane.z)) * dt * 0.8;
    }

    // Fuel burns with throttle; empty tanks mean gliding, not flying.
    if (plane.throttle > 0.02) {
      plane.fuel -= PLANE.fuelBurn * (0.25 + plane.throttle * 0.75) * dt;
      if (plane.fuel <= 0) {
        plane.fuel = 0;
        events |= FLIGHT_FUEL_EMPTY;
      }
    }

    // Ash clouds chew the engine: damage climbs and the RPM sags while inside.
    const ash = world.inAsh(plane.x, plane.y, plane.z);
    if (ash && !plane.onGround) {
      plane.damage = Math.min(PLANE.damageLimit, plane.damage + 9 * dt);
      events |= FLIGHT_ASH;
    }

    // Bonus rings pay out when flown through.
    if (!plane.onGround && world.ringPassed(plane.x, plane.y, plane.z)) {
      events |= FLIGHT_RING;
    }

    // The ground: landing, rough bump or crash.
    const ground = world.groundHeight(plane.x, plane.z);
    if (plane.y <= ground) {
      plane.y = ground;
      if (!plane.onGround) {
        const touchdown = world.touchdown(plane.x, plane.z, plane.verticalSpeed, plane.roll);
        plane.lastTouchdownVs = plane.verticalSpeed;
        if (touchdown.event === EVENT_CRASHED) {
          events |= FLIGHT_CRASHED;
        } else {
          events |= FLIGHT_LANDED;
          plane.landedStrip = touchdown.strip;
          plane.speed *= touchdown.strip ? 0.55 : 0.35;
          if (!touchdown.strip) plane.damage = Math.min(PLANE.damageLimit, plane.damage + 22);
        }
        plane.verticalSpeed = 0;
        plane.pitch = 0;
        plane.roll = 0;
      }
      plane.onGround = true;
      plane.verticalSpeed = 0;
      // Come to a full stop only when the pilot is not asking for power.
      if (plane.speed < 0.5 && plane.throttle < 0.05) plane.speed = 0;
    } else if (plane.y > ground + 0.6) {
      plane.onGround = false;
      plane.airborne = true;
    }

    // Ditching in the sea is a crash, not a landing.
    if (plane.onGround && ground <= SEA_LEVEL + 0.5 && plane.speed > 4) {
      events |= FLIGHT_CRASHED;
    }
    return events;
  }

  /** Refuel and patch the plane up at a strip; called after a delivery lands. */
  function serviceAtStrip() {
    plane.fuel = PLANE.fuelCapacity;
    plane.damage = 0;
  }

  return { plane, placeOnStrip, reset, step, serviceAtStrip };
}
