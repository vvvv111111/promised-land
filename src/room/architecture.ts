import type { RoomArchitecture, RoomWindow } from "./types";

/** Shared by the rendering contract and agent compiler, before geometry allocation. */
export function parseArchitecture(input: unknown): RoomArchitecture {
  if (!input || typeof input !== "object" || !("windows" in input) || !Array.isArray(input.windows) || input.windows.length > 4) throw new Error("architecture requires zero to four windows");
  const windows: RoomWindow[] = input.windows.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid window");
    const w = value as Record<string, unknown>;
    if (w.wall !== "left" && w.wall !== "back") throw new Error("windows must use left or back wall");
    const range = (key: string, min: number, max: number) => {
      const v = w[key];
      if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`window ${key} must be ${min}..${max}`);
      return v;
    };
    const result: RoomWindow = { wall: w.wall, offset: range("offset", -3, 3), width: range("width", .5, 2.8), bottom: range("bottom", .65, 1.7), height: range("height", .6, 1.9) };
    const halfWall = w.wall === "left" ? 2.4 : 3;
    if (Math.abs(result.offset) + result.width / 2 > halfWall - .2 || result.bottom + result.height > 2.85) throw new Error("window crosses wall edges or ceiling");
    return result;
  });
  for (const wall of ["left", "back"]) if (windows.filter(w => w.wall === wall).length > 2) throw new Error("at most two windows per wall");
  for (let i = 0; i < windows.length; i++) for (let j = i + 1; j < windows.length; j++) {
    const a = windows[i], b = windows[j];
    if (a.wall === b.wall && Math.abs(a.offset - b.offset) < (a.width + b.width) / 2 + .15) throw new Error("windows on the same wall need at least 0.15m separation");
  }
  return { windows };
}
