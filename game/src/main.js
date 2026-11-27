// Boot and the one loop for Merapi Airlift: input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast one), and
// the renderer paints what is there. The game moves between five screens: title,
// play, paused, crashed and all-delivered.
//
// ?seed=N fixes the islands, clouds and mission weather. ?shot=cover|cockpit|
// mission|ash (with &seed=N) stages that scene instead of running the loop, paints
// it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createFlight, FLIGHT_ASH, FLIGHT_CRASHED, FLIGHT_FUEL_EMPTY, FLIGHT_LANDED, FLIGHT_RING, FLIGHT_STALL } from './flight.js';
import { createMissions } from './missions.js';
import { ACTION_CAMERA, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_DONE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const BANNER_SECONDS = 4;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261127;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const flight = createFlight(world);
const missions = createMissions(world);
const renderer = createRenderer(canvas);
const audio = createAudio();

const game = {
  world,
  flight,
  missions,
  screen: SCREEN_TITLE,
  view: 'chase',
  time: 0,
  look: { yaw: 0, pitch: 0 },
  /** Extra camera pitch for staged scenes (e.g. looking up at an ash plume). */
  camPitchOffset: 0,
  banner: '',
  bannerTimer: 0,
  ashWarning: false,
  crashReason: '',
  best: 0,
};

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  game.best = readBest();
  const staged = stageShot(name, game);
  game.screen = staged.screen;
  game.view = staged.view;
  let painted = 0;
  function paint() {
    renderer.draw(game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let stallAnnounced = false;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    missions.reset();
    flight.reset(missions.current().from);
    world.resetRings();
    screen = SCREEN_PLAY;
    game.screen = SCREEN_PLAY;
    game.banner = '';
    game.bannerTimer = 0;
    game.crashReason = '';
    audio.unlock();
    announce('Terbang! Antar kargo ke ' + missions.current().to.name + '.');
  }

  function endGame(reason) {
    screen = SCREEN_OVER;
    game.screen = SCREEN_OVER;
    game.crashReason = reason;
    const score = missions.summary().score;
    if (score > best) {
      best = score;
      saveBest(best);
    }
    audio.crash();
    announce(`Pesawat jatuh: ${reason}. Skor ${score}.`);
  }

  function finishAllDelivered() {
    screen = SCREEN_DONE;
    game.screen = SCREEN_DONE;
    const score = missions.summary().score;
    if (score > best) {
      best = score;
      saveBest(best);
    }
    announce(`Semua kargo terkirim! Skor ${score}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Suara mati.' : 'Suara hidup.');
    }
    if (actions & ACTION_CAMERA && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) {
      game.view = game.view === 'cockpit' ? 'chase' : 'cockpit';
      announce(game.view === 'cockpit' ? 'Tampilan kokpit.' : 'Tampilan chase.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_DONE)) startGame();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_DONE)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      game.screen = SCREEN_PAUSED;
      announce('Jeda.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      game.screen = SCREEN_PLAY;
      announce('Terbang lagi.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // Attract mode: the title camera orbits the volcano; the world still breathes.
      game.time += STEP;
      world.step(STEP, game.time);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    game.time += STEP;
    const plane = flight.plane;
    const controls = {
      throttle: plane.throttle + input.throttleAxis() * STEP * 1.4,
      pitch: input.pitchAxis(),
      roll: input.rollAxis(),
      yaw: input.yawAxis(),
    };
    controls.throttle = Math.max(0, Math.min(1, controls.throttle));
    const leg = missions.current();
    const events = flight.step(STEP, controls, leg ? leg.weight : 0);
    world.step(STEP, game.time);
    missions.step(STEP, plane.airborne);
    game.look = input.look();
    game.ashWarning = Boolean(events & FLIGHT_ASH);

    if (events & FLIGHT_RING) {
      missions.addRingBonus();
      game.banner = missions.summary().lastNote;
      game.bannerTimer = BANNER_SECONDS;
      audio.ring();
    }
    if (events & FLIGHT_ASH) audio.warn(STEP);
    if (events & FLIGHT_STALL && !plane.onGround && !stallAnnounced) {
      stallAnnounced = true;
    } else if (plane.speed > 30) {
      stallAnnounced = false;
    }
    if (events & FLIGHT_FUEL_EMPTY) {
      game.banner = 'TANGKI KOSONG — MELUNCUR KE AIRSTRIP TERDEKAT!';
      game.bannerTimer = BANNER_SECONDS;
    }
    if (events & FLIGHT_LANDED) {
      const strip = plane.landedStrip;
      const mission = missions.current();
      if (strip && mission && strip.id === mission.to.id) {
        const soft = plane.lastTouchdownVs > -3.5;
        const delivered = missions.landedOn(plane, strip, soft, plane.fuel);
        if (delivered) {
          flight.serviceAtStrip();
          const summary = missions.summary();
          game.banner = summary.lastNote;
          game.bannerTimer = BANNER_SECONDS;
          audio.delivered();
          if (summary.phase === 'done') {
            finishAllDelivered();
            return;
          }
          missions.nextLeg();
        }
      } else if (strip) {
        game.banner = `Mendarat di ${strip.name} — bukan tujuan. Isi bahan bakar di sini.`;
        game.bannerTimer = BANNER_SECONDS;
        flight.serviceAtStrip();
      } else if (world.groundHeight(plane.x, plane.z) <= 0.5) {
        endGame('Mendarat di laut.');
        return;
      } else {
        game.banner = 'Mendarat darurat di luar runway — mesin rusak 22%.';
        game.bannerTimer = BANNER_SECONDS;
      }
    }
    if (events & FLIGHT_CRASHED) {
      if (world.groundHeight(plane.x, plane.z) <= 0.5) endGame('Jatuh ke laut.');
      else if (plane.damage >= 100) endGame('Mesin hancur oleh awan abu.');
      else endGame('Menabrak tanah terlalu keras.');
      return;
    }
    if (game.bannerTimer > 0) game.bannerTimer -= STEP;
    audio.update(plane, !plane.onGround);
    game.best = best;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step();
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    game.screen = screen;
    renderer.draw(game);
  }

  // Leaving the tab pauses a running game rather than letting the plane fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      game.screen = SCREEN_PAUSED;
      announce('Jeda.');
    }
  });

  game.best = best;
  announce('Merapi Airlift. Tekan Enter atau klik untuk terbang.');
  requestAnimationFrame(frame);
}

// A small handle for the play-test harness: read-only state, no cheats.
window.__merapi = { game, flight, missions, world };

if (shot) runShot(shot);
else runGame();
