import { defaultRoom, validateRoomDefinition } from "../definition";
import { roomFromDesign } from "./design";

/** Explicit gift creation can adopt the existing workbench design without startup writes. */
export function selectedRoom(storage: Pick<Storage, "getItem">) {
  try {
    const result = JSON.parse(storage.getItem("promised-land:room-agent:v1") ?? "null");
    if (result?.definition) {
      validateRoomDefinition(result.definition);
      return structuredClone(result.definition);
    }
    return result?.design ? roomFromDesign(result.design).definition : structuredClone(defaultRoom);
  } catch { return structuredClone(defaultRoom); }
}
