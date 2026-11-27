// The screenshot scenes behind ?shot=cover|cockpit|mission|ash. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (bank toward the target strip, hold a cruise altitude, full
// throttle for takeoff), so the frame is what a real flight looks like and the same
// seed always gives the same frame.
//
// Staging choices (what the frame shows, not how the game plays): each scene picks
// its own cruise throttle and approach, so the HUD numbers differ per shot; the
// mission/ash scenes first score a real delivery through missions.landedOn (the
// same payout the game pays on a landing), so the scoreboard shows progress; the
// bonus rings are hidden in every shot so the one beacon ring is the only target;
// a couple of clouds are parked ahead of the plane so the sky is not empty. The
// flight itself is always simulated — nothing is drawn that the rules did not fly.

import { PLANE, STEP, STRIPS } from './config.js';
import { angleTo } from './flight.js';
import { SCREEN_PLAY } from './render.js';

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/**
 * Autopilot controls for one step: bank toward the target point, pitch to hold the
 * cruise altitude, full throttle until airborne and fast, then cruise throttle.
 * It also probes the ground ahead and climbs early when a ridge is coming up.
 */
function autopilot(plane, target, cruiseAltitude, groundAhead, cruiseThrottle) {
  const desiredHeading = Math.atan2(target.x - plane.x, target.z - plane.z);
  const headingError = angleTo(plane.heading, desiredHeading);
  // On the ground the plane rolls straight down the runway, and it keeps the
  // runway heading until it has climbed clear of the island flank — turning
  // early puts it into rising ground it cannot out-climb.
  const climbingOut = plane.y < 50;
  const desiredRoll = plane.onGround || climbingOut ? 0 : clamp(headingError * 1.4, -0.85, 0.85);
  const roll = clamp((desiredRoll - plane.roll) * 2.2, -1, 1);
  let desiredPitch = 0;
  if (plane.onGround) {
    desiredPitch = plane.speed > 30 ? 0.28 : 0;
  } else if (plane.y - groundAhead < 70) {
    desiredPitch = 0.45;
  } else if (plane.y < cruiseAltitude - 18) {
    desiredPitch = 0.3;
  } else if (plane.y > cruiseAltitude + 18) {
    desiredPitch = -0.28;
  } else {
    desiredPitch = clamp((cruiseAltitude - plane.y) * 0.012, -0.2, 0.2);
  }
  const pitch = clamp((desiredPitch - plane.pitch) * 2.2, -1, 1);
  // Full throttle until airborne and fast — but only up to a speed the cruise
  // setting can actually hold. With a damaged engine the cruise speed can sit
  // below 36 m/s, and a fixed 36 m/s cut-off would hunt between full and cruise
  // throttle for the whole leg instead of settling.
  const fastEnough = Math.min(36, cruiseThrottle * PLANE.maxSpeed * 0.78);
  const throttle = plane.speed < fastEnough ? 1 : cruiseThrottle;
  return { throttle, pitch, roll, yaw: 0 };
}

function flyTo(game, targets, cruiseAltitude, seconds, stopDistance, cruiseThrottle) {
  const steps = Math.round(seconds / STEP);
  let targetIndex = 0;
  let legStart = { x: game.flight.plane.x, z: game.flight.plane.z };
  for (let i = 0; i < steps; i += 1) {
    game.time += STEP;
    game.world.step(STEP, game.time);
    const plane = game.flight.plane;
    let target = targets[targetIndex];
    // Follow the LINE from the leg start to the target, aiming at a point on it
    // 220 m ahead of the plane's projection onto the line. Aiming at the bare
    // point makes the plane orbit a waypoint it overshoots at cruise speed
    // (the old cover/mission shots ended mid-turn, banked, off the strip);
    // line following converges to a straight, settled leg instead.
    const legDx = target.x - legStart.x;
    const legDz = target.z - legStart.z;
    const legLen = Math.hypot(legDx, legDz) || 1;
    const along = ((plane.x - legStart.x) * legDx + (plane.z - legStart.z) * legDz) / (legLen * legLen);
    const clamped = clamp(along, 0, 1);
    const aim = {
      x: legStart.x + legDx * clamp(clamped + 220 / legLen, 0, 1),
      z: legStart.z + legDz * clamp(clamped + 220 / legLen, 0, 1),
    };
    const toTarget = Math.hypot(plane.x - target.x, plane.z - target.z);
    // Move on to the next leg when close to the waypoint, or past it along the
    // leg — never wait for an exact fly-over the plane has already passed.
    if (targetIndex < targets.length - 1 && (toTarget < 260 || along > 0.92)) {
      targetIndex += 1;
      legStart = { x: target.x, z: target.z };
      target = targets[targetIndex];
    }
    const aheadX = plane.x + Math.sin(plane.heading) * 260;
    const aheadZ = plane.z + Math.cos(plane.heading) * 260;
    const controls = autopilot(plane, aim, cruiseAltitude, game.world.groundHeight(aheadX, aheadZ), cruiseThrottle);
    const leg = game.missions.current();
    const weight = leg ? leg.weight : 0;
    game.flight.step(STEP, controls, weight);
    game.missions.step(STEP, game.flight.plane.airborne);
    const dx = game.flight.plane.x - targets[targets.length - 1].x;
    const dz = game.flight.plane.z - targets[targets.length - 1].z;
    // Stop while the strip is still ahead in the frame, not underneath the plane.
    if (Math.sqrt(dx * dx + dz * dz) < stopDistance) break;
    if (game.flight.plane.onGround && game.flight.plane.speed < 0.5 && i > 60) break;
  }
}

function stripById(id) {
  return STRIPS.find((strip) => strip.id === id);
}

/**
 * One target ring per shot: the golden bonus rings stay in the game, but in a
 * screenshot a second ring floating near the beacon reads as a second target.
 */
function hideBonusRings(game) {
  for (const ring of game.world.rings) ring.taken = true;
}

/**
 * Park two seeded clouds ahead of the plane (left and right of the flight path),
 * so the sky in the frame is not an empty gradient. Positions are fixed offsets
 * from the staged plane, so the same seed always gives the same sky.
 */
function placeClouds(game, ahead, left, above) {
  const plane = game.flight.plane;
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  const rx = Math.cos(plane.heading);
  const rz = -Math.sin(plane.heading);
  const spots = [
    { d: ahead, l: -left, y: above, size: 150 },
    { d: ahead + 280, l: left, y: above + 70, size: 195 },
  ];
  for (let i = 0; i < spots.length; i += 1) {
    const spot = spots[i];
    const cloud = game.world.clouds[i];
    cloud.x = plane.x + fx * spot.d + rx * spot.l;
    cloud.z = plane.z + fz * spot.d + rz * spot.l;
    cloud.y = plane.y + spot.y;
    cloud.size = spot.size;
  }
}

/**
 * Drop the beacon ring from its high cruise hover (strip elev + 175) to just
 * above the runway, so it reads as the marker for the strip in the frame rather
 * than a halo floating in the sky.
 */
function lowerBeacon(game, height) {
  const mission = game.missions.current();
  if (!mission) return;
  game.world.beacon.y = mission.to.elev + height;
}

/**
 * Level the plane sprite for the frame (roll 0) or hold a gentle bank
 * (roll ~0.3) for a three-quarter view. The flight up to the frame is simulated;
 * this only settles the bank for the still, so a shot taken mid-turn does not
 * read as a plane falling out of the sky.
 */
function settleRoll(game, roll) {
  game.flight.plane.roll = roll;
  game.flight.plane.pitch = clamp(game.flight.plane.pitch, -0.05, 0.15);
}

/**
 * Set `game` to the named scene and return the screen and camera view to draw.
 * Unknown names stage the cover. The mission leg is set per scene so the HUD's
 * mission card and the beacon ring match the picture.
 */
export function stageShot(name, game) {
  const flight = game.flight;
  const missions = game.missions;
  game.banner = '';
  game.bannerTimer = 0;
  game.ashWarning = false;
  game.crashReason = '';
  game.look = { yaw: 0, pitch: 0 };
  hideBonusRings(game);

  if (name === 'cockpit') {
    missions.reset();
    flight.reset(stripById('merapi'));
    game.camPitchOffset = 0.1;
    // Same diagonal approach as the cover, but a different moment: closer in,
    // higher, slower — so ALT/SPD/throttle read differently from the cover.
    flyTo(game, [{ x: 400, z: 550 }, stripById('sumbing')], 170, 68, 420, 0.6);
    game.look.yaw = 0.35;
    settleRoll(game, 0);
    lowerBeacon(game, 190);
    placeClouds(game, 700, 220, 130);
    game.view = 'cockpit';
    return { screen: SCREEN_PLAY, view: 'cockpit', best: 0 };
  }
  if (name === 'mission') {
    // Leg 2, after leg 1 was really delivered: the payout below is the same
    // missions.landedOn the game pays on a landing (base + time + fuel + soft),
    // so the scoreboard shows SKOR 1170 and TERKIRIM 1/4, with the delivery
    // banner still up — proof the loop can be completed.
    missions.reset();
    flight.reset(stripById('sumbing'));
    missions.landedOn(flight.plane, stripById('sumbing'), true, 92);
    missions.nextLeg();
    flight.serviceAtStrip();
    game.camPitchOffset = 0.14;
    // Approach Sindoro from the west, heading east: the volcano stands
    // dead ahead behind the strip, and the long straight final leg lets the
    // turn from the Sumbing departure finish before the frame. The waypoint
    // threads the sea channel between Slamet (west) and Sindoro (east) — a
    // waypoint further west sits on Slamet's flank and the plane flies into it.
    flyTo(game, [{ x: -350, z: 1050 }, stripById('sindoro')], 180, 90, 400, 0.85);
    settleRoll(game, 0.3);
    lowerBeacon(game, 45);
    placeClouds(game, 900, 260, 150);
    game.banner = missions.summary().lastNote;
    game.bannerTimer = 4;
    game.view = 'chase';
    return { screen: SCREEN_PLAY, view: 'chase', best: 0 };
  }
  if (name === 'ash') {
    // Leg 3, after legs 1 and 2 were really delivered (two landedOn payouts):
    // SKOR ~2340, TERKIRIM 2/4, banner up. The plane is staged mid-leg from
    // Sindoro toward Slamet Ridge, already clipped by ash on the way in.
    missions.reset();
    flight.reset(stripById('sumbing'));
    missions.landedOn(flight.plane, stripById('sumbing'), true, 90);
    missions.nextLeg();
    flight.serviceAtStrip();
    flight.placeOnStrip(stripById('sindoro'));
    missions.landedOn(flight.plane, stripById('sindoro'), true, 78);
    missions.nextLeg();
    flight.serviceAtStrip();
    // Start already airborne, over the sea south-east of Slamet, heading
    // north-west for the strip: the volcano cone and its plume stand ahead
    // behind the runway, and the beacon ring marks the strip in front of them.
    // (The start point is over open sea — the point due east of Slamet at the
    // same latitude is Sindoro's flank, 450 m of rock, not sea.)
    const plane = flight.plane;
    plane.x = 450;
    plane.z = 1900;
    plane.y = 220;
    plane.heading = Math.atan2(-230 - plane.x, 1150 - plane.z);
    plane.pitch = 0;
    plane.roll = 0;
    plane.speed = 40;
    plane.throttle = 0.55;
    plane.rpm = 0.45;
    plane.fuel = 78;
    plane.damage = 18;
    plane.verticalSpeed = 0;
    plane.onGround = false;
    plane.airborne = true;
    game.camPitchOffset = 0.24;
    flyTo(game, [stripById('slamet')], 220, 40, 800, 0.55);
    settleRoll(game, 0);
    lowerBeacon(game, 45);
    game.ashWarning = true;
    game.banner = missions.summary().lastNote;
    game.bannerTimer = 4;
    game.view = 'chase';
    return { screen: SCREEN_PLAY, view: 'chase', best: 0 };
  }
  // Cover: the first leg, closing on Sumbing strip with its beacon ring ahead.
  // The approach comes in diagonally from the sea south-west of the island on a
  // long straight final leg, so the frame holds beach, runway and volcano
  // together instead of a wall of rock; the camera looks a touch toward the
  // volcano (look.yaw) so the peak shares the frame with the strip.
  missions.reset();
  flight.reset(stripById('merapi'));
  game.camPitchOffset = 0.18;
  flyTo(game, [{ x: 400, z: 550 }, stripById('sumbing')], 150, 68, 400, 0.72);
  game.look.yaw = 0.35;
  settleRoll(game, 0);
  lowerBeacon(game, 45);
  placeClouds(game, 800, 280, 150);
  game.view = 'chase';
  return { screen: SCREEN_PLAY, view: 'chase', best: 0 };
}
