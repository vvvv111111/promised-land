import { cancelRoomGeneration, continueRoomGeneration, generateRoom, mimoConfig, RoomAgentError, startRoomGeneration } from "../../../lib/server/roomAgent";
import { MAX_ROOM_REFERENCE_LENGTH } from "../../../room/agent/reference";
import { validateRoomReference } from "../../../lib/server/roomReference";
import { MAX_CURRENT_ROOM_BYTES } from "../../../room/agent/context";

export const runtime = "nodejs";
export const maxDuration = 180;
const headers = { "Cache-Control": "no-store" };
let active = 0;

export function GET() {
  try { const { model } = mimoConfig(); return Response.json({ configured: true, model }, { headers }); }
  catch { return Response.json({ configured: false }, { headers }); }
}

function isCrossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // NextRequest normalizes loopback URLs to localhost; Host retains the browser's origin.
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") || url.host}`;
  return request.headers.get("sec-fetch-site") === "cross-site" || Boolean(origin && origin !== expectedOrigin);
}

export async function POST(request: Request) {
  if (isCrossOrigin(request)) {
    return Response.json({ error: { code: "FORBIDDEN", message: "请从本站发起生成。" } }, { status: 403, headers });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: { code: "INVALID_INPUT", message: "请提交 JSON 格式的房间描述。" } }, { status: 415, headers });
  // Bound the stream, including chunked bodies without a Content-Length header.
  let data: unknown, size = 0;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("empty body");
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > MAX_ROOM_REFERENCE_LENGTH + MAX_CURRENT_ROOM_BYTES + 12_000) { await reader.cancel(); return Response.json({ error: { code: "INPUT_TOO_LARGE", message: "参考照片或描述过大，请更换较小的照片后重试。" } }, { status: 413, headers }); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return Response.json({ error: { code: "INVALID_INPUT", message: "无法读取描述，请重新提交。" } }, { status: 400, headers }); }
  const generationId = data && typeof data === "object" && "generationId" in data ? data.generationId : undefined;
  if (generationId !== undefined) {
    if (typeof generationId !== "string" || !/^[0-9a-f-]{36}$/.test(generationId) || size > 1000) return Response.json({ error: { code: "INVALID_INPUT", message: "修复任务无效，请重新生成。" } }, { status: 400, headers });
    if (active >= 2) return Response.json({ error: { code: "BUSY", message: "正在处理其他生成任务，请稍后重试。" } }, { status: 429, headers });
    active++;
    try {
      const result = await continueRoomGeneration(generationId, request.signal);
      return Response.json(result, { status: "status" in result ? 202 : 200, headers });
    } catch (error) { return errorResponse(error); }
    finally { active--; }
  }
  const prompt = data && typeof data === "object" && "prompt" in data ? data.prompt : undefined;
  const referenceImage = data && typeof data === "object" && "referenceImage" in data ? data.referenceImage : undefined;
  const currentRoom = data && typeof data === "object" && "currentRoom" in data ? data.currentRoom : undefined;
  const contextBudget = currentRoom === undefined ? 0 : MAX_CURRENT_ROOM_BYTES;
  if (referenceImage === undefined && size > 12_000 + contextBudget || referenceImage !== undefined && size > MAX_ROOM_REFERENCE_LENGTH + 12_000 + contextBudget) return Response.json({ error: { code: "INPUT_TOO_LARGE", message: "照片、描述或当前方案过大，请缩减后重试。" } }, { status: 413, headers });
  if ((prompt !== undefined && typeof prompt !== "string") || (typeof prompt === "string" && prompt.length > 2000) || (!referenceImage && (typeof prompt !== "string" || !prompt.trim()))) return Response.json({ error: { code: "INVALID_INPUT", message: "请填写房间描述或上传参考照片，文字不超过 2000 字。" } }, { status: 400, headers });
  if (referenceImage !== undefined) {
    try { validateRoomReference(referenceImage); }
    catch (error) { return Response.json({ error: { code: "INVALID_IMAGE", message: error instanceof Error ? error.message : "参考照片无法读取。" } }, { status: 400, headers }); }
  }
  if (active >= 2) return Response.json({ error: { code: "BUSY", message: "正在处理其他生成任务，请稍后重试。" } }, { status: 429, headers });
  if (data && typeof data === "object" && "continuous" in data && data.continuous === true) {
    try { return Response.json(startRoomGeneration(typeof prompt === "string" ? prompt.trim() : "", referenceImage as string | undefined, currentRoom), { status: 202, headers }); }
    catch (error) { return errorResponse(error); }
  }
  active++;
  try { return Response.json(await generateRoom(typeof prompt === "string" ? prompt.trim() : "", request.signal, referenceImage as string | undefined, currentRoom), { headers }); }
  catch (error) { return errorResponse(error); }
  finally { active--; }
}

function errorResponse(error: unknown) {
  const failure = error instanceof RoomAgentError ? error : new RoomAgentError("INTERNAL_ERROR", "生成未能完成，请稍后重试。", 500);
  return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status, headers });
}

export function DELETE(request: Request) {
  if (isCrossOrigin(request)) return Response.json({ error: { code: "FORBIDDEN", message: "请从本站取消生成。" } }, { status: 403, headers });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: { code: "INVALID_INPUT", message: "修复任务无效。" } }, { status: 400, headers });
  cancelRoomGeneration(id);
  return Response.json({ cancelled: true }, { headers });
}
