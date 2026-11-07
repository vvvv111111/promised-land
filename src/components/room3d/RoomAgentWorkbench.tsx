"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { roomFromDesign, type RoomAgentResult } from "@/room/agent/design";
import RoomPreview from "./RoomPreview";
import type { RoomPreviewProps } from "./RoomPreview";
import { openGift, EXAMPLE_GIFT_ID } from "@/world/WinterGift";
import { demoWorld } from "@/world/config";
import demoGift from "@/world/demo-gift.json";
import type { GiftConfig } from "@/world/types";
import type { GiftStore } from "@/world/GiftStore";
import type { RoomDefinition } from "@/room/types";

const storageKey = "promised-land:room-agent:v1";
const examples = ["奶油色墙面、浅木色家具和鼠尾草绿沙发，像一个安静的午后。", "改成卧室：去掉沙发、茶桌和矮柜，放一张床、一张书桌和椅子，左墙和后墙各一扇窗户。CD 机和信件放书桌上，相框挂墙。"];

function readResult(input: unknown): RoomAgentResult {
  if (!input || typeof input !== "object" || !("design" in input) || !("run" in input)) throw new Error("invalid result");
  const room = roomFromDesign(input.design), run = input.run as RoomAgentResult["run"];
  if (!run || typeof run.id !== "string" || run.id.length > 100 || typeof run.model !== "string" || run.model.length > 100 || ![1, 2].includes(run.attempts) || !Number.isFinite(run.durationMs) || run.durationMs < 0 || !Number.isSafeInteger(run.totalTokens) || run.totalTokens < 0) throw new Error("invalid run");
  return { ...room, run: { id: run.id, model: run.model, attempts: run.attempts, durationMs: run.durationMs, totalTokens: run.totalTokens } };
}

export default function RoomAgentWorkbench({ previewProps, onSaveStateChange }: { previewProps?: RoomPreviewProps; onSaveStateChange?: (saved: boolean) => void }) {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<RoomAgentResult | null>(null);
  const [revision, setRevision] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [recipient, setRecipient] = useState(true);
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unsaved, setUnsaved] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const store = useRef<GiftStore | null>(null);
  const [savedDefinition, setSavedDefinition] = useState<RoomDefinition>();
  const stateCallback = useRef(onSaveStateChange); stateCallback.current = onSaveStateChange;
  useEffect(() => { stateCallback.current?.(!busy && !unsaved); }, [busy, unsaved]);

  useEffect(() => {
    const readOnly = previewProps?.mode === "recipient" || previewProps?.giftId === EXAMPLE_GIFT_ID || (!previewProps && new URLSearchParams(window.location.search).get("mode") === "recipient");
    setRecipient(readOnly);
    try {
      if (previewProps?.giftId) {
        store.current = openGift(demoGift as GiftConfig, demoWorld, previewProps.giftId, readOnly ? "recipient" : "sender", localStorage);
        setSavedDefinition(store.current.read().room);
      } else {
        const saved = localStorage.getItem(storageKey);
        if (saved) { setResult(readResult(JSON.parse(saved))); setNotice("已恢复上次生成的房间。"); }
      }
    } catch { setNotice("无法读取已保存的方案，当前显示默认房间。"); }
    setHydrated(true);
    const status = new AbortController();
    if (!readOnly) void fetch("/api/room-agent", { signal: status.signal, cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => {
      if (typeof data?.configured === "boolean") setConfigured(data.configured);
    }).catch(() => { /* A status request must not prevent a later generation attempt. */ });
    return () => { status.abort(); controller.current?.abort(); };
  }, []);

  async function save(value: RoomAgentResult) {
    try {
      if (previewProps?.giftId) {
        if (!store.current) throw new Error("gift unavailable");
        await store.current.saveRoomLocked(value.definition); setSavedDefinition(value.definition);
      } else localStorage.setItem(storageKey, JSON.stringify(value));
      setUnsaved(false); setNotice("已生成并保存到本浏览器。");
    }
    catch { setUnsaved(true); setNotice("房间已生成，但未能保存到本浏览器。可重试保存或导出方案。"); }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controller.current || !prompt.trim()) return;
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(""); setNotice("");
    const timeout = window.setTimeout(() => request.abort("timeout"), 100_000);
    try {
      const response = await fetch("/api/room-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt.trim() }), signal: request.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data?.error?.message === "string" ? data.error.message : "生成失败，请稍后重试。");
      let next: RoomAgentResult;
      try { next = readResult(data); }
      catch { throw new Error("生成方案无法读取，当前房间已保留，请重试。"); }
      setResult(next); setRevision(v => v + 1); setConfigured(true); await save(next);
    } catch (failure) {
      if (request.signal.aborted) setError(request.signal.reason === "timeout" ? "生成超时，当前房间已保留，请重试。" : "已取消生成，当前房间已保留。");
      else setError(failure instanceof Error ? failure.message : "生成失败，当前房间已保留，请重试。");
    } finally { window.clearTimeout(timeout); controller.current = null; setBusy(false); }
  }

  async function restore() {
    try {
      if (previewProps?.giftId) {
        const { defaultRoom } = await import("@/room/definition");
        if (!store.current) throw new Error("gift unavailable");
        await store.current.saveRoomLocked(defaultRoom); setSavedDefinition(defaultRoom);
      } else localStorage.removeItem(storageKey);
    }
    catch { setError("无法清除本机保存的方案，请检查浏览器存储权限后重试。"); return; }
    setResult(null); setRevision(v => v + 1); setUnsaved(false); setError(""); setNotice("已恢复默认房间。");
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `promised-land-room-${result.run.id}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className={hydrated && !recipient ? "room-agent-workbench" : undefined}>
    {hydrated && !recipient && <section className="room-agent" aria-labelledby="room-agent-title">
      <div className="room-agent-intro">
        <h2 id="room-agent-title">描述你的房间</h2>
        <p id="room-agent-help">描述房型、家具和窗户，MiMo 会安排布局、配色和光线。支持卧室与起居室；相框、信件和 CD 机保留。</p>
      </div>
      <form onSubmit={generate} className="room-agent-form" aria-busy={busy}>
        <label htmlFor="room-agent-prompt">房间描述</label>
        <textarea id="room-agent-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={2000} required disabled={busy} rows={3} aria-describedby="room-agent-help room-agent-count" placeholder="例如：奶油色墙面、浅木色家具和绿色沙发，阳光温暖一些。" />
        <div className="room-agent-examples" aria-label="示例描述">{examples.map((example, index) => <button key={example} type="button" disabled={busy} onClick={() => setPrompt(example)}>试试{index === 0 ? "午后配色" : "双窗卧室"}</button>)}</div>
        <div className="room-agent-actions">
          <button type="submit" className="room-agent-primary" disabled={busy || !prompt.trim()}>{busy ? "正在生成…" : "生成房间"}</button>
          {busy && <button type="button" onClick={() => controller.current?.abort()}>取消生成</button>}
          {result && <><button type="button" onClick={download}>导出方案</button><button type="button" disabled={busy} onClick={restore}>恢复默认房间</button></>}
          {unsaved && result && <button type="button" onClick={() => save(result)}>重试保存</button>}
          <span id="room-agent-count">{prompt.length} / 2000</span>
        </div>
      </form>
      {configured === false && <p className="room-agent-hint">{previewProps ? "房间生成暂不可用，请稍后重试。" : "MiMo 尚未配置，请在服务端 .env.local 设置 MIMO_API_KEY 后重试。"}</p>}
      <p className="room-agent-status" role="status">{busy ? "正在请 MiMo 设计并校验房间，通常需要几十秒…" : notice}</p>
      {error && <p className="room3d-warning" role="alert">{error}</p>}
      {result && <div className="room-agent-result">
        <p>{result.design.summary}</p>
        {result.design.limitations.length > 0 && <div className="room-agent-limits"><p>本次未实现</p><ul>{result.design.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
        <details><summary>生成记录</summary><dl>
          <div><dt>模型</dt><dd>{result.run.model}</dd></div>
          <div><dt>调用次数</dt><dd>{result.run.attempts}{result.run.attempts === 2 ? "（含一次修正）" : ""}</dd></div>
          <div><dt>耗时</dt><dd>{(result.run.durationMs / 1000).toFixed(1)} 秒</dd></div>
          <div><dt>Token 用量</dt><dd>{result.run.totalTokens}</dd></div>
          <div><dt>房间检查</dt><dd>数据、家具边界、主要家具重叠、纪念物交互已通过</dd></div>
        </dl></details>
      </div>}
    </section>}
    {hydrated ? <RoomPreview key={revision} {...previewProps} definition={result?.definition ?? savedDefinition} /> : <p className="room-agent-loading" role="status">正在读取房间…</p>}
  </div>;
}
