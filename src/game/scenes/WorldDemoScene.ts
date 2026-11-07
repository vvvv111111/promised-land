import * as Phaser from "phaser";
import room from "../room.json";
import { canPlace } from "../placement";
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

  changeZoom(delta: number) {
    const camera = this.cameras.main;
    camera.setZoom(Phaser.Math.Clamp(camera.zoom + delta, 1, 1.8));
  }

  resetCamera() {
    this.cameras.main.setZoom(1).centerOn(this.scale.width / 2, this.scale.height / 2);
  }

  setAtmosphere(enabled: boolean) {
    this.dust?.setVisible(enabled);
    if (enabled) this.tweens.resumeAll();
    else this.tweens.pauseAll();
  }

  setPlacementGuides(visible: boolean) {
    this.placementGuides?.setVisible(visible);
  }

  private dust?: Phaser.GameObjects.Container;
  private placementGuides?: Phaser.GameObjects.Graphics;

  create() {
    if (this.failed) return;
    const { world, manifest } = this.options;
    const width = this.scale.width;
    const height = this.scale.height;
    this.add.image(0, 0, world.background_id).setOrigin(0, 0).setDepth(-2);
    const camera = this.cameras.main;
    camera.setBounds(0, 0, width, height);
    this.input.addPointer(1);
    let panPointer = -1;
    let origin = { x: 0, y: 0, scrollX: 0, scrollY: 0 };
    let pinchDistance = 0;
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, hit: Phaser.GameObjects.GameObject[]) => {
      // Give furniture dragging priority; blank space and fixed fixtures pan the room.
      panPointer = hit[0] instanceof Phaser.GameObjects.Image ? -1 : pointer.id;
      origin = { x: pointer.x, y: pointer.y, scrollX: camera.scrollX, scrollY: camera.scrollY };
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const active = this.input.manager.pointers.filter(p => p.isDown);
      if (active.length >= 2) {
        const [a, b] = active;
        const distance = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        panPointer = -1;
        if (pinchDistance > 0 && distance > 0) this.changeZoom(camera.zoom * (distance / pinchDistance - 1));
        pinchDistance = distance;
        return;
      }
      pinchDistance = 0;
      if (pointer.isDown && pointer.id === panPointer && pointer.getDistance() >= this.input.dragDistanceThreshold) {
        camera.setScroll(origin.scrollX - (pointer.x - origin.x) / camera.zoom, origin.scrollY - (pointer.y - origin.y) / camera.zoom);
      }
    });
    this.input.on("pointerup", () => { pinchDistance = 0; });
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _hit: unknown, _x: number, y: number) => this.changeZoom(-y * 0.001));
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
      const scale = o.size.width * width / asset.width;
      const sprite = this.add.image(o.position_x * width, o.position_y * height, o.asset_id)
        .setName(o.object_id).setOrigin(anchor.x, anchor.y)
        .setScale(scale, scale * (o.size.height_scale ?? 1))
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
            .on("drag", (_pointer: Phaser.Input.Pointer, x: number, y: number) => {
              if (!this.input.manager.pointers.some(p => p.isDown && p.id !== pressedPointer)) this.place(sprite, x, y);
            })
            .on("dragend", () => this.options.onMove(o.object_id, { x: sprite.x / width, y: sprite.y / height }));
        }
      }
    }
    for (const [id, position] of Object.entries(this.options.positions)) {
      const sprite = this.sprites.get(id);
      if (sprite) this.place(sprite, position.x * width, position.y * height);
    }
    this.placementGuides = this.add.graphics().setDepth(3).setVisible(false);
    this.placementGuides.lineStyle(2, 0x78d9b5, 1);
    for (const surface of room.surfaces) {
      this.placementGuides.strokePoints(surface.polygon.map(([x, y]) => new Phaser.Geom.Point(x * width / 960, y * height / 540)), true);
    }
    this.dust = this.add.container(0, 0).setDepth(2);
    for (let i = 0; i < 18; i++) {
      const x = (100 + (i * 97) % 650) * width / 960;
      const y = (120 + (i * 71) % 340) * height / 540;
      const dot = this.add.circle(x, y, 1.3 + (i % 3) * 0.4, 0xffedbf, 0.2);
      this.dust.add(dot);
      this.tweens.add({ targets: dot, x: x + 28, y: y - 36, duration: 6500 + i * 237, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
    this.setAtmosphere(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
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
    const object = this.options.world.objects.find(o => o.object_id === sprite.name);
    if (this.options.world.background_id === "room_warm_04" && object?.type === "memory") {
      const asset = this.options.manifest.assets.find(a => a.asset_id === object.asset_id);
      const bounds = asset?.alpha_bounds;
      const width = bounds ? (bounds[2] - bounds[0]) * sprite.scaleX * 960 / this.scale.width : 0;
      if (!room.surfaces.some(surface => canPlace(object.asset_id, surface.id, x * 960 / this.scale.width, y * 540 / this.scale.height, width))) return;
      sprite.setPosition(x, y);
    } else {
      sprite.setPosition(Phaser.Math.Clamp(x, minX, Math.max(minX, maxX)), Phaser.Math.Clamp(y, minY, Math.max(minY, maxY)));
    }
    sprite.setDepth(sprite.y / this.scale.height);
  }
}
