import * as Phaser from "phaser";
import { WorldDemoScene } from "./scenes/WorldDemoScene";

export function createWorldGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 540,
    backgroundColor: "#f1eee7",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [WorldDemoScene],
  });
}
