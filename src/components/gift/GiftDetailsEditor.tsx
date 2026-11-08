"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { openGift } from "@/world/WinterGift";
import type { GiftStore } from "@/world/GiftStore";
import type { GiftConfig, GiftDetails } from "@/world/types";
import { demoWorld } from "@/world/config";
import demoGift from "@/world/demo-gift.json";

type Details = Pick<GiftDetails, "recipient" | "sender" | "memory">;
const empty: Details = { recipient: "", sender: "", memory: "" };

export default function GiftDetailsEditor({ giftId, onSaveStateChange }: { giftId: string; onSaveStateChange: (saved: boolean) => void }) {
  const [value, setValue] = useState<Details>(empty);
  const [hydrated, setHydrated] = useState(false), [saved, setSaved] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const store = useRef<GiftStore | null>(null), original = useRef<Details>(empty);
  const callback = useRef(onSaveStateChange); callback.current = onSaveStateChange;
  useEffect(() => {
    try {
      const current = openGift(demoGift as GiftConfig, demoWorld, giftId, "sender", localStorage);
      store.current = current;
      const details = current.read().details;
      original.current = { recipient: details?.recipient ?? "", sender: details?.sender ?? "", memory: details?.memory ?? "" };
      setValue(original.current);
      if (current.warning) { setSaved(false); setError(current.warning); }
    } catch { setSaved(false); setError("礼物信息无法读取，请刷新后重试。"); }
    setHydrated(true);
  }, [giftId]);
  useEffect(() => { callback.current(hydrated && saved && !busy); }, [hydrated, saved, busy]);

  function change(key: keyof Details, text: string) {
    const next = { ...value, [key]: text }; setValue(next); setError("");
    setSaved((Object.keys(empty) as (keyof Details)[]).every(key => next[key] === original.current[key]));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store.current || busy) return;
    setBusy(true); setError("");
    try {
      const patch: Partial<Details> = {};
      for (const key of Object.keys(empty) as (keyof Details)[]) if (value[key] !== original.current[key]) patch[key] = value[key];
      const gift = await store.current.saveDetailsLocked(patch);
      const details = gift.details!;
      original.current = { recipient: details.recipient, sender: details.sender, memory: details.memory };
      setValue(original.current); setSaved(true);
    } catch (failure) { setSaved(false); setError(failure instanceof Error ? failure.message : "保存失败，请重试。"); }
    finally { setBusy(false); }
  }

  return <details className="winter-gift-details">
    <summary>礼物信息{!saved && <span>未保存</span>}</summary>
    <form className="winter-form" aria-label="礼物信息" onSubmit={save}>
      <fieldset disabled={!hydrated || busy}>
        <legend className="winter-sr-only">昵称与回忆</legend>
        <div className="winter-field-pair">
          <label>送给谁<input maxLength={20} value={value.recipient} placeholder="对方的昵称" onChange={e => change("recipient", e.target.value)} /></label>
          <label>你的名字（选填）<input maxLength={20} value={value.sender} placeholder="你的名字" onChange={e => change("sender", e.target.value)} /></label>
        </div>
        <label>共同的回忆<textarea maxLength={2000} rows={3} value={value.memory} placeholder="写下一段共同的回忆" onChange={e => change("memory", e.target.value)} /></label>
        <div className="winter-form-actions"><span role="status">{busy ? "保存中…" : saved ? "已保存" : "未保存"}</span><button className="winter-secondary" type="submit" disabled={saved || busy}>保存信息</button></div>
      </fieldset>
      {error && <p className="winter-details-error" role="alert">{error}</p>}
    </form>
  </details>;
}
