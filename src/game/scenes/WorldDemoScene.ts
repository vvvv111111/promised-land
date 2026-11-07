import * as Phaser from "phaser";
import type { RoomRendererOptions, RoomTarget } from "@/world/types";
import { RoomPlacement } from "@/world/RoomPlacement";

export class WorldDemoScene extends Phaser.Scene {
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private targets = new Map<string, RoomTarget>();
  private failed = false;
  private placement?: RoomPlacement;

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
    if (world.placement) {
      try { this.placement = new RoomPlacement(world, manifest); }
      catch (e) { this.options.onError(e instanceof Error ? e.message : "房间摆放配置无效。"); return; }
    }
    this.add.image(0, 0, world.background_id).setOrigin(0, 0).setDepth(-2);
    for (const occluder of world.placement?.occluders ?? []) {
      const shape = this.make.graphics({}, false);
      shape.fillStyle(0xffffff);
      for (const polygon of occluder.polygons) {
        shape.fillPoints(polygon.map(p => new Phaser.Math.Vector2(p.x * width, p.y * height)), true);
      }
      const mask = shape.createGeometryMask();
      const layer = this.add.image(0, 0, world.background_id).setOrigin(0, 0).setDepth(occluder.depth_y).setMask(mask);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { layer.clearMask(true); shape.destroy(); });
    }
    this.input.setTopOnly(true);
    this.input.dragDistanceThreshold = 7;
    for (const h of world.hotspots) {
      const target: RoomTarget = { id: h.hotspot_id, kind: "hotspot", interaction: h.interaction };
      this.targets.set(target.id, target);
      this.add.zone(h.position_x * width, h.position_y * height, h.width * width, h.height * height)
        .setName(h.hotspot_id).setOrigin(0, 0).setDepth(-1)
        .setInteractive({ useHandCursor: true })
        .on("pointerup", (pointer: Phaser.Input.Pointer) => {
          if (pointer.getDistance() < this.input.dragDistanceThreshold) this.activate(target.id);
        });
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
      if (o.clickable) {
        this.targets.set(target.id, target);
        let pressedPointer = -1;
        // PNG alpha tops out at 254; ignore transparent padding and edge noise.
        sprite.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 32 })
          .on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            pressedPointer = pointer.id;
          })
          .on("pointerup", (pointer: Phaser.Input.Pointer) => {
            if (o.clickable && pressedPointer === pointer.id && pointer.getDistance() < this.input.dragDistanceThreshold) this.activate(target.id);
            pressedPointer = -1;
          });
        if (this.placement && sprite.input) {
          const pixelHit = sprite.input.hitAreaCallback;
          sprite.input.hitAreaCallback = (area, localX, localY, object) => {
            const point = {
              x: (sprite.x + (localX - sprite.displayOriginX) * sprite.scaleX) / width,
              y: (sprite.y + (localY - sprite.displayOriginY) * sprite.scaleY) / height,
            };
            return pixelHit(area, localX, localY, object) && !this.placement!.isOccluded(point, sprite.depth);
          };
        }

      }
    }
    if (this.placement) {
      for (const sprite of this.sprites.values()) this.syncPlacement(sprite);
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

  private syncPlacement(sprite: Phaser.GameObjects.Image) {
    const pose = this.placement!.pose(sprite.name);
    sprite.setPosition(pose.anchor.x * this.scale.width, pose.anchor.y * this.scale.height).setDepth(pose.depth);
  }
}
