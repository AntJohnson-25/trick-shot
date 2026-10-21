# Trick Shot: handoff

HopLobby game id `trick-shot`. Source builds from `hoplobby.json` (`build.output: "Work"`, static files, no build step;
three.js vendored). Answers the submission's "I made this or hold the rights to everything" tick.

## Assets and licences

| What | Where | Source | Licence |
| --- | --- | --- | --- |
| Game code (sim, net, HUD, audio, world) | `Work/src/` | Written for this game with AI assistance (Claude) | Ours |
| three.js r170 + GLTFLoader, BufferGeometryUtils | `Work/vendor/` | threejs.org | MIT (`Work/vendor/three.LICENSE.txt`) |
| Computer rival bodies (Ch06, Ch46, Ch36, Ch14) and the hidden driver body (Aj) + longbow clips | `Work/src/chars/` | Adobe Mixamo characters/animations packed by the developer | Mixamo terms (free for commercial use in games). Players appear as their HopLobby avatars; the driver is never shown |
| Player characters | not bundled | `HopLobby.avatar()` at run time | HopLobby |
| Arena, targets, scarecrows, trees, textures | `Work/src/world.js` | Built in code; textures drawn on canvas at run time | Ours |
| CTSG seal | `Work/assets/brand/ctsg-seal-color-512.png` | Developer's own company logo | Ours |
| HopLobby logo on the field boards | `Work/assets/brand/hoplobby-primary-on-dark-800.png` | Official HopLobby brand kit, unaltered, only in the arena, never in the HUD | HopLobby brand kit terms |
| Sound effects | `Work/src/audio.js` | Synthesised at run time | Ours |
| Music | `Work/music/` | None shipped (empty slot) | n/a |
| Cover | `Work/cover.jpg` | Screenshot of the game | Ours |

No AI-generated art, models or audio ship in the build (the only AI help is the code). Fonts: system fonts only. No outside
requests except the SDK. No ads, trackers, sign-ins, payments or personal data; no `localStorage`/`sessionStorage`/IndexedDB.