import { generateRoom, mimoConfig, RoomAgentError } from "../../../lib/server/roomAgent";

export const runtime = "nodejs";
export const maxDuration = 100;
const headers = { "Cache-Control": "no-store" };
let active = 0;

export function GET() {
  try { const { model } = mimoConfig(); return Response.json({ configured: true, model }, { headers }); }
  catch { return Response.json({ configured: false }, { headers }); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // NextRequest normalizes loopback URLs to localhost; Host retains the browser's origin.
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== expectedOrigin)) {
    return Response.json({ error: { code: "FORBIDDEN", message: "请从本站发起生成。" } }, { status: 403, headers });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: { code: "INVALID_INPUT", message: "请提交 JSON 格式的房间描述。" } }, { status: 415, headers });
  // Bound the stream, including chunked bodies without a Content-Length header.
  let data: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("empty body");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 12_000) { await reader.cancel(); return Response.json({ error: { code: "INPUT_TOO_LARGE", message: "描述过长，请限制在 2000 字以内。" } }, { status: 413, headers }); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return Response.json({ error: { code: "INVALID_INPUT", message: "无法读取描述，请重新提交。" } }, { status: 400, headers }); }
  const prompt = data && typeof data === "object" && "prompt" in data ? data.prompt : undefined;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 2000) return Response.json({ error: { code: "INVALID_INPUT", message: "请输入 1–2000 字的房间描述。" } }, { status: 400, headers });
  if (active >= 2) return Response.json({ error: { code: "BUSY", message: "正在处理其他生成任务，请稍后重试。" } }, { status: 429, headers });
  active++;
  try { return Response.json(await generateRoom(prompt.trim(), request.signal), { headers }); }
  catch (error) {
    const failure = error instanceof RoomAgentError ? error : new RoomAgentError("INTERNAL_ERROR", "生成未能完成，请稍后重试。", 500);
    return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status, headers });
  } finally { active--; }
}
