"use client";

import { useEffect, useRef, useState } from "react";
import { prepareRoomReference } from "@/lib/media/photos";
import { composePet, customPet } from "@/room/composePet";
import type { PetAsset } from "@/room/petAsset";
import { petGenerationMetadata } from "@/room/petAppearance";
import type { RoomDefinition } from "@/room/types";
import PhotoUpload from "./PhotoUpload";

interface Props {
  definition: RoomDefinition;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onChange: (update: (definition: RoomDefinition) => RoomDefinition) => Promise<void>;
}

export default function PetAgentPanel({ definition, disabled, onBusyChange, onChange }: Props) {
  const current = customPet(definition);
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [activity, setActivity] = useState("");
  const [status, setStatus] = useState<{ configured: boolean }>();
  const active = useRef<AbortController | null>(null), jobId = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const callbacks = useRef({ onBusyChange, onChange }); callbacks.current = { onBusyChange, onChange };

  useEffect(() => {
    mounted.current = true;
    const request = new AbortController();
    void fetch("/api/pet-agent", { cache: "no-store", signal: request.signal }).then(r => r.json()).then(data => { if (mounted.current) setStatus(data); }).catch(() => {});
    return () => { mounted.current = false; request.abort(); active.current?.abort(); if (jobId.current) void fetch(`/api/pet-agent?id=${encodeURIComponent(jobId.current)}`, { method: "DELETE", keepalive: true }).catch(() => {}); };
  }, []);

  async function task(work: (signal: AbortSignal) => Promise<void>, message = "处理中…") {
    if (active.current || disabled) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setActivity(message); callbacks.current.onBusyChange(true); setError("");
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

  async function apply(asset: Omit<PetAsset, "version" | "size">, signal: AbortSignal) {
    const { measurePetAsset } = await import("@/room/models/petGlb");
    const measured = await measurePetAsset(asset);
    if (signal.aborted || !mounted.current) return;
    await callbacks.current.onChange(latest => {
      const previous = customPet(latest);
      return composePet(latest, measured, previous, previous?.rotation?.[1] ?? 0);
    });
  }

  async function requestPet() {
    if (!photo) return;
    await task(async signal => {
      const response = await fetch("/api/pet-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: photo.dataUrl }), signal });
      let job = await response.json();
      if (!response.ok) throw new Error(job.error?.message || "宠物生成失败，请重试。");
      if (job.id && job.status === "running") jobId.current = job.id;
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
      await apply({ ...petGenerationMetadata(r, r.species), species: r.species, glb: r.glb, template: r.template, source: r.source, license: r.license, targetLength: current?.petAsset?.targetLength ?? .55, upAxis: "y" }, signal);
    }, "正在生成宠物…");
  }

  const locked = busy || disabled;
  return <section className="pet-agent" aria-label="宠物设置" aria-busy={busy}>
    <div className="room-agent-form">
      <label htmlFor="pet-agent-photo">宠物照片（选填）</label>
      <PhotoUpload id="pet-agent-photo" label="宠物照片" describedBy="pet-agent-photo-help" disabled={locked} hasPhoto={!!photo} onSelect={file => {
        void task(async signal => { const dataUrl = await prepareRoomReference(file); if (!signal.aborted && mounted.current) setPhoto({ dataUrl, name: file.name }); });
      }} />
      <p id="pet-agent-photo-help" className="room-agent-photo-help">上传一只猫或狗的清晰照片，12MB 内，生成时发送给 MiMo。</p>
      {photo && <div className="room-agent-reference"><img src={photo.dataUrl} alt="待识别的宠物照片" /><button type="button" disabled={locked} onClick={() => setPhoto(undefined)}>移除照片</button></div>}
      {!busy && <button type="button" className="room-agent-primary" disabled={disabled || !photo || status?.configured === false} onClick={() => void requestPet()}>生成宠物</button>}
      {status?.configured === false && <p className="room-agent-photo-help">宠物生成暂不可用，请稍后重试。</p>}
      {busy && <p className="room-agent-status" role="status">{activity}</p>}
      {current?.petAsset && <div className="pet-agent-settings">
      <button type="button" disabled={locked} onClick={() => void task(async () => { await callbacks.current.onChange(latest => { const next = structuredClone(latest); next.nodes = next.nodes.filter(n => n.model !== "pet"); return next; }); })}>移除宠物</button>
      </div>}
      {busy && <button type="button" onClick={() => active.current?.abort()}>取消处理</button>}
    </div>
    {error && <p className="room3d-warning" role="alert">{error}</p>}
  </section>;
}
