"use client";

import { useEffect, useRef, useState } from "react";
import { roomAudioStore, type RoomAudio } from "@/lib/storage/roomAudioStore";
import { prepareRoomAudio, type AudioSelection } from "@/lib/media/audio";
import { useDialogBounds } from "@/components/shared/useDialogBounds";
import type { ViewBounds } from "@/room/rendering/objectFocus";

function clock(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export default function RoomAudioDialog({ open, close, giftId, editable, onPlayingChange, onBounds }: {
  open: boolean; close: () => void; giftId: string; editable: boolean; onPlayingChange: (playing: boolean) => void;
  onBounds?: (bounds: ViewBounds | null) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const alive = useRef(false), sequence = useRef(0);
  const playingCallback = useRef(onPlayingChange); playingCallback.current = onPlayingChange;
  const [saved, setSaved] = useState<RoomAudio | null>(null);
  const [draft, setDraft] = useState<AudioSelection | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [playing, setPlaying] = useState(false);
  const [playable, setPlayable] = useState(false);
  const [duration, setDuration] = useState(0), [position, setPosition] = useState(0);
  const active = draft ?? saved;

  useEffect(() => {
    alive.current = true;
    const current = ++sequence.current;
    setBusy(true); setSaved(null); setDraft(null); setError("");
    roomAudioStore.read(giftId).then(record => { if (alive.current && current === sequence.current) setSaved(record); })
      .catch(() => { if (alive.current && current === sequence.current) setError("音频无法读取，请检查浏览器存储设置后重试。"); })
      .finally(() => { if (alive.current && current === sequence.current) setBusy(false); });
    return () => { alive.current = false; sequence.current++; };
  }, [giftId]);

  useEffect(() => {
    if (!open) { dialogRef.current?.close(); return; }
    const focused = document.activeElement;
    dialogRef.current?.showModal();
    return () => { dialogRef.current?.close(); if (focused instanceof HTMLElement && focused.isConnected) focused.focus(); };
  }, [open]);
  useDialogBounds(dialogRef, open, onBounds);

  useEffect(() => {
    const audio = audioRef.current;
    setPlayable(false); setPlaying(false); setPosition(0); setDuration(0); playingCallback.current(false);
    if (!audio || !active) return;
    const url = URL.createObjectURL(active.blob);
    audio.src = url; audio.load();
    return () => { audio.pause(); audio.removeAttribute("src"); audio.load(); URL.revokeObjectURL(url); };
  }, [active]);

  function dismiss() {
    if (busy) return;
    if (draft) { setDraft(null); setNotice(""); }
    close();
  }
  async function upload(file?: File) {
    if (!editable || !file || busy) return;
    const current = ++sequence.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const next = await prepareRoomAudio(file);
      if (alive.current && current === sequence.current) setDraft(next);
    } catch (e) {
      if (alive.current && current === sequence.current) setError(e instanceof Error ? e.message : "音频无法处理，请重试。");
    } finally { if (alive.current && current === sequence.current) setBusy(false); }
  }
  async function save() {
    if (!editable || !draft || busy) return;
    setBusy(true); setError("");
    try {
      const record = await roomAudioStore.save(giftId, draft);
      if (alive.current) { setSaved(record); setDraft(null); setNotice("已保存"); }
    } catch { if (alive.current) setError("保存失败，原音频已保留。请检查存储空间后重试。"); }
    finally { if (alive.current) setBusy(false); }
  }
  async function remove() {
    if (!editable || !saved || busy) return;
    setBusy(true); setError("");
    try {
      await roomAudioStore.remove(giftId);
      if (alive.current) { setSaved(null); setDraft(null); setNotice(""); }
    } catch { if (alive.current) setError("移除失败，原音频已保留，请重试。"); }
    finally { if (alive.current) setBusy(false); }
  }
  async function toggle() {
    const audio = audioRef.current;
    if (!audio || !playable) return;
    if (!audio.paused) { audio.pause(); return; }
    try { await audio.play(); }
    catch { if (alive.current) setError("音频未能播放，请重试或更换文件。"); }
  }

  return <>
    <audio ref={audioRef} preload="metadata"
      onLoadedData={() => { setPlayable(true); setDuration(Number.isFinite(audioRef.current?.duration) ? audioRef.current!.duration : 0); }}
      onDurationChange={() => setDuration(Number.isFinite(audioRef.current?.duration) ? audioRef.current!.duration : 0)}
      onTimeUpdate={() => setPosition(audioRef.current?.currentTime ?? 0)}
      onPlaying={() => { setPlaying(true); playingCallback.current(true); }}
      onPause={() => { setPlaying(false); playingCallback.current(false); }}
      onEnded={() => { setPlaying(false); playingCallback.current(false); }}
      onError={() => { setPlayable(false); setPlaying(false); setError("音频无法播放，请更换文件。"); playingCallback.current(false); }} />
    <dialog ref={dialogRef} className="gift-dialog room-audio-dialog room3d-inspection" aria-labelledby="room-audio-title" onCancel={event => { event.preventDefault(); dismiss(); }}>
      <div className="gift-dialog-head"><h2 id="room-audio-title">CD 机</h2><button type="button" className="gift-close" disabled={busy} aria-label="关闭" onClick={dismiss}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button></div>
      {editable && <label className="gift-file room-audio-file">选择音乐或录音<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac" disabled={busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>}
      <p className="room-hint">{editable ? "不超过 20MB · 仅保存在此浏览器" : "仅在此浏览器播放已保存的音频"}</p>
      {busy && <p role="status" className="room-hint">正在处理…</p>}
      {!active && !busy && <p className="room-hint">暂无音频</p>}
      {active && <div className="room-audio-player">
        <p className="room-audio-name">{active.name}</p>
        <div className="room-audio-transport"><button type="button" disabled={!playable || busy} onClick={() => void toggle()} aria-pressed={playing}>{playing ? "暂停" : draft ? "试听" : "播放"}</button><span>{clock(position)}{duration > 0 ? ` / ${clock(duration)}` : ""}</span></div>
        <label className="room-audio-seek">播放进度<input type="range" min="0" max={duration || 1} step="0.1" value={Math.min(position, duration || 1)} disabled={!playable || !duration || busy} onChange={event => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value); }} /></label>
      </div>}
      {error && <p className="room-warning" role="alert">{error}</p>}
      {notice && <p className="gift-save-notice" role="status">{notice}</p>}
      {editable && <div className="gift-dialog-actions">
        {draft ? <><button type="button" disabled={busy} onClick={() => void save()}>保存</button><button type="button" disabled={busy} onClick={() => { setDraft(null); setNotice(""); setError(""); }}>放弃更改</button></> : saved && <button type="button" disabled={busy} onClick={() => void remove()}>移除音频</button>}
      </div>}
    </dialog>
  </>;
}
