import type { RoomArchitecture, RoomWindow, Vec3 } from "./types";

/** Shared by the rendering contract and agent compiler, before geometry allocation. */
export function parseArchitecture(input: unknown, dimensions: Vec3 = [6, 3, 4.8]): RoomArchitecture {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid architecture");
  const data = input as Record<string, unknown>;
  if (data.units !== undefined && data.units !== "meters") throw new Error("unknown architecture units");
  const metric = data.units === "meters";
  if (!("windows" in input) || !Array.isArray(input.windows) || input.windows.length > (metric ? 8 : 4)) throw new Error("invalid window count");
  const windows: RoomWindow[] = input.windows.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid window");
    const w = value as Record<string, unknown>;
    if (w.wall !== "left" && w.wall !== "back") throw new Error("windows must use left or back wall");
    const range = (key: string, min: number, max: number) => {
      const v = w[key];
      if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`window ${key} must be ${min}..${max}`);
      return v;
    };
    const halfWall = metric ? dimensions[w.wall === "left" ? 2 : 0] / 2 : w.wall === "left" ? 2.4 : 3;
    const result: RoomWindow = { wall: w.wall, offset: range("offset", -halfWall, halfWall), width: range("width", metric ? .4 : .5, metric ? 8 : 2.8), bottom: range("bottom", metric ? .3 : .65, metric ? dimensions[1] - .6 : 1.7), height: range("height", .6, metric ? dimensions[1] - .45 : 1.9) };
    const ceiling = metric ? dimensions[1] - .15 : 2.85;
    if (Math.abs(result.offset) + result.width / 2 > halfWall - .2 + 1e-6 || result.bottom + result.height > ceiling + 1e-6) throw new Error(`window crosses wall edges or ceiling: ${result.wall} offset=${result.offset}, width=${result.width}, bottom=${result.bottom}, height=${result.height}; require abs(offset)+width/2 <= ${halfWall - .2} and bottom+height <= ${ceiling}. Adjust this window within the same wall; preserve its count and approximate location.`);
    return result;
  });
  for (const wall of ["left", "back"]) if (windows.filter(w => w.wall === wall).length > (metric ? 4 : 2)) throw new Error("too many windows per wall");
  for (let i = 0; i < windows.length; i++) for (let j = i + 1; j < windows.length; j++) {
    const a = windows[i], b = windows[j];
    if (a.wall === b.wall && Math.abs(a.offset - b.offset) < (a.width + b.width) / 2 + .15 - 1e-6) throw new Error("windows on the same wall need at least 0.15m separation");
  }
  return { ...(metric ? { units: "meters" as const } : {}), windows };
}
