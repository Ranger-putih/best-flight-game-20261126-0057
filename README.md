# Merapi Airlift

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/Ranger-putih/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/Ranger-putih/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Merapi Airlift** — a bush-plane courier game over a volcanic Indonesian
archipelago. Fly the little STOL plane **PK-MRA "Elang"** between four grass
airstrips (Merapi Field → Sumbing Strip → Sindoro Strip → Slamet Ridge →
Merapi Field), delivering medicine, pump parts, mail and emergency aid while
the volcanoes smoke around you.

Entry for the make.fun bounty
[best-flight-game-20261126-0057](https://make.fun/bounty/best-flight-game-20261126-0057)
— "Make the best flight game".

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network, no libraries — plain static files under `game/`,
vanilla Canvas 2D. The terrain is a procedural voxel-space heightfield (real
rolling volcanic islands, beaches and sea), the sky, clouds and ash plumes are
drawn in code, and the engine, wind and warnings are synthesised WebAudio.

## Controls

| Key | Action |
| --- | --- |
| W / S (or Shift / Ctrl) | Throttle up / down |
| ↑ / ↓ | Pitch up / down (climb / descend) |
| ← / → or A / D | Bank left / right |
| Q / E | Rudder |
| Mouse drag | Look around (chase camera) |
| C | Chase view ↔ cockpit view (backlit instruments) |
| P / Esc | Pause |
| M | Mute |
| Enter / click | Start, restart |
| R | Restart after a crash |

## The flying

- **Four missions, four different cargoes and weights** — heavy cargo climbs
  worse, so every leg is a different decision about throttle and altitude.
- **Fuel** burns with throttle and refills only on an airstrip. Run dry and you
  glide.
- **Volcanic ash clouds** damage the engine while you fly through them — go
  around, or stay low under the plume.
- **Landings matter**: touch down soft on the runway for a bonus, land rough
  and the plane takes damage, land in the sea or on a hillside and the flight
  is over. Stall below flying speed and the nose drops.
- **Golden bonus rings** float between the islands: fly through one for
  +50 points. A glowing beacon ring marks the destination strip.
- **Score**: delivery + time bonus + fuel bonus + soft-landing bonus, with a
  best score kept in the browser.

## Screenshots

The four shots in `screenshots/` are real renders of this code, staged
deterministically with `?shot=<name>&seed=7` (see `shots.json`):

1. `1-cover.jpg` — chase view closing on Sumbing Strip, beacon ring ahead
2. `2-cockpit.jpg` — cockpit view, backlit instruments, volcano ahead
3. `3-mission.jpg` — low approach to Sindoro Strip, ring target
4. `4-ash.jpg` — flying the ash plume over Slamet volcano

## Source layout

```
game/
  index.html        page + canvas
  src/
    main.js         boot + loop + screens
    config.js       tuning, islands, strips, missions, palette
    input.js        keyboard + mouse
    world.js        terrain heightfield, strips, ash, clouds, rings
    flight.js       STOL flight model (throttle, lift, stall, damage)
    missions.js     the four-leg courier loop + scoring
    render.js       voxel terrain, sky, plane, cockpit
    hud.js          altitude / speed / heading + fuel + mission HUD
    audio.js        synthesised engine, wind, warnings (WebAudio)
    shots.js        deterministic screenshot scenes + autopilot
    random.js       seeded RNG + value noise
main.ts             hand-in program (copies game/ + screenshots/, writes dossier.json)
vendor/             make.fun library, copied from the kit unchanged
```

## License

MIT — see [LICENSE](LICENSE).
