import * as Phaser from "phaser";
import type { RoomRendererOptions, RoomTarget } from "@/world/types";

export class WorldDemoScene extends Phaser.Scene {
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private targets = new Map<string, RoomTarget>();
  private failed = false;

  constructor(private options: RoomRendererOptions) { super("WorldDemo"); }

  preload() {
    const ids = new Set([this.options.world.background_id, ...this.options.world.objects.filter(o => o.visible).map(o => o.asset_id)]);
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      this.failed = true;
      this.options.onError(`素材加载失败：${file.key}。请检查路径与文件。`);
    });
    for (const id of ids) {
      const asset = this.options.manifest.assets.find(a => a.asset_id === id);
      if (!asset) { this.failed = true; this.options.onError(`缺少素材：${id}`); return; }
      this.load.image(id, asset.path);
    }
  }

  create() {
    if (this.failed) return;
    const { world, manifest } = this.options;
    const width = this.scale.width;
    const height = this.scale.height;
    this.add.image(0, 0, world.background_id).setOrigin(0, 0).setDepth(-2);
    this.input.setTopOnly(true);
    this.input.dragDistanceThreshold = 7;
    for (const h of world.hotspots) {
      const target: RoomTarget = { id: h.hotspot_id, kind: "hotspot", interaction: h.interaction };
      this.targets.set(target.id, target);
      this.add.zone(h.position_x * width, h.position_y * height, h.width * width, h.height * height)
        .setName(h.hotspot_id).setOrigin(0, 0).setDepth(-1)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.activate(target.id));
    }
    for (const o of world.objects) {
      if (!o.visible) continue;
      const asset = manifest.assets.find(a => a.asset_id === o.asset_id)!;
      const anchor = o.anchor ?? asset.default_anchor;
      const target: RoomTarget = { id: o.object_id, kind: "object", interaction: o.interaction };
      const sprite = this.add.image(o.position_x * width, o.position_y * height, o.asset_id)
        .setName(o.object_id).setOrigin(anchor.x, anchor.y)
        .setScale(o.size.width * width / asset.width)
        .setDepth(o.position_y);
      this.sprites.set(o.object_id, sprite);
      if (o.clickable || o.draggable !== false) {
        if (o.clickable) this.targets.set(target.id, target);
        let pressedPointer = -1;
        let dragged = false;
        // PNG alpha tops out at 254; ignore transparent padding and edge noise.
        sprite.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 32 })
          .on("pointerdown", (pointer: Phaser.Input.Pointer) => { pressedPointer = pointer.id; dragged = false; })
          .on("pointerup", (pointer: Phaser.Input.Pointer) => {
            if (o.clickable && pressedPointer === pointer.id && !dragged && pointer.getDistance() < this.input.dragDistanceThreshold) this.activate(target.id);
            pressedPointer = -1;
          });
        if (o.draggable !== false && this.options.allowDrag !== false) {
          this.input.setDraggable(sprite);
          sprite.on("dragstart", () => { dragged = true; })
            .on("drag", (_pointer: Phaser.Input.Pointer, x: number, y: number) => this.place(sprite, x, y))
            .on("dragend", () => this.options.onMove(o.object_id, { x: sprite.x / width, y: sprite.y / height }));
        }
      }
    }
    for (const [id, position] of Object.entries(this.options.positions)) {
      const sprite = this.sprites.get(id);
      if (sprite) this.place(sprite, position.x * width, position.y * height);
    }
    // Interactive objects enter Phaser's hit-test list during the first update.
    this.events.once(Phaser.Scenes.Events.POST_UPDATE, () => {
      this.game.canvas.dataset.worldId = world.world_id;
      this.options.onReady();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.sprites.clear(); this.targets.clear();
    });
  }

  activate(id: string) {
    const target = this.targets.get(id);
    if (!target) return;
    this.options.onInteract(target);
  }

  resetPositions() {
    for (const o of this.options.world.objects) {
      const sprite = this.sprites.get(o.object_id);
      if (sprite) this.place(sprite, o.position_x * this.scale.width, o.position_y * this.scale.height);
    }
  }

  private place(sprite: Phaser.GameObjects.Image, x: number, y: number) {
    const minX = sprite.displayWidth * sprite.originX;
    const maxX = this.scale.width - sprite.displayWidth * (1 - sprite.originX);
    const minY = sprite.displayHeight * sprite.originY;
    const maxY = this.scale.height - sprite.displayHeight * (1 - sprite.originY);
    sprite.setPosition(Phaser.Math.Clamp(x, minX, Math.max(minX, maxX)), Phaser.Math.Clamp(y, minY, Math.max(minY, maxY)));
    sprite.setDepth(sprite.y / this.scale.height);
  }
}
