---
name: room-composer
description: Develop and improve the MiMo room agent's photo reconstruction, generated geometry assets, physical support and orderly scene layout in this repository.
---

# Room composer

This project has a runtime MiMo skill in [composerSkill.ts](../../../src/room/agent/composerSkill.ts), included by `roomDesignerPrompt`. Update that runtime skill when changing what the product agent should do; editing this file alone does not change MiMo behavior.

Preserve photo landmarks, object counts, relative positions and floor levels. Use built-in furniture where it fits; generate missing shapes as bounded declarative assets. Do not solve missing models by silently omitting prominent reference objects or renaming unrelated furniture. Explain the remaining approximation honestly.

The data contract lives in `src/room/types.ts`, `src/room/generated.ts` and `src/room/agent/design.ts`. All generated shapes must use that contract. Do not execute provider-authored JavaScript or fetch provider-supplied asset URLs. Asset definitions and instances must survive JSON export, storage and recipient rendering without another model call.

Derive support heights and dimensions from real geometry. A child must name its parent and surface; floor-level objects stay on the floor. Use a verified wall mount for hanging geometry. Loft beds, tabletop TVs and vases must not be turned into floating root objects. For generated tabletop props validate the real base contact while retaining the upper geometry in collision checks. Check generated parts individually so open space under platforms stays usable, while posts and railings still collide. Keep existing gift interactions accessible and account for occupied tabletop space.

Use `generatedRoomDesign()` in `src/room/agent/generatedExample.ts` as a working fixture, not a template to impose on user photos. Validate meaningful behavior with `scripts/check-room-generated.cjs`, `npm test`, and the generated-room browser check. Inspect rendered desktop/mobile images. If a real MiMo check is needed, use the public fixture and keep API keys/raw personal photos out of logs and saved artifacts.

Follow root `AGENTS.md` and read the relevant installed Next.js guide before editing routes or Next-specific behavior. Keep builds isolated when a production server shares `.next`; do not overwrite chunks that another server is serving.
