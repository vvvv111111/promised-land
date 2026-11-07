import type { RoomSnapshot, RoomTarget } from "./types";

/** Repeatable object interactions, with no collection state or storage access. */
export class RoomSession {
  snapshot(selected: RoomTarget | null = null, message = "点击房间里的物件，发现它们的故事。"): RoomSnapshot {
    return { selected, message, storage_warning: "" };
  }

  interact(target: RoomTarget): RoomSnapshot {
    return this.snapshot(target, `正在查看：${target.interaction.title}`);
  }
}
