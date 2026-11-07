"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import GiftContentDialog from "@/components/world/GiftContentDialog";
import { openGift, WINTER_GIFT_ID, EXAMPLE_GIFT_ID } from "@/world/WinterGift";
import type { GiftStore } from "@/world/GiftStore";
import { demoWorld } from "@/world/config";
import demoGift from "@/world/demo-gift.json";
import type { GiftConfig, GiftContent, GiftMode } from "@/world/types";
import type { RoomView } from "@/room/rendering/createRoomView";
import RoomAudioDialog from "./RoomAudioDialog";
import type { RoomDefinition, RoomObjectId } from "@/room/types";

export interface RoomPreviewHandle { onEditRequest: (id: RoomObjectId) => void }
export interface RoomPreviewProps {
  definition?: RoomDefinition;
  giftId?: string;
  mode?: GiftMode;
  ref?: Ref<RoomPreviewHandle>;
  onReady?: () => void;
  onError?: () => void;
  onItemCollected?: (id: string) => void;
  onAudioPlaying?: (playing: boolean) => void;
  backgroundPlaying?: boolean;
}

export default function RoomPreview({ definition, giftId = WINTER_GIFT_ID, mode, ref, ...callbacks }: RoomPreviewProps) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<RoomView | null>(null);
  const storeRef = useRef<GiftStore | null>(null);
  const giftRef = useRef<GiftConfig | null>(null);
  const events = useRef(callbacks); events.current = callbacks;
  useImperativeHandle(ref, () => ({ onEditRequest: id => view.current?.activate(id) }), []);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [content, setContent] = useState<GiftContent | null>(null);
  const [lampOn, setLampOn] = useState(false);
  const [warning, setWarning] = useState("");
  const [audioOpen, setAudioOpen] = useState(false);
  const [editable, setEditable] = useState(false);
  const [focusedObject, setFocusedObject] = useState<RoomObjectId | null>(null);

  useEffect(() => {
    let cancelled = false;
    let current: RoomView | undefined;
    async function mount() {
      setStatus("loading"); setLampOn(false); setWarning("");
      const currentMode = giftId === EXAMPLE_GIFT_ID ? "recipient" : mode ?? (new URLSearchParams(window.location.search).get("mode") === "recipient" ? "recipient" : "sender");
      setEditable(currentMode === "sender");
      try {
        let storage: Storage | undefined;
        try { storage = window.localStorage; } catch { /* A preview still works with default contents. */ }
        const store = openGift(demoGift as GiftConfig, demoWorld, giftId, currentMode, storage);
        const gift = store.read(), photo = gift.object_contents["sunset-frame"];
        storeRef.current = store; giftRef.current = gift;
        const { createRoomView } = await import("@/room/rendering/createRoomView");
        if (cancelled || !container.current) return;
        current = createRoomView(container.current, {
          definition: definition ?? gift.room,
          photo: photo?.kind === "photo_frame" ? photo : undefined,
          onReady: () => { if (!cancelled) { setStatus("ready"); events.current.onReady?.(); } },
          onOpen: id => { setContent(giftRef.current?.object_contents[id] ?? null); if (currentMode === "recipient") events.current.onItemCollected?.(id); },
          onLamp: setLampOn,
          onAudioRequest: () => { setAudioOpen(true); if (currentMode === "recipient") events.current.onItemCollected?.("cd-player"); },
          onFocusChange: setFocusedObject,
          onError: () => { if (!cancelled) { setStatus("error"); events.current.onError?.(); } },
        });
        view.current = current; setWarning(store.warning);
      } catch {
        if (!cancelled) { setStatus("error"); events.current.onError?.(); }
      }
    }
    void mount();
    return () => { cancelled = true; view.current = null; storeRef.current = null; current?.dispose(); };
  }, [attempt, definition, giftId, mode]);

  async function saveContent(next: GiftContent) {
    const store = storeRef.current;
    if (!editable || !store) throw new Error("当前无法保存，请重新打开后重试。");
    const id = next.kind === "photo_frame" ? "sunset-frame" : "sealed-letter";
    const gift = await store.saveLocked(id, next);
    giftRef.current = gift; setContent(gift.object_contents[id]); setWarning("");
    if (next.kind === "photo_frame") view.current?.setPhoto(next);
  }

  const ready = status === "ready";
  function closeContent() { setContent(null); view.current?.clearFocus(); }
  function closeAudio() { setAudioOpen(false); view.current?.clearFocus(); }
  return (
    <section className="room3d" aria-label="3D 房间">
      <div className="room3d-stage" ref={container} aria-busy={status === "loading"}>
        {status === "loading" && <p className="room3d-message" role="status">正在加载房间…</p>}
        {status === "error" && <div className="room3d-message" role="alert">
          <p>3D 房间未能加载，请重试或使用支持 WebGL 2 的浏览器。</p>
          <button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button>
        </div>}
      </div>
      <div className="room3d-bar">
        <p>拖动旋转 · 双指或滚轮缩放</p>
        <div className="room3d-actions" aria-label="房间视角">
          <button type="button" disabled={!ready} onClick={() => view.current?.zoom(.88)}>放大</button>
          <button type="button" disabled={!ready} onClick={() => view.current?.zoom(1.14)}>缩小</button>
          <button type="button" disabled={!ready} onClick={() => view.current?.reset()}>复位视角</button>
          {focusedObject && <button type="button" disabled={!ready} onClick={() => view.current?.clearFocus()}>返回房间</button>}
        </div>
      </div>
      <div className="room3d-objects" aria-label="房间物品">
        <button type="button" disabled={!ready} aria-pressed={focusedObject === "sunset-frame"} onClick={() => view.current?.activate("sunset-frame")}>相框</button>
        <button type="button" disabled={!ready} aria-pressed={focusedObject === "sealed-letter"} onClick={() => view.current?.activate("sealed-letter")}>信件</button>
        <button type="button" disabled={!ready} aria-pressed={focusedObject === "cd-player"} onClick={() => view.current?.activate("cd-player")}>CD 机</button>
        <button type="button" disabled={!ready} aria-pressed={lampOn} onClick={() => view.current?.activate("lamp")}>{lampOn ? "关灯" : "开灯"}</button>
      </div>
      {warning && <p className="room3d-warning" role="alert">{warning}</p>}
      <RoomAudioDialog open={audioOpen} close={closeAudio} giftId={giftId} editable={editable} pauseRequested={callbacks.backgroundPlaying} onPlayingChange={playing => { view.current?.setAudioPlaying(playing); events.current.onAudioPlaying?.(playing); }} onBounds={bounds => view.current?.setPanelBounds(bounds)} />
      {content && <GiftContentDialog key={content.kind} mode={editable ? "sender" : "recipient"} content={content}
        fallbackImage="/assets/warm-room-v1/memory_frame_01.png"
        onSave={saveContent} onClose={closeContent} inspection onBounds={bounds => view.current?.setPanelBounds(bounds)} />}
    </section>
  );
}
