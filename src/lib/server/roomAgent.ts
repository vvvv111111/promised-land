import { roomFromDesign, type RoomAgentResult } from "../../room/agent/design";
import { roomDesignerPrompt } from "../../room/agent/prompt";
import { validateRoomReference } from "./roomReference";
import { ROOM_REFERENCE_DEFAULT_PROMPT } from "../../room/agent/reference";
import { fitReferenceDesign } from "../../room/agent/fitReference";
import { ROOM_ATTEMPT_TIMEOUT_MS, type RoomGenerationProgress } from "../../room/agent/generation";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] };

export class RoomAgentError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}

export function mimoConfig(env: NodeJS.ProcessEnv = process.env) {
  const key = env.MIMO_API_KEY?.trim();
  if (!key) throw new RoomAgentError("NOT_CONFIGURED", "请先在服务端 .env.local 配置 MIMO_API_KEY，再重试。", 503);
  let base: URL;
  try { base = new URL(env.MIMO_BASE_URL?.trim() || "https://api.xiaomimimo.com/v1"); }
  catch { throw new RoomAgentError("INVALID_CONFIG", "MIMO_BASE_URL 配置无效，请检查服务端配置。", 503); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new RoomAgentError("INVALID_CONFIG", "MIMO_BASE_URL 需要使用不含凭证或查询参数的 HTTPS 地址。", 503);
  }
  return { key, endpoint: `${base.href.replace(/\/$/, "")}/chat/completions`, model: env.MIMO_MODEL?.trim() || "mimo-v2.6-pro" };
}

interface RoomGeneration {
  id: string;
  model: string;
  startedAt: number;
  messages: ChatMessage[];
  referenceImage: boolean;
  thinking: string;
  attempts: number;
  totalTokens: number;
  candidate?: string;
  issues: string[];
  repeatedIssue: number;
  message: string;
}

function createGeneration(prompt: string, referenceImage?: string): RoomGeneration {
  if (referenceImage !== undefined) {
    try { validateRoomReference(referenceImage); }
    catch (error) { throw new RoomAgentError("INVALID_IMAGE", error instanceof Error ? error.message : "参考照片无法读取。", 400); }
  }
  const config = mimoConfig();
  const messages: ChatMessage[] = [{ role: "system", content: roomDesignerPrompt(Boolean(referenceImage)) }, {
    role: "user", content: referenceImage ? [
      { type: "image_url", image_url: { url: referenceImage } },
      { type: "text", text: prompt.trim() || ROOM_REFERENCE_DEFAULT_PROMPT },
    ] : prompt,
  }];
  const thinking = referenceImage && process.env.MIMO_ROOM_THINKING === "enabled" ? "enabled" : "disabled";
  return { id: crypto.randomUUID(), model: config.model, startedAt: Date.now(), messages, referenceImage: Boolean(referenceImage), thinking, attempts: 0, totalTokens: 0, issues: [], repeatedIssue: 0, message: "正在创建房间并检查布局…" };
}

function progress(state: RoomGeneration): RoomGenerationProgress {
  return { status: "repairing", generationId: state.id, attempts: state.attempts, message: state.message };
}

function repairMessage(issue: string) {
  if (/overlap|intersect/i.test(issue)) return "正在调整物件间距，解决家具或部件穿插";
  if (/wall|window|bounds|footprint/i.test(issue)) return "正在调整靠墙布局和窗户位置";
  if (/support|parent|surface|overhang|floor|floating|tabletop/i.test(issue)) return "正在修正物品支撑与落地位置";
  if (/truncated|JSON|complete/i.test(issue)) return "正在补全房间方案";
  return "正在修正房间尺寸和素材数据";
}

/** One bounded model call. Invalid designs stay in this generation for the next repair. */
async function advanceGeneration(state: RoomGeneration, signal?: AbortSignal): Promise<RoomAgentResult | RoomGenerationProgress> {
  const config = mimoConfig();
  const deadline = AbortSignal.any([AbortSignal.timeout(ROOM_ATTEMPT_TIMEOUT_MS), ...(signal ? [signal] : [])]);
  if (deadline.aborted) throw new RoomAgentError("TIMEOUT", "生成已取消或本轮请求超时，当前房间已保留。", 504);
  const attempt = ++state.attempts;
  const messages = [...state.messages];
  if (state.issues.length) {
    if (state.candidate) messages.push({ role: "assistant", content: state.candidate });
    messages.push({ role: "user", content: `这是第${attempt - 1}轮自动修复。上次输出未通过校验：${state.issues.at(-1)}。请在上次设计基础上修复问题，返回完整 version:2 JSON（包括assets和所有实例）。保留用户要求或照片中的主要结构、楼梯/阁楼、家具类型、数量、房间大小与窗户。检查报错的具体部件、parent/surface和坐标；优先小幅移动、旋转或修正部件，不能删掉主要物件或退回示例房型。修复后同时复查此前遇到的问题，避免修好一处又引入旧问题：${state.issues.join("；")}。${state.repeatedIssue > 1 ? "同一错误已重复出现，请重新计算相关几何边界与承托尺寸，采用不同的局部修正，不要重复提交相同方案。" : ""}` });
  }
  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", "api-key": config.key },
      body: JSON.stringify({ model: state.model, messages, response_format: { type: "json_object" }, thinking: { type: state.thinking }, max_completion_tokens: state.thinking === "enabled" ? 24576 : 16384, stream: false }),
      signal: deadline, cache: "no-store", redirect: "error",
    });
  } catch {
    if (deadline.aborted) throw new RoomAgentError("TIMEOUT", "生成已取消或超时，请重试。", 504);
    throw new RoomAgentError("NETWORK_ERROR", "暂时无法连接 MiMo，请检查网络或服务地址后重试。");
  }
  if (!response.ok) {
    // Never relay provider bodies: they can contain account details or echoed credentials.
    await response.body?.cancel();
    if ([401, 403].includes(response.status)) throw new RoomAgentError("AUTH_ERROR", "MiMo 鉴权失败，请检查密钥与服务地址是否匹配。", 503);
    if (response.status === 429) throw new RoomAgentError("RATE_LIMITED", "MiMo 请求过于频繁或额度不足，请稍后重试。", 429);
    if (state.referenceImage && response.status === 400) throw new RoomAgentError("IMAGE_REJECTED", "MiMo 未能处理参考照片，请更换照片并确认配置的模型支持图片理解。", 502);
    throw new RoomAgentError("UPSTREAM_ERROR", "MiMo 暂时无法完成生成，请检查模型配置或稍后重试。");
  }
  let envelope;
  try { envelope = await response.json(); }
  catch {
    if (deadline.aborted) throw new RoomAgentError("TIMEOUT", "生成已取消或超时，请重试。", 504);
    throw new RoomAgentError("INVALID_RESPONSE", "MiMo 返回内容无法读取，请重试。");
  }
  const tokens = envelope?.usage?.total_tokens;
  if (deadline.aborted) throw new RoomAgentError("TIMEOUT", "生成已取消或本轮请求超时，当前房间已保留。", 504);
  if (Number.isSafeInteger(tokens) && tokens >= 0) state.totalTokens += tokens;
  const choice = envelope?.choices?.[0], content = choice?.message?.content;
  let repairContent = typeof content === "string" && content.length <= 160_000 ? content : undefined;
  let issue = choice?.finish_reason === "length" ? "output was truncated; reduce small decorative parts and keep a compact complete JSON with the major structure and objects" : "expected complete JSON content";
  if (choice?.finish_reason === "stop" && typeof content === "string" && content.length <= 160_000) {
    try {
      const parsed = JSON.parse(content);
      let referenceDescription: string | undefined;
      if (state.referenceImage) {
        if (parsed?.reference?.isRoom === false) throw new RoomAgentError("NOT_A_ROOM", "照片中未识别到清晰的房间，请换一张能看到墙面和主要家具的室内照片。", 422);
        if (parsed?.reference?.isRoom !== true || typeof parsed.reference.observation !== "string" || !parsed.reference.observation.trim() || parsed.reference.observation.length > 500) throw new Error("reference must contain isRoom and an observation of 1..500 characters");
        referenceDescription = parsed.reference.observation.trim();
      }
      const fitted = fitReferenceDesign(parsed);
      repairContent = JSON.stringify(fitted.input);
      const result = roomFromDesign(fitted.input);
      return { ...result, run: { id: state.id, model: state.model, attempts: attempt, durationMs: Date.now() - state.startedAt, totalTokens: state.totalTokens, input: state.referenceImage ? "image" : "text", ...(referenceDescription ? { referenceDescription } : {}), ...(fitted.corrections ? { positionCorrections: fitted.corrections } : {}) } };
    } catch (error) {
      if (error instanceof RoomAgentError) throw error;
      issue = error instanceof SyntaxError ? "Invalid JSON; return a complete JSON object" : error instanceof Error ? error.message : "invalid design";
      if (process.env.NODE_ENV === "development") console.warn("[RoomAgent] design validation", { attempt, issue: error instanceof SyntaxError ? "Invalid JSON" : issue });
    }
  }
  if (repairContent) state.candidate = repairContent;
  issue = issue.slice(0, 1000);
  state.repeatedIssue = state.issues.at(-1) === issue ? state.repeatedIssue + 1 : 1;
  state.issues = [...state.issues.filter(previous => previous !== issue), issue].slice(-8);
  state.message = `${repairMessage(issue)}，正在进行第 ${attempt} 轮自动修复。通过检查后可预览，可随时取消。`;
  return progress(state);
}

/** Direct callers also keep repairing; their request signal/time budget bounds the work. */
export async function generateRoom(prompt: string, signal?: AbortSignal, referenceImage?: string): Promise<RoomAgentResult> {
  const state = createGeneration(prompt, referenceImage);
  const deadline = AbortSignal.any([AbortSignal.timeout(ROOM_ATTEMPT_TIMEOUT_MS), ...(signal ? [signal] : [])]);
  while (true) {
    const result = await advanceGeneration(state, deadline);
    if (!("status" in result)) return result;
  }
}

// Continuations hold photos and candidate designs only in process memory, never in URLs or browser storage.
const generations = new Map<string, { state: RoomGeneration; touchedAt: number; active?: AbortController }>();
const idleLifetime = 10 * 60_000;

export function startRoomGeneration(prompt: string, referenceImage?: string): RoomGenerationProgress {
  for (const [id, entry] of generations) if (!entry.active && Date.now() - entry.touchedAt > idleLifetime) generations.delete(id);
  if (generations.size >= 8) throw new RoomAgentError("BUSY", "正在处理其他生成任务，请稍后重试。", 429);
  const state = createGeneration(prompt, referenceImage);
  generations.set(state.id, { state, touchedAt: Date.now() });
  return progress(state);
}

export async function continueRoomGeneration(id: string, signal?: AbortSignal) {
  const entry = generations.get(id);
  if (!entry || Date.now() - entry.touchedAt > idleLifetime && !entry.active) {
    generations.delete(id);
    throw new RoomAgentError("GENERATION_EXPIRED", "修复任务已过期或服务已重启，请重新生成，当前房间已保留。", 410);
  }
  if (entry.active) throw new RoomAgentError("BUSY", "本轮修复仍在进行，请等待完成。", 409);
  const controller = new AbortController(); entry.active = controller;
  try {
    const result = await advanceGeneration(entry.state, AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]));
    if (!("status" in result)) generations.delete(id);
    return result;
  } catch (error) {
    generations.delete(id);
    throw error;
  } finally { entry.active = undefined; entry.touchedAt = Date.now(); }
}

export function cancelRoomGeneration(id: string) {
  const entry = generations.get(id);
  entry?.active?.abort();
  generations.delete(id);
}
