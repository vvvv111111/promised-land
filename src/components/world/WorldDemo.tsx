"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { Game } from "phaser";
import type { WorldDemoScene } from "@/game/scenes/WorldDemoScene";
import { assetManifest, demoWorld } from "@/world/config";
import { RoomSession } from "@/world/RoomSession";
import { GiftStore } from "@/world/GiftStore";
import { openWinterGift, WINTER_GIFT_ID } from "@/world/WinterGift";
import demoGiftJson from "@/world/demo-gift.json";
import GiftContentDialog from "./GiftContentDialog";
import type { GiftConfig, GiftContent, GiftMode, RoomSnapshot } from "@/world/types";

const background = assetManifest.assets.find(a => a.asset_id === demoWorld.background_id)!;
const initial: RoomSnapshot = { selected: null, message: "", storage_warning: "" };

export interface WorldDemoHandle {
  onEditRequest: (objectId: string) => void;
}
interface WorldDemoProps {
  ref?: Ref<WorldDemoHandle>;
  onReady?: () => void;
  onError?: (message: string) => void;
  onItemCollected?: (itemId: string) => void;
  onObjectClicked?: (objectId: string) => void;
}

export default function WorldDemo({ ref, ...callbacks }: WorldDemoProps) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const giftStoreRef = useRef<GiftStore | null>(null);
  const [mode, setMode] = useState<GiftMode | null>(null);
  const [gift, setGift] = useState<GiftConfig | null>(null);
  const [activeContentId, setActiveContentId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState(initial);
  const [status, setStatus] = useState("正在加载房间…");
  const [ready, setReady] = useState(false);

  useImperativeHandle(ref, () => ({
    onEditRequest(objectId) {
      if (mode === "sender" && demoWorld.objects.some(o => o.object_id === objectId && o.content_type)) activate(objectId);
    },
  }), [ready, mode]);

  useEffect(() => {
    let cancelled = false;
    let game: Game | undefined;
    async function mountGame() {
      try {
        let storage: Storage | undefined;
        try { storage = window.localStorage; } catch { /* Session remains usable without storage. */ }
        const params = new URLSearchParams(window.location.search);
        const currentMode: GiftMode = params.get("mode") === "recipient" ? "recipient" : "sender";
        const requestedId = params.get("gift");
        const giftId = requestedId && /^[a-zA-Z0-9_-]{1,80}$/.test(requestedId) ? requestedId : demoGiftJson.gift_id;
        const store = giftId === WINTER_GIFT_ID
          ? openWinterGift(demoGiftJson as GiftConfig, demoWorld, currentMode, storage)
          : new GiftStore({ ...demoGiftJson, gift_id: giftId } as GiftConfig, demoWorld, currentMode, storage);
        const session = new RoomSession();
        const { createWorldGame } = await import("@/game/createWorldGame");
        if (cancelled || !containerRef.current) return;
        giftStoreRef.current = store;
        setMode(currentMode);
        setGift(store.read());
        setSnapshot({ ...session.snapshot(), storage_warning: store.warning });
        setReady(false);
        game = createWorldGame(containerRef.current, {
          world: demoWorld, manifest: assetManifest,
          onInteract: target => {
            const next = session.interact(target);
            next.storage_warning = store.warning || next.storage_warning;
            if (!cancelled) {
              setSnapshot(next);
              const object = target.kind === "object" ? demoWorld.objects.find(o => o.object_id === target.id) : undefined;
              if (object?.content_type && store.read().object_contents[target.id]?.kind === object.content_type) setActiveContentId(target.id);
              if (object) {
                callbacksRef.current.onObjectClicked?.(object.object_id);
                if (currentMode === "recipient" && object.type === "memory") callbacksRef.current.onItemCollected?.(object.object_id);
              }
            }
          },
          onReady: () => { if (!cancelled) { setStatus("房间已加载"); setReady(true); callbacksRef.current.onReady?.(); } },
          onError: () => {
            if (!cancelled) {
              const message = "房间加载失败，请刷新重试。";
              setStatus(message); setReady(false); callbacksRef.current.onError?.(message);
            }
          },
        });
        gameRef.current = game;
      } catch {
        if (!cancelled) {
          const message = "房间加载失败，请刷新重试。";
          setStatus(message); setReady(false); callbacksRef.current.onError?.(message);
        }
      }
    }
    void mountGame();
    return () => {
      cancelled = true;
      gameRef.current = null;
      giftStoreRef.current = null;
      game?.destroy(true);
    };
  }, []);

  function activate(id: string) {
    if (ready) (gameRef.current?.scene.getScene("WorldDemo") as WorldDemoScene | undefined)?.activate(id);
  }

  async function saveContent(content: GiftContent) {
    if (mode !== "sender" || !activeContentId || !giftStoreRef.current) throw new Error("当前无法保存此内容，请重新打开后重试。");
    setGift(await giftStoreRef.current.saveLocked(activeContentId, content));
  }

  const activeContent = activeContentId ? gift?.object_contents[activeContentId] : undefined;
  const activeAsset = demoWorld.objects.find(o => o.object_id === activeContentId)?.asset_id;
  const fallbackImage = assetManifest.assets.find(a => a.asset_id === activeAsset)?.path ?? "";

  return (
    <section className="room-demo" aria-label="房间">
      {mode === "sender" && <div className="room-placement">
        <a className="gift-mode-bar" href={`/world-demo?mode=recipient&gift=${encodeURIComponent(gift?.gift_id ?? demoGiftJson.gift_id)}`}>预览</a>
      </div>}
      <div className="world-canvas" style={{ aspectRatio: `${background.width} / ${background.height}` }} ref={containerRef} />
      <p className="canvas-status" role="status">{status}</p>
      <p className="room-feedback" role="status" aria-live="polite">{snapshot.message}</p>
      {snapshot.storage_warning && <p className="room-warning" role="alert">{snapshot.storage_warning}</p>}
      <details className="room-access">
        <summary>用按钮查看物品</summary>
        <div className="room-controls">
          {demoWorld.objects.filter(o => o.visible && o.clickable).map(o => <button type="button" disabled={!ready} key={o.object_id} onClick={() => activate(o.object_id)}>{o.interaction.title}</button>)}
          {demoWorld.hotspots.map(h => <button type="button" disabled={!ready} key={h.hotspot_id} onClick={() => activate(h.hotspot_id)}>{h.furniture_name}</button>)}
        </div>
      </details>
      {activeContentId && activeContent && mode && <GiftContentDialog
        key={`${gift?.gift_id}:${activeContentId}:${mode}`}
        mode={mode} content={activeContent} fallbackImage={fallbackImage}
        onSave={saveContent} onClose={() => setActiveContentId(null)}
      />}
    </section>
  );
}
