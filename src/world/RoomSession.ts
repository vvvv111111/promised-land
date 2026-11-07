import type { RoomSnapshot, RoomTarget } from "./types";

/** Repeatable object interactions, with no collection state or storage access. */
export class RoomSession {
  snapshot(selected: RoomTarget | null = null, message = ""): RoomSnapshot {
    return { selected, message, storage_warning: "" };
  }

  interact(target: RoomTarget): RoomSnapshot {
    return this.snapshot(target, `正在查看：${target.interaction.title}`);
  }
}
