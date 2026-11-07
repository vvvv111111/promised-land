"use client";

import { useEffect, useRef, useState } from "react";
import GiftContentDialog from "@/components/world/GiftContentDialog";
import { openWinterGift, WINTER_GIFT_ID } from "@/world/WinterGift";
import { demoWorld } from "@/world/config";
import demoGift from "@/world/demo-gift.json";
import type { GiftConfig, GiftContent } from "@/world/types";
import type { RoomView } from "@/room/rendering/createRoomView";
import RoomAudioDialog from "./RoomAudioDialog";
import type { RoomObjectId } from "@/room/types";

export default function RoomPreview() {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<RoomView | null>(null);
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
      setEditable(new URLSearchParams(window.location.search).get("mode") !== "recipient");
      try {
        let storage: Storage | undefined;
        try { storage = window.localStorage; } catch { /* A preview still works with default contents. */ }
        const store = openWinterGift(demoGift as GiftConfig, demoWorld, "recipient", storage);
        const gift = store.read(), photo = gift.object_contents["sunset-frame"];
        const { createRoomView } = await import("@/room/rendering/createRoomView");
        if (cancelled || !container.current) return;
        current = createRoomView(container.current, {
          photo: photo?.kind === "photo_frame" ? photo : undefined,
          onReady: () => { if (!cancelled) setStatus("ready"); },
          onOpen: id => { setContent(gift.object_contents[id] ?? null); },
          onLamp: setLampOn,
          onAudioRequest: () => setAudioOpen(true),
          onFocusChange: setFocusedObject,
          onError: () => { if (!cancelled) setStatus("error"); },
        });
        view.current = current; setWarning(store.warning);
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    void mount();
    return () => { cancelled = true; view.current = null; current?.dispose(); };
  }, [attempt]);

  const ready = status === "ready";
  function closeContent() { setContent(null); view.current?.clearFocus(); }
  function closeAudio() { setAudioOpen(false); view.current?.clearFocus(); }
  return (
    <section className="room3d" aria-label="3D 房间样版">
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
      <RoomAudioDialog open={audioOpen} close={closeAudio} giftId={WINTER_GIFT_ID} editable={editable} onPlayingChange={playing => view.current?.setAudioPlaying(playing)} onBounds={bounds => view.current?.setPanelBounds(bounds)} />
      {content && <GiftContentDialog mode="recipient" content={content}
        fallbackImage="/assets/warm-room-v1/memory_frame_01.png"
        onSave={() => { throw new Error("样版仅支持查看。"); }} onClose={closeContent} inspection onBounds={bounds => view.current?.setPanelBounds(bounds)} />}
    </section>
  );
}
