"use client";

import { useEffect, useRef, useState } from "react";
import type { GiftContent, GiftMode, PhotoFrameContent } from "@/world/types";
import { prepareFramePhoto } from "@/lib/media/photos";
import { useDialogBounds } from "@/components/shared/useDialogBounds";
import type { ViewBounds } from "@/room/rendering/objectFocus";

interface Props {
  mode: GiftMode;
  content: GiftContent;
  fallbackImage: string;
  onSave: (content: GiftContent) => void;
  onClose: () => void;
  inspection?: boolean;
  onBounds?: (bounds: ViewBounds | null) => void;
}

export default function GiftContentDialog({ mode, content, fallbackImage, onSave, onClose, inspection = false, onBounds }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uploadSequence = useRef(0);
  const [draft, setDraft] = useState<GiftContent>(() => structuredClone(content));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const editable = mode === "sender";

  useEffect(() => {
    const dialog = dialogRef.current;
    const focused = document.activeElement;
    dialog?.showModal();
    return () => {
      uploadSequence.current++;
      dialog?.close();
      if (focused instanceof HTMLElement) focused.focus();
    };
  }, []);
  useDialogBounds(dialogRef, true, onBounds);

  function persist(next: GiftContent) {
    if (!editable) return false;
    try {
      onSave(next);
      setDirty(false); setError(""); setNotice("已保存");
      return true;
    } catch (e) {
      setDirty(true); setNotice("");
      setError(e instanceof Error ? e.message : "保存失败。输入已暂留，请检查浏览器存储或减少照片大小后重试。");
      return false;
    }
  }

  function change(next: GiftContent) {
    if (!editable) return;
    setDraft(next);
    persist(next);
  }

  function close() {
    if (busy) return;
    if (dirty) { setError("更改尚未保存，请重试保存或放弃更改。"); return; }
    onClose();
  }

  async function upload(file: File | undefined) {
    if (!editable || !file || draft.kind !== "photo_frame") return;
    const sequence = ++uploadSequence.current;
    setBusy(true); setError("");
    try {
      const photo = await prepareFramePhoto(file);
      if (sequence === uploadSequence.current) change({ kind: "photo_frame", photo, zoom: 1, position_x: 0.5, position_y: 0.5 });
    } catch (e) {
      if (sequence === uploadSequence.current) setError(e instanceof Error ? e.message : "照片无法处理，请重新选择。");
    } finally {
      if (sequence === uploadSequence.current) setBusy(false);
    }
  }

  function adjust(key: "zoom" | "position_x" | "position_y", value: string) {
    if (draft.kind === "photo_frame") change({ ...draft, [key]: Number(value) } as PhotoFrameContent);
  }

  return (
    <dialog ref={dialogRef} className={`gift-dialog${inspection ? " room3d-inspection" : ""}`} aria-labelledby="gift-dialog-title" onCancel={event => { event.preventDefault(); close(); }}>
      <div className="gift-dialog-head">
        <div>
          <h2 id="gift-dialog-title">{draft.kind === "photo_frame" ? "相框" : "信件"}</h2>
        </div>
        <button className="gift-close" type="button" onClick={close} disabled={busy} aria-label="关闭"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
      </div>
      {draft.kind === "photo_frame" ? (
        <>
          {draft.photo ? <div className="gift-photo-frame">
            <div className="gift-photo-window">
              {/* Uploaded local images are dynamic data URLs, rendered without optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="礼物相框中的照片" src={draft.photo} draggable={false} style={{ objectPosition: `${draft.position_x * 100}% ${draft.position_y * 100}%`, transform: `scale(${draft.zoom})`, transformOrigin: `${draft.position_x * 100}% ${draft.position_y * 100}%` }} />
            </div>
          </div> : <div className="gift-default-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fallbackImage} alt="默认相框" />
          </div>}
          {editable && editing && <div className="gift-editor">
            <label className="gift-file">{draft.photo ? "更换照片" : "上传照片"}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <p className="room-hint">JPG / PNG / WebP · 不超过 10MB</p>
            <label>缩放 <output>{draft.zoom.toFixed(2)}×</output>
              <input aria-label="缩放" type="range" min="1" max="3" step="0.01" value={draft.zoom} disabled={!draft.photo || busy} onChange={e => adjust("zoom", e.target.value)} />
            </label>
            <label>左右位置 <input aria-label="左右位置" type="range" min="0" max="1" step="0.01" value={draft.position_x} disabled={!draft.photo || busy} onChange={e => adjust("position_x", e.target.value)} /></label>
            <label>上下位置 <input aria-label="上下位置" type="range" min="0" max="1" step="0.01" value={draft.position_y} disabled={!draft.photo || busy} onChange={e => adjust("position_y", e.target.value)} /></label>
          </div>}
        </>
      ) : (
        <div className="gift-letter-paper">
          {editable && editing ? <label className="gift-letter-label">正文
            <textarea aria-label="正文" autoFocus maxLength={10000} value={draft.body} onChange={e => change({ kind: "letter", body: e.target.value })} placeholder="写下想说的话" />
            <span className="room-hint">{draft.body.length}/10000</span>
          </label> : <p className="gift-letter-body">{draft.body || "暂无正文"}</p>}
        </div>
      )}
      {busy && <p role="status">正在处理照片…</p>}
      {notice && <p className="gift-save-notice" role="status">{notice}</p>}
      {error && <p className="room-warning" role="alert">{error}</p>}
      <div className="gift-dialog-actions">
        {editable && (!editing
          ? <button type="button" onClick={() => setEditing(true)}>{draft.kind === "photo_frame" ? "编辑相框" : "编辑信件"}</button>
          : <button type="button" disabled={busy} onClick={() => { if (persist(draft)) { setEditing(false); setNotice("已保存"); } }}>保存</button>)}
        {editable && dirty && <button type="button" disabled={busy} onClick={onClose}>放弃更改</button>}
      </div>
    </dialog>
  );
}
