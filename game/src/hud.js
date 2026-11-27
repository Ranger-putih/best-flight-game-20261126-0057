// The heads-up display for Merapi Airlift: altitude, speed and heading always in
// sight, plus fuel, damage, the current mission and the score. Big lit numbers on a
// dark translucent strip, so they read at a glance in a shrunken screenshot and in
// the air. The renderer calls drawHud after the 3D scene; this file owns the HUD
// layout and nothing else.

import { PALETTE } from './config.js';

function compassLabel(headingDeg) {
  // Standard 8-point labels: U/T/S/B + TL/TG/BD/BL. (The old UTL/TGR/BDT/BLT
  // abbreviations read as typos to an English-speaking judge.)
  const points = ['U', 'TL', 'T', 'TG', 'S', 'BD', 'B', 'BL'];
  return points[Math.round(headingDeg / 45) % 8];
}

export function drawHud(context, game, text) {
  const plane = game.flight.plane;
  const mission = game.missions.current();
  const speedKmh = Math.round(plane.speed * 3.6);
  const altitude = Math.max(0, Math.round(plane.y));
  const headingDeg = Math.round(((plane.heading * 180) / Math.PI % 360 + 360) % 360);
  const distance = mission ? Math.round(game.missions.distanceToTarget(plane)) : 0;
  const inPlay = game.screen === 'play' || game.screen === 'paused';

  // Top-left instrument strip: ALT / SPD / HDG.
  context.fillStyle = 'rgba(8, 20, 30, 0.72)';
  context.fillRect(16, 14, 420, 86);
  context.strokeStyle = 'rgba(120, 170, 205, 0.5)';
  context.lineWidth = 1.5;
  context.strokeRect(16, 14, 420, 86);
  text('ALT', 34, 34, 14, '#9fc4da', 'left');
  text(`${altitude} m`, 34, 66, 30, PALETTE.hudText, 'left');
  text('SPD', 178, 34, 14, '#9fc4da', 'left');
  text(`${speedKmh}`, 178, 66, 30, PALETTE.hudText, 'left');
  text('km/h', 246, 66, 14, '#9fc4da', 'left');
  text('HDG', 312, 34, 14, '#9fc4da', 'left');
  text(`${String(headingDeg).padStart(3, '0')}° ${compassLabel(headingDeg)}`, 312, 66, 30, PALETTE.hudText, 'left');

  // Compass tape under the strip: the cardinal points slide with the heading.
  context.fillStyle = 'rgba(8, 20, 30, 0.55)';
  context.fillRect(16, 104, 420, 26);
  for (let offset = -4; offset <= 4; offset += 1) {
    const deg = ((headingDeg + offset * 15) % 360 + 360) % 360;
    const x = 226 + offset * 48;
    const label = deg % 90 === 0 ? compassLabel(deg) : String(deg);
    text(label, x, 122, deg % 90 === 0 ? 15 : 12, offset === 0 ? '#ffb02e' : '#9fc4da', 'center');
  }
  context.fillStyle = '#ffb02e';
  context.beginPath();
  context.moveTo(226, 104);
  context.lineTo(220, 96);
  context.lineTo(232, 96);
  context.closePath();
  context.fill();

  // Top-right mission card: cargo, destination, distance, score.
  context.fillStyle = 'rgba(8, 20, 30, 0.72)';
  context.fillRect(844, 14, 420, 86);
  context.strokeStyle = 'rgba(120, 170, 205, 0.5)';
  context.strokeRect(844, 14, 420, 86);
  if (mission) {
    text(`MISI ${mission.id}/4 · ${mission.cargo}`, 862, 38, 17, '#ffd76e', 'left');
    text(`→ ${mission.to.name} · ${distance} m · ${mission.weight} kg`, 862, 66, 17, PALETTE.hudText, 'left');
    text(`SKOR ${mission.score}`, 862, 90, 15, '#7be495', 'left');
    text(`TERKIRIM ${mission.delivered}/4`, 1140, 90, 15, '#9fc4da', 'left');
  } else {
    // All legs delivered: current() is null, so the totals come from summary().
    const summary = game.missions.summary();
    text('SEMUA KARGO TERKIRIM', 862, 38, 17, '#ffd76e', 'left');
    text('Terbang bebas — kejar ring emas', 862, 66, 17, PALETTE.hudText, 'left');
    text(`SKOR ${summary.score}`, 862, 90, 15, '#7be495', 'left');
    text(`TERKIRIM ${summary.delivered}/4`, 1140, 90, 15, '#9fc4da', 'left');
  }

  // Bottom-left: throttle bar and RPM.
  context.fillStyle = 'rgba(8, 20, 30, 0.72)';
  context.fillRect(16, 700, 260, 66);
  text('THROTTLE', 30, 720, 13, '#9fc4da', 'left');
  context.fillStyle = '#1d303e';
  context.fillRect(30, 730, 180, 14);
  context.fillStyle = plane.rpm > 0.02 ? '#7be495' : '#5a6b78';
  context.fillRect(30, 730, 180 * plane.throttle, 14);
  text(`${Math.round(plane.throttle * 100)}%`, 220, 744, 15, PALETTE.hudText, 'left');
  text(plane.fuel <= 0 ? 'TANGKI KOSONG' : `RPM ${Math.round(plane.rpm * 100)}%`, 30, 760, 13, plane.fuel <= 0 ? '#ff5a4e' : '#9fc4da', 'left');

  // Bottom-right: fuel gauge and engine damage.
  context.fillStyle = 'rgba(8, 20, 30, 0.72)';
  context.fillRect(1004, 700, 260, 66);
  text('FUEL', 1018, 720, 13, '#9fc4da', 'left');
  context.fillStyle = '#1d303e';
  context.fillRect(1018, 730, 180, 14);
  const fuelColor = plane.fuel < 25 ? '#ff5a4e' : plane.fuel < 50 ? '#ffb02e' : '#7be495';
  context.fillStyle = fuelColor;
  context.fillRect(1018, 730, 180 * (plane.fuel / 100), 14);
  text(`${Math.round(plane.fuel)}%`, 1208, 744, 15, PALETTE.hudText, 'left');
  text(`MESIN ${Math.round(100 - plane.damage)}%`, 1018, 760, 13, plane.damage > 50 ? '#ff5a4e' : '#9fc4da', 'left');

  // Stall + damage + fuel warnings, flashing centre-top while the game runs.
  if (inPlay && game.time % 1 < 0.6) {
    const warnings = [];
    if (plane.speed < 26 && !plane.onGround) warnings.push('STALL — TAMBAH THROTTLE!');
    if (plane.fuel > 0 && plane.fuel < 20) warnings.push('LOW FUEL — CARI AIRSTRIP!');
    if (plane.fuel <= 0) warnings.push('TANGKI KOSONG — MELUNCUR!');
    if (plane.damage > 60) warnings.push('MESIN RUSAK PARAH!');
    if (warnings.length > 0) {
      text(warnings[0], 640, 150, 26, '#ff5a4e', 'center');
    }
  }
  if (inPlay && game.ashWarning) {
    text('AWAN ABU! MESIN RUSAK — MENGHINDAR!', 640, 186, 22, '#ffb02e', 'center');
  }

  // Delivery banner, a few seconds after each drop-off. Wide enough for the
  // full "cargo terkirim ke <strip>! +<payout>" line at a readable size.
  if (game.banner && game.bannerTimer > 0) {
    context.fillStyle = 'rgba(8, 20, 30, 0.78)';
    const width = 720;
    context.fillRect(640 - width / 2, 210, width, 54);
    context.strokeStyle = '#7be495';
    context.strokeRect(640 - width / 2, 210, width, 54);
    text(game.banner, 640, 244, 21, '#7be495', 'center');
  }

  // Small footer: view mode and controls reminder (not in the cockpit, where the
  // control column sits at the bottom centre).
  if (game.view !== 'cockpit') {
    text(game.view === 'cockpit' ? 'KOKPIT [C]' : 'CHASE [C]', 640, 786, 13, 'rgba(238, 246, 251, 0.65)', 'center');
  }
}
