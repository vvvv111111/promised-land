"use client";

import { useEffect, useRef, useState } from "react";
import type { GiftContent, GiftMode, PhotoFrameContent } from "@/world/types";
import { preparePhoto } from "./preparePhoto";

interface Props {
  mode: GiftMode;
  content: GiftContent;
  fallbackImage: string;
  onSave: (content: GiftContent) => void;
  onClose: () => void;
}

export default function GiftContentDialog({ mode, content, fallbackImage, onSave, onClose }: Props) {
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

  function persist(next: GiftContent) {
    if (!editable) return false;
    try {
      onSave(next);
      setDirty(false); setError(""); setNotice("已自动保存，关闭后仍会保留。");
      return true;
    } catch (e) {
      setDirty(true); setNotice("");
      setError(e instanceof Error ? e.message : "保存失败，请重试。");
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
    if (dirty) { setError("更改尚未保存，请重试保存，或放弃未保存更改。"); return; }
    onClose();
  }

  async function upload(file: File | undefined) {
    if (!editable || !file || draft.kind !== "photo_frame") return;
    const sequence = ++uploadSequence.current;
    setBusy(true); setError("");
    try {
      const photo = await preparePhoto(file);
      if (sequence === uploadSequence.current) change({ kind: "photo_frame", photo, zoom: 1, position_x: 0.5, position_y: 0.5 });
    } catch (e) {
      if (sequence === uploadSequence.current) setError(e instanceof Error ? e.message : "照片处理失败，请重试。");
    } finally {
      if (sequence === uploadSequence.current) setBusy(false);
    }
  }

  function adjust(key: "zoom" | "position_x" | "position_y", value: string) {
    if (draft.kind === "photo_frame") change({ ...draft, [key]: Number(value) } as PhotoFrameContent);
  }

  return (
    <dialog ref={dialogRef} className="gift-dialog" aria-labelledby="gift-dialog-title" onCancel={event => { event.preventDefault(); close(); }}>
      <div className="gift-dialog-head">
        <div>
          <p className="room-kicker">{editable ? "为你珍藏的心意" : "送给你的心意"}</p>
          <h2 id="gift-dialog-title">{draft.kind === "photo_frame" ? "珍藏相框" : "展开信件"}</h2>
        </div>
        <button className="gift-close" type="button" onClick={close} disabled={busy} aria-label="关闭弹窗">×</button>
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
            <img src={fallbackImage} alt="默认日落相框" />
          </div>}
          {editable && editing && <div className="gift-editor">
            <label className="gift-file">{draft.photo ? "更换照片" : "上传照片"}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <p className="room-hint">支持 JPG、PNG、WebP，最大 10 MB。上传后可调整照片取景。</p>
            <label>照片缩放 <output>{draft.zoom.toFixed(2)}×</output>
              <input aria-label="照片缩放" type="range" min="1" max="3" step="0.01" value={draft.zoom} disabled={!draft.photo || busy} onChange={e => adjust("zoom", e.target.value)} />
            </label>
            <label>左右位置 <input aria-label="照片左右位置" type="range" min="0" max="1" step="0.01" value={draft.position_x} disabled={!draft.photo || busy} onChange={e => adjust("position_x", e.target.value)} /></label>
            <label>上下位置 <input aria-label="照片上下位置" type="range" min="0" max="1" step="0.01" value={draft.position_y} disabled={!draft.photo || busy} onChange={e => adjust("position_y", e.target.value)} /></label>
          </div>}
        </>
      ) : (
        <div className="gift-letter-paper">
          {editable && editing ? <label className="gift-letter-label">信件正文
            <textarea aria-label="信件正文" autoFocus maxLength={10000} value={draft.body} onChange={e => change({ kind: "letter", body: e.target.value })} placeholder="写下想对收礼者说的话…" />
            <span className="room-hint">{draft.body.length}/10000</span>
          </label> : <p className="gift-letter-body">{draft.body || "这封信还没有写下正文。"}</p>}
        </div>
      )}
      {busy && <p role="status">正在处理照片…</p>}
      {notice && <p className="gift-save-notice" role="status">{notice}</p>}
      {error && <p className="room-warning" role="alert">{error}</p>}
      <div className="gift-dialog-actions">
        {editable && (!editing
          ? <button type="button" onClick={() => setEditing(true)}>{draft.kind === "photo_frame" ? "编辑相框" : "编辑信件"}</button>
          : <button type="button" disabled={busy} onClick={() => { if (persist(draft)) { setEditing(false); setNotice("编辑结果已保存。"); } }}>保存编辑</button>)}
        {editable && dirty && <button type="button" disabled={busy} onClick={onClose}>放弃未保存更改</button>}
      </div>
    </dialog>
  );
}
