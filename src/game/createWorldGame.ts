import * as Phaser from "phaser";
import { WorldDemoScene } from "./scenes/WorldDemoScene";
import type { RoomRendererOptions } from "@/world/types";

export function createWorldGame(parent: HTMLElement, options: RoomRendererOptions): Phaser.Game {
  const background = options.manifest.assets.find(a => a.asset_id === options.world.background_id);
  if (!background) throw new Error("房间背景不在素材清单中");
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: background.width,
    height: background.height,
    backgroundColor: "#f1eee7",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new WorldDemoScene(options)],
  });
  // React controls and dialogs can move the canvas before Phaser's next resize poll.
  // Refresh in the capture phase, before Phaser translates the native input point.
  const canvas = game.canvas;
  const syncInputBounds = () => game.scale.refresh();
  canvas.addEventListener("mousedown", syncInputBounds, { capture: true, passive: true });
  canvas.addEventListener("touchstart", syncInputBounds, { capture: true, passive: true });
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    canvas.removeEventListener("mousedown", syncInputBounds, true);
    canvas.removeEventListener("touchstart", syncInputBounds, true);
  });
  return game;
}
