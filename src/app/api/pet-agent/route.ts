import { cancelPetJob, getPetJob, petAgentStatus, PetAgentError, startPetJob } from "../../../lib/server/petAgent";
import { MAX_ROOM_REFERENCE_LENGTH } from "../../../room/agent/reference";

export const runtime = "nodejs";
export const maxDuration = 300;
const headers = { "Cache-Control": "no-store" };
const failure = (error: unknown) => Response.json({ error: { message: error instanceof PetAgentError ? error.message : "宠物请求无效，请重试。" } }, { status: error instanceof PetAgentError ? error.status : 400, headers });

export async function GET(request: Request) {
  try { const id = new URL(request.url).searchParams.get("id"); return Response.json(id ? getPetJob(id) : await petAgentStatus(), { headers }); }
  catch (error) { return failure(error); }
}

function checkOrigin(request: Request) {
  const url = new URL(request.url), origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || origin && origin !== `${url.protocol}//${request.headers.get("host") || url.host}`) throw new PetAgentError("请从本站发起宠物生成。", 403);
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!request.headers.get("content-type")?.includes("application/json")) throw new PetAgentError("请提交照片数据。", 415);
    const reader = request.body?.getReader();
    if (!reader) throw new PetAgentError("请选择宠物照片。");
    let length = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > MAX_ROOM_REFERENCE_LENGTH + 1000) { await reader.cancel(); throw new PetAgentError("宠物照片过大，请压缩后重试。", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some(key => key !== "image")) throw new PetAgentError("请上传宠物照片后生成。");
    return Response.json(await startPetJob(data?.image), { status: 202, headers });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try { checkOrigin(request); return Response.json(await cancelPetJob(new URL(request.url).searchParams.get("id") || ""), { headers }); }
  catch (error) { return failure(error); }
}
