import { roomFromDesign, type RoomAgentResult } from "../../room/agent/design";
import { roomDesignerPrompt } from "../../room/agent/prompt";

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

/** One design call, with at most one repair after a contract/placement failure. */
export async function generateRoom(prompt: string, signal?: AbortSignal): Promise<RoomAgentResult> {
  const config = mimoConfig(), start = Date.now();
  const messages = [{ role: "system", content: roomDesignerPrompt() }, { role: "user", content: prompt }];
  const deadline = AbortSignal.any([AbortSignal.timeout(90_000), ...(signal ? [signal] : [])]);
  let totalTokens = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(config.endpoint, {
        method: "POST", headers: { "Content-Type": "application/json", "api-key": config.key },
        body: JSON.stringify({ model: config.model, messages, response_format: { type: "json_object" }, thinking: { type: "disabled" }, max_completion_tokens: 4096, stream: false }),
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
      throw new RoomAgentError("UPSTREAM_ERROR", "MiMo 暂时无法完成生成，请检查模型配置或稍后重试。");
    }
    let envelope;
    try { envelope = await response.json(); }
    catch { throw new RoomAgentError("INVALID_RESPONSE", "MiMo 返回内容无法读取，请重试。"); }
    const tokens = envelope?.usage?.total_tokens;
    if (Number.isSafeInteger(tokens) && tokens >= 0) totalTokens += tokens;
    const choice = envelope?.choices?.[0], content = choice?.message?.content;
    let issue = "expected complete JSON content";
    if (choice?.finish_reason === "stop" && typeof content === "string" && content.length <= 32_000) {
      try {
        const result = roomFromDesign(JSON.parse(content));
        return { ...result, run: { id: crypto.randomUUID(), model: config.model, attempts: attempt, durationMs: Date.now() - start, totalTokens } };
      } catch (error) { issue = error instanceof Error ? error.message : "invalid design"; }
    }
    if (attempt === 1) messages.push({ role: "user", content: `上次输出未通过校验：${issue}。请重新根据原始需求返回完整 JSON，修复问题。保留用户要求的家具类型与窗户数量，参考对应卧室/起居室示例的安全布局，不要退回无关房型。` });
  }
  throw new RoomAgentError("INVALID_DESIGN", "生成方案未通过房间校验，当前房间已保留，请调整描述后重试。");
}
