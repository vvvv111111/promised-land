"use client";

import { useEffect, useRef, useState } from "react";
import { prepareRoomReference } from "@/lib/media/photos";
import { composePet, customPet } from "@/room/composePet";
import type { PetAsset } from "@/room/petAsset";
import type { RoomDefinition } from "@/room/types";

interface Props {
  definition: RoomDefinition;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onChange: (definition: RoomDefinition) => Promise<void>;
}
const names = { cat: "成年虎斑猫", kitten: "淡三花幼猫", dog: "黑棕短毛犬", puppy: "伯恩山幼犬" };

export default function PetAgentPanel({ definition, disabled, onBusyChange, onChange }: Props) {
  const current = customPet(definition);
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string }>();
  const [template, setTemplate] = useState("cat");
  const [source, setSource] = useState<"library" | "photo">("library");
  const [length, setLength] = useState(current?.petAsset?.targetLength ?? .55);
  const [yaw, setYaw] = useState(current?.rotation?.[1] ?? 0);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [status, setStatus] = useState<{ configured: boolean; libraryAvailable: boolean; primaryAvailable?: boolean }>();
  const active = useRef<AbortController | null>(null), jobId = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const callbacks = useRef({ onBusyChange, onChange }); callbacks.current = { onBusyChange, onChange };

  useEffect(() => {
    mounted.current = true;
    const request = new AbortController();
    void fetch("/api/pet-agent", { cache: "no-store", signal: request.signal }).then(r => r.json()).then(data => { if (mounted.current) setStatus(data); }).catch(() => {});
    return () => { mounted.current = false; request.abort(); active.current?.abort(); if (jobId.current) void fetch(`/api/pet-agent?id=${encodeURIComponent(jobId.current)}`, { method: "DELETE", keepalive: true }).catch(() => {}); };
  }, []);
  useEffect(() => { if (current?.petAsset) { setLength(current.petAsset.targetLength); setYaw(current.rotation?.[1] ?? 0); } }, [current?.petAsset?.targetLength, current?.rotation?.[1]]);
  useEffect(() => { if (current?.petAsset && current.petAsset.template in names) setTemplate(current.petAsset.template); }, [current?.petAsset?.template]);
  useEffect(() => { setError(""); }, [definition]);

  async function task(work: (signal: AbortSignal) => Promise<void>) {
    if (active.current || disabled) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); callbacks.current.onBusyChange(true); setError("");
    const timeout = window.setTimeout(() => controller.abort(), 270_000);
    try { await work(controller.signal); }
    catch (failure) { if (mounted.current) setError(controller.signal.aborted ? "已取消" : failure instanceof Error ? failure.message : "处理失败，请重试。"); }
    finally {
      window.clearTimeout(timeout);
      if (jobId.current) {
        await fetch(`/api/pet-agent?id=${encodeURIComponent(jobId.current)}`, { method: "DELETE" }).catch(() => {});
        jobId.current = undefined;
      }
      active.current = null;
      if (mounted.current) { setBusy(false); callbacks.current.onBusyChange(false); }
    }
  }

  async function apply(asset: Omit<PetAsset, "version" | "size">, signal: AbortSignal, nextYaw = yaw) {
    const { measurePetAsset } = await import("@/room/models/petGlb");
    const measured = await measurePetAsset(asset);
    if (signal.aborted || !mounted.current) return;
    const plan = composePet(definition, measured, current, nextYaw);
    await callbacks.current.onChange(plan);
  }

  async function updateSettings(nextLength: number, nextYaw: number) {
    if (!current?.petAsset) return;
    if (!Number.isFinite(nextLength) || nextLength < .25 || nextLength > 1.4) { setError("大小需为 0.25–1.4 米。"); return; }
    await task(signal => apply({ ...current.petAsset!, targetLength: nextLength }, signal, nextYaw));
  }

  async function requestPet(manual: boolean) {
    if (!Number.isFinite(length) || length < .25 || length > 1.4) { setError("宠物占地长边需要在 0.25–1.4 米之间。"); return; }
    await task(async signal => {
      const response = await fetch("/api/pet-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(manual ? { templateId: template } : { image: photo?.dataUrl }), signal });
      let job = await response.json();
      if (!response.ok) throw new Error(job.error?.message || "宠物生成失败，请重试。");
      if (job.id) jobId.current = job.id;
      while (job.status === "running") {
        await new Promise<void>((resolve, reject) => {
          const cancel = () => { window.clearTimeout(timer); reject(new Error("cancelled")); };
          const timer = window.setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, 1200);
          signal.addEventListener("abort", cancel, { once: true });
          if (signal.aborted) cancel();
        });
        const poll = await fetch(`/api/pet-agent?id=${encodeURIComponent(jobId.current || "")}`, { cache: "no-store", signal });
        job = await poll.json();
        if (!poll.ok) throw new Error(job.error?.message || "生成记录无法读取，请重试。");
      }
      if (job.status !== "succeeded" || !job.result) throw new Error(job.error || "宠物生成未完成。");
      const r = job.result;
      await apply({ species: r.species, glb: r.glb, template: r.template, source: r.source, license: r.license, targetLength: length, upAxis: "y" }, signal);
    });
  }

  const locked = busy || disabled;
  return <section className="pet-agent" aria-label="宠物设置" aria-busy={busy}>
    <div className="pet-agent-sources" aria-label="宠物来源">
      <button type="button" aria-pressed={source === "library"} disabled={locked} onClick={() => setSource("library")}>选模型</button>
      <button type="button" aria-pressed={source === "photo"} disabled={locked} onClick={() => setSource("photo")}>用照片</button>
    </div>
    <div className="room-agent-form">
      {source === "photo" ? <>
      <label htmlFor="pet-agent-photo">宠物照片</label>
      <input id="pet-agent-photo" className="room-agent-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} aria-describedby="pet-agent-photo-help" onChange={e => {
        const file = e.target.files?.[0]; e.target.value = "";
        if (file) void task(async signal => { const dataUrl = await prepareRoomReference(file); if (!signal.aborted && mounted.current) setPhoto({ dataUrl, name: file.name }); });
      }} />
      <p id="pet-agent-photo-help" className="room-agent-photo-help">12MB 内，识别时发送给 MiMo。</p>
      {photo && <div className="room-agent-reference"><img src={photo.dataUrl} alt="待识别的宠物照片" /><button type="button" disabled={locked} onClick={() => setPhoto(undefined)}>移除照片</button></div>}
      <button type="button" className="room-agent-primary" disabled={locked || !photo || status?.configured === false} onClick={() => void requestPet(false)}>识别匹配</button>
      {status?.configured === false && <p className="room-agent-photo-help">照片识别暂不可用</p>}
      </> : <>
      <label htmlFor="pet-agent-template">模型</label>
      <select id="pet-agent-template" value={template} disabled={locked} onChange={e => setTemplate(e.target.value)}>{Object.entries(names).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <button type="button" className="room-agent-primary" disabled={locked || status?.libraryAvailable === false} onClick={() => void requestPet(true)}>预览模型</button>
      {status?.libraryAvailable === false && <p className="room-agent-photo-help">模型暂不可用</p>}
      </>}
      {(source === "library" || status?.primaryAvailable === false) && <p className="room-agent-photo-help">保留模型原毛色与姿态。</p>}
      {current?.petAsset && <div className="pet-agent-settings">
      <label htmlFor="pet-agent-length">占地长边（米，含尾巴）</label>
      <input id="pet-agent-length" type="number" min="0.25" max="1.4" step="0.05" value={Number.isFinite(length) ? length : ""} disabled={locked} onChange={e => setLength(e.target.valueAsNumber)} onBlur={e => { const value = e.currentTarget.valueAsNumber; if (value !== current.petAsset?.targetLength) void updateSettings(value, yaw); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
      <label htmlFor="pet-agent-yaw">朝向</label>
      <select id="pet-agent-yaw" value={yaw} disabled={locked} onChange={e => { const value = Number(e.target.value); setYaw(value); void updateSettings(length, value); }}><option value={0}>原始朝向</option><option value={Math.PI / 2}>左转 90°</option><option value={Math.PI}>转身 180°</option><option value={-Math.PI / 2}>右转 90°</option></select>
      <button type="button" disabled={locked} onClick={() => void task(async () => { const next = structuredClone(definition); next.nodes = next.nodes.filter(n => n.model !== "pet"); await callbacks.current.onChange(next); })}>移除宠物</button>
      </div>}
      {busy && <button type="button" onClick={() => active.current?.abort()}>取消处理</button>}
    </div>
    {error && <p className="room3d-warning" role="alert">{error}</p>}
  </section>;
}
