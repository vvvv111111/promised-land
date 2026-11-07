import * as Phaser from "phaser";

export class WorldDemoScene extends Phaser.Scene {
  constructor() {
    super("WorldDemo");
  }

  create() {
    const floor = this.add.graphics();
    floor.fillStyle(0xd5decd, 1);
    floor.lineStyle(2, 0x87967d, 1);
    floor.beginPath();
    floor.moveTo(480, 130);
    floor.lineTo(760, 270);
    floor.lineTo(480, 410);
    floor.lineTo(200, 270);
    floor.closePath();
    floor.fillPath();
    floor.strokePath();
  }
}
