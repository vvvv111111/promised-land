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
import { prepareRoomReference } from "@/lib/media/photos";
import { defaultRoom, validateRoomDefinition } from "@/room/definition";
import { preservePet } from "@/room/composePet";
import PetAgentPanel from "./PetAgentPanel";
import { persistPetAssets } from "@/lib/storage/petAssetStore";
import { isRoomGenerationProgress, ROOM_REQUEST_TIMEOUT_MS } from "@/room/agent/generation";
import RoomGenerationProgress from "./RoomGenerationProgress";

const storageKey = "promised-land:room-agent:v1";
const examples = [
  { label: "午后配色", prompt: "奶油色墙面、浅木色家具和鼠尾草绿沙发，像一个安静的午后。" },
  { label: "双窗卧室", prompt: "改成卧室：去掉沙发、茶桌和矮柜，放一张床、一张书桌和椅子，左墙和后墙各一扇窗户。CD 机和信件放书桌上，相框挂墙。" },
  { label: "双人书房", prompt: "生成宽7米、深5.6米、高3米的双人书房：两张1.6米宽的书桌、两把椅子、一个书架和一张阅读扶手椅。两张书桌分别用深浅木色，后墙开一扇窗，不要沙发或床。" },
  { label: "四人餐厅", prompt: "生成宽6.5米、深5米、高3米的四人餐厅，一张1.8米长餐桌、四把椅子和一个餐边柜，后墙一扇窗，浅木色搭配陶土色。不要沙发、茶桌或床。" },
];

function readResult(input: unknown): RoomAgentResult {
  if (!input || typeof input !== "object" || !("design" in input) || !("run" in input)) throw new Error("invalid result");
  const room = roomFromDesign(input.design), run = input.run as RoomAgentResult["run"];
  if ("definition" in input) { validateRoomDefinition(input.definition); room.definition = structuredClone(input.definition); }
  if (!run || typeof run.id !== "string" || run.id.length > 100 || typeof run.model !== "string" || run.model.length > 100 || !Number.isSafeInteger(run.attempts) || run.attempts < 1 || !Number.isFinite(run.durationMs) || run.durationMs < 0 || !Number.isSafeInteger(run.totalTokens) || run.totalTokens < 0) throw new Error("invalid run");
  if (run.input !== undefined && run.input !== "text" && run.input !== "image") throw new Error("invalid input mode");
  if (run.referenceDescription !== undefined && (typeof run.referenceDescription !== "string" || run.referenceDescription.length > 500)) throw new Error("invalid reference observation");
  if (run.positionCorrections !== undefined && (!Number.isSafeInteger(run.positionCorrections) || run.positionCorrections < 0 || run.positionCorrections > 32)) throw new Error("invalid position corrections");
  return { ...room, run: { id: run.id, model: run.model, attempts: run.attempts, durationMs: run.durationMs, totalTokens: run.totalTokens, ...(run.input ? { input: run.input } : {}), ...(run.referenceDescription ? { referenceDescription: run.referenceDescription } : {}), ...(run.positionCorrections ? { positionCorrections: run.positionCorrections } : {}) } };
}

export default function RoomAgentWorkbench({ previewProps, onSaveStateChange }: { previewProps?: RoomPreviewProps; onSaveStateChange?: (saved: boolean) => void }) {
  const [prompt, setPrompt] = useState("");
  const [reference, setReference] = useState<{ dataUrl: string; name: string } | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoSequence = useRef(0);
  const [result, setResult] = useState<RoomAgentResult | null>(null);
  const [draft, setDraft] = useState<{ definition: RoomDefinition; result: RoomAgentResult | null } | null>(null);
  const [tab, setTab] = useState<"room" | "pet">("room");
  const [saving, setSaving] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [recipient, setRecipient] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generationProgress, setGenerationProgress] = useState("");
  const [generationInfo, setGenerationInfo] = useState<{ startedAt: number; round: number; waiting: boolean } | null>(null);
  const [petBusy, setPetBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const store = useRef<GiftStore | null>(null);
  const previewContainer = useRef<HTMLDivElement>(null);
  const [savedDefinition, setSavedDefinition] = useState<RoomDefinition>();
  const stateCallback = useRef(onSaveStateChange); stateCallback.current = onSaveStateChange;
  useEffect(() => { stateCallback.current?.(!busy && !petBusy && !saving && !draft); }, [busy, petBusy, saving, draft]);
  const definition = draft?.definition ?? result?.definition ?? savedDefinition ?? defaultRoom;
  const locked = busy || petBusy || saving || preparingPhoto;
  useEffect(() => {
    const element = previewContainer.current;
    if (!hydrated || recipient || !element) return;
    const observer = new ResizeObserver(() => element.parentElement?.style.setProperty("--room-preview-height", `${Math.ceil(element.getBoundingClientRect().height)}px`));
    observer.observe(element);
    return () => observer.disconnect();
  }, [hydrated, recipient]);

  useEffect(() => {
    const readOnly = previewProps?.mode === "recipient" || previewProps?.giftId === EXAMPLE_GIFT_ID || (!previewProps && new URLSearchParams(window.location.search).get("mode") === "recipient");
    setRecipient(readOnly);
    try {
      if (previewProps?.giftId) {
        store.current = openGift(demoGift as GiftConfig, demoWorld, previewProps.giftId, readOnly ? "recipient" : "sender", localStorage);
        setSavedDefinition(store.current.read().room);
      } else {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.design) setResult(readResult(parsed));
          else { validateRoomDefinition(parsed.definition); setSavedDefinition(parsed.definition); }
        }
      }
    } catch { setError("无法读取已保存的方案。"); }
    setHydrated(true);
    const status = new AbortController();
    if (!readOnly) void fetch("/api/room-agent", { signal: status.signal, cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => {
      if (typeof data?.configured === "boolean") setConfigured(data.configured);
    }).catch(() => { /* A status request must not prevent a later generation attempt. */ });
    return () => { status.abort(); controller.current?.abort(); photoSequence.current++; };
  }, []);

  async function uploadReference(file?: File) {
    if (!file) return;
    const sequence = ++photoSequence.current;
    setPreparingPhoto(true); setPhotoError("");
    try {
      const dataUrl = await prepareRoomReference(file);
      if (sequence === photoSequence.current) setReference({ dataUrl, name: file.name });
    } catch (failure) {
      if (sequence === photoSequence.current) setPhotoError(failure instanceof Error ? failure.message : "参考照片无法处理，请重试。");
    } finally { if (sequence === photoSequence.current) setPreparingPhoto(false); }
  }

  function preview(next: RoomDefinition, value: RoomAgentResult | null) {
    validateRoomDefinition(next);
    setPreviewReady(false); setPreviewFailed(false);
    setDraft({ definition: next, result: value }); setNotice(""); setError("");
  }

  async function saveDraft() {
    if (!draft || locked || !previewReady || previewFailed) return;
    const candidate = draft;
    setSaving(true); setError("");
    try {
      const persisted = await persistPetAssets(candidate.definition);
      const next = candidate.result ? { ...candidate.result, definition: persisted } : null;
      if (previewProps?.giftId) {
        if (!store.current) throw new Error("gift unavailable");
        await store.current.saveRoomLocked(persisted);
      } else localStorage.setItem(storageKey, JSON.stringify(next ? { ...next, definition: persisted } : { definition: persisted }));
      setResult(candidate.result ? { ...candidate.result, definition: candidate.definition } : null);
      setSavedDefinition(candidate.definition); setDraft(null); setNotice("已保存");
      setGenerationInfo(null);
    }
    catch { setError("保存失败，请重试。"); }
    finally { setSaving(false); }
  }

  function discard() {
    if (locked) return;
    setDraft(null); setPreviewReady(false); setPreviewFailed(false); setNotice(""); setError("");
    setGenerationInfo(null);
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controller.current || locked || (!prompt.trim() && !reference)) return;
    const request = new AbortController(); controller.current = request;
    setBusy(true); setError(""); setNotice(""); setGenerationProgress("");
    setGenerationInfo({ startedAt: Date.now(), round: 0, waiting: false });
    let generationId: string | undefined;
    try {
      let data;
      while (true) {
        request.signal.throwIfAborted();
        const timeout = window.setTimeout(() => request.abort("timeout"), ROOM_REQUEST_TIMEOUT_MS);
        try {
          const response = await fetch("/api/room-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(generationId ? { generationId } : { continuous: true, prompt: prompt.trim(), ...(reference ? { referenceImage: reference.dataUrl } : {}) }), signal: request.signal });
          data = await response.json();
          request.signal.throwIfAborted();
          if (!response.ok && generationId && [409, 429].includes(response.status) && data?.error?.code === "BUSY") {
            setGenerationProgress("等待中…");
            setGenerationInfo(info => info && { ...info, waiting: true });
            await new Promise<void>((resolve, reject) => {
              const cancel = () => { window.clearTimeout(timer); reject(request.signal.reason); };
              const timer = window.setTimeout(() => { request.signal.removeEventListener("abort", cancel); resolve(); }, 1200);
              request.signal.addEventListener("abort", cancel, { once: true });
              if (request.signal.aborted) cancel();
            });
            continue;
          }
          if (!response.ok) throw new Error(typeof data?.error?.message === "string" ? data.error.message : "生成失败，请稍后重试。");
          if (response.status !== 202) break;
          if (!isRoomGenerationProgress(data) || generationId && data.generationId !== generationId) throw new Error("无法读取修复进度，当前房间已保留，请重试。");
          generationId = data.generationId;
          setGenerationProgress("调整布局中…");
          const round = data.attempts;
          setGenerationInfo(info => info && { ...info, round, waiting: false });
        } finally { window.clearTimeout(timeout); }
      }
      let next: RoomAgentResult;
      try { next = readResult(data); }
      catch { throw new Error("生成方案无法读取，当前房间已保留，请重试。"); }
      next.definition = preservePet(next.definition, definition);
      preview(next.definition, next); setConfigured(true);
    } catch (failure) {
      setGenerationInfo(null);
      if (request.signal.aborted) setError(request.signal.reason === "timeout" ? "生成超时，请重试。" : "已取消");
      else setError(failure instanceof Error ? failure.message : "生成失败，当前房间已保留，请重试。");
    } finally {
      if (generationId) void fetch(`/api/room-agent?id=${encodeURIComponent(generationId)}`, { method: "DELETE", keepalive: true }).catch(() => {});
      controller.current = null; setBusy(false); setGenerationProgress("");
    }
  }

  if (!hydrated) return <p className="room-agent-loading" role="status">加载中…</p>;
  if (recipient) return <RoomPreview {...previewProps} definition={definition} />;
  return <div className="room-agent-workbench">
    <div className="room-editor-preview" ref={previewContainer}>
      <RoomPreview {...previewProps} definition={definition}
        onReady={() => { setPreviewReady(true); setPreviewFailed(false); previewProps?.onReady?.(); }}
        onError={() => { setPreviewReady(false); setPreviewFailed(true); previewProps?.onError?.(); }} />
      <div className="room-editor-savebar">
        <span role="status">{saving ? "保存中…" : busy ? generationProgress || "生成中…" : petBusy || preparingPhoto ? "处理中…" : draft ? previewFailed ? "预览失败" : "预览中" : notice}</span>
        {draft && <div className="room-agent-actions">
          <button type="button" className="room-agent-primary" disabled={locked || !previewReady || previewFailed} onClick={() => void saveDraft()}>保存</button>
          <button type="button" disabled={locked} onClick={discard}>撤销</button>
        </div>}
      </div>
      {error && <p className="room3d-warning" role="alert">{error}</p>}
    </div>
    <section className="room-agent" aria-label="空间编辑">
      <div className="room-editor-tabs" role="tablist" aria-label="编辑内容" onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || locked) return;
        event.preventDefault();
        const next = event.key === "Home" ? "room" : event.key === "End" ? "pet" : tab === "room" ? "pet" : "room";
        setTab(next); document.getElementById(`room-editor-tab-${next}`)?.focus();
      }}>
        {(["room", "pet"] as const).map(value => <button key={value} id={`room-editor-tab-${value}`} role="tab" type="button" aria-selected={tab === value} aria-controls={`room-editor-panel-${value}`} tabIndex={tab === value ? 0 : -1} disabled={locked} onClick={() => setTab(value)}>{value === "room" ? "房间" : "宠物"}</button>)}
      </div>
      <div role="tabpanel" id="room-editor-panel-room" aria-labelledby="room-editor-tab-room" hidden={tab !== "room"}>
        <form onSubmit={generate} className="room-agent-form" aria-busy={busy}>
          <fieldset className="room-agent-fields" disabled={locked}>
            <label htmlFor="room-agent-reference">参考照片（选填）</label>
            <input className="room-agent-file" id="room-agent-reference" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="room-agent-reference-help" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void uploadReference(file); }} />
            <p id="room-agent-reference-help" className="room-agent-photo-help">12MB 内，生成时发送给 MiMo。</p>
            {reference && <div className="room-agent-reference">
              <img src={reference.dataUrl} alt="房间参考照片" />
              <button type="button" onClick={() => { photoSequence.current++; setReference(null); setPhotoError(""); }}>移除照片</button>
            </div>}
            <label htmlFor="room-agent-prompt">房间描述</label>
            <textarea id="room-agent-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={2000} required={!reference} rows={3} placeholder={reference ? "补充要求（选填）" : "例如：浅木色卧室，两扇窗。"} />
            <div className="room-agent-examples" aria-label="示例描述">{examples.map(example => <button key={example.label} type="button" onClick={() => setPrompt(example.prompt)}>{example.label}</button>)}</div>
          </fieldset>
          {!busy && <button type="submit" className="room-agent-primary" disabled={locked || (!prompt.trim() && !reference)}>生成房间</button>}
          {generationInfo && (busy || draft?.result) && !previewFailed && <RoomGenerationProgress
            startedAt={generationInfo.startedAt} round={generationInfo.round}
            phase={busy ? generationInfo.waiting ? "waiting" : generationInfo.round > 0 ? "repairing" : "generating" : previewReady ? "complete" : "previewing"} />}
          {busy && <button type="button" onClick={() => controller.current?.abort()}>取消生成</button>}
        </form>
        {photoError && <p className="room3d-warning" role="alert">{photoError}</p>}
        {configured === false && <p className="room-agent-hint">暂时无法生成</p>}
      </div>
      <div role="tabpanel" id="room-editor-panel-pet" aria-labelledby="room-editor-tab-pet" hidden={tab !== "pet"}>
        <PetAgentPanel definition={definition} disabled={busy || saving || preparingPhoto} onBusyChange={setPetBusy} onChange={async next => { setGenerationInfo(null); preview(next, draft ? draft.result : result); }} />
      </div>
    </section>
  </div>;
}
