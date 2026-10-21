# Trick Shot (HopLobby edition): context

HopLobby fork of the user's Bow Bullseye / Trick Shot HORSE (`G:\ICM Workspace\01-Projects\bow-bullseye`, which was
NOT changed). Built 2026-10-21 from that game's plan ("playing against friends"). Game id `trick-shot`.

## What it is
Archery HORSE for 1-4 players as their own HopLobby avatars. Setter jumps/flips and sticks an arrow in any target
from the AIR; every other living player must hit the same target (from the air) in turn or take a letter
(A-R-R-O-W, or B-O-W with the lobby option). A missed set passes the setter turn. Last one standing wins. Alone:
a computer rival (lobby option = its difficulty).

## How it works
- Every screen runs the whole sim (`Work/src/sim.js`, pure logic). Each screen OWNS its archer(s) and streams the
  pose ~15 Hz (`k:"p"`); a shot goes once (`k:"shot"`, origin+velocity) and every screen flies the same arrow in
  fixed 1/240 s steps. The HOST decides turns/letters and tells everyone: `turn`, `res`, `over` (`main.js`).
  `S.snap()/applySnap()` is the host's state; syncState + `requestState` catch up late/reloaded screens; a client
  watchdog re-asks if a host message is missing. Host leaves -> the new host takes over (`host` event). Leavers are
  `out` (`sim.drop`). Archer ids = lobby players sorted by id; kinds local/remote/bot.
- Avatars: `src/avatar.js` (from Fairway Kings) retargets the hidden Mixamo "Aj" driver onto the player's glb; the
  bow + quiver stay on the driver's bones (may not sit exactly in an avatar's hand: CHECK in Dev Mode).
- three.js r170 as an ES module (`src/boot.js` sets `globalThis.THREE`; classic scripts are `defer`).
- No own menu/pause/results: `HopLobby.menu.set` (key list), lobby options in `hoplobby.json` (validated 2026-10-21),
  graphics via `View.applyGraphics(HopLobby.graphics)`, sensitivity/invertY/audio from `HopLobby.settings`.
  `endGame(results)` from the host 4.5 s after the match. Desktop only (touch shows a "needs keyboard and mouse" page).
  If the frame refuses pointer lock twice, the plain mouse is used instead (`Input.free`).
- Only 5 bodies shipped (Aj driver + 4 bot looks). Music slot empty. CTSG seal on the loading screen only; no
  HopLobby logo anywhere.

## Tested (2026-10-21, headless Edge, stand-in avatars, fake SDK)
- `node tools/sim-test.js 2 1 x 2|4` and `1 1 human 3`: bots-only and autopilot matches finish for 2-4 archers.
- `tools/harness.html?n=2..4&auto&drive&nodraw&steps=20&letters=3`: full matches to `endGame`, all screens agree on
  turns/letters; host leaving mid-match -> new host carries on, leaver marked OUT. Screenshots: Notes/shots.
- NOT done: real Dev Mode lobby, real avatars (grip/stance/height), real mouse feel, pointer lock inside HopLobby's
  frame, 3-4 real players, joining/reloading mid-round, shot clock with a silent player, fps on the UHD 600.

## Run / test
- `node tools\serve.cjs 8197` (serves the repo root) -> http://127.0.0.1:8197/Work/index.html?fake=A (standalone,
  fake SDK) or `/tools/harness.html?n=2&auto&drive` (several frames). Node: `G:\ICM Workspace\tools\node\node.exe`.
- Headless: `tools\edge.ps1 -Port 9461`, `node tools\shot.cjs --port=9461 --url=... --evalfile=tools/mp-state.js`; STOP Edge after (`-Stop`).
- Dev Mode: `prepare_dev_mode` with `http://localhost:8197/Work/` style URL or a tunnel; the user opens the link.

## Next
1. User Dev Mode test with friends (2-4): real avatars, bow in hand, pointer lock, turn flow.
2. Fix what that shows; then HANDOFF licence table check, demo host (GitHub Pages), cover art, submission draft.
   Never push/submit without asking.
## Branding in the field (2026-10-21)
20 advertising boards round the arena edge (world.js adBoards: CTSG seal, HopLobby primary logo, both), a banner on THE WALL and one on the tower. Scenery only (arrows pass through). Logos unaltered; kept out of the HUD per platform rule. The user said to add both logos (same green light as Fairway Kings, which is not written down anywhere): record it in the submission notes. Own-brand only, no third-party ads.
