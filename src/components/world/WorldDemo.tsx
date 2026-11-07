"use client";

import { useEffect, useRef, useState } from "react";
import type { Game } from "phaser";
import type { WorldDemoScene } from "@/game/scenes/WorldDemoScene";
import { assetManifest, demoWorld } from "@/world/config";
import { RoomSession } from "@/world/RoomSession";
import { RoomLayout } from "@/world/RoomLayout";
import { GiftStore } from "@/world/GiftStore";
import demoGiftJson from "@/world/demo-gift.json";
import Album from "./Album";
import GiftContentDialog from "./GiftContentDialog";
import type { GiftConfig, GiftContent, GiftMode, RoomSnapshot } from "@/world/types";

const background = assetManifest.assets.find(a => a.asset_id === demoWorld.background_id)!;
const initial: RoomSnapshot = { selected: null, message: "正在打开你的房间…", storage_warning: "" };

export default function WorldDemo() {
  const experienceRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const layoutRef = useRef<RoomLayout | null>(null);
  const giftStoreRef = useRef<GiftStore | null>(null);
  const [mode, setMode] = useState<GiftMode | null>(null);
  const [gift, setGift] = useState<GiftConfig | null>(null);
  const [activeContentId, setActiveContentId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState(initial);
  const [status, setStatus] = useState("正在加载房间素材…");
  const [ready, setReady] = useState(false);
  const [album, setAlbum] = useState(false);
  const [ambient, setAmbient] = useState(true);
  useEffect(() => setAmbient(!window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);

  const scene = () => ready ? gameRef.current?.scene.getScene("WorldDemo") as WorldDemoScene | undefined : undefined;

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await experienceRef.current?.requestFullscreen();
    } catch {
      setSnapshot(previous => ({ ...previous, message: "当前浏览器不支持全屏，可使用放大按钮观察细节。" }));
    }
  }

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
        const store = new GiftStore({ ...demoGiftJson, gift_id: giftId } as GiftConfig, demoWorld, currentMode, storage);
        const session = new RoomSession();
        const layout = new RoomLayout(demoWorld, storage);
        const { createWorldGame } = await import("@/game/createWorldGame");
        if (cancelled || !containerRef.current) return;
        giftStoreRef.current = store;
        setMode(currentMode);
        setGift(store.read());
        setSnapshot({ ...session.snapshot(), storage_warning: store.warning || session.snapshot().storage_warning });
        layoutRef.current = layout;
        setReady(false);
        game = createWorldGame(containerRef.current, {
          world: demoWorld, manifest: assetManifest,
          positions: layout.positions(),
          allowDrag: currentMode === "sender",
          onMove: (id, position) => {
            if (currentMode !== "sender") return;
            layout.move(id, position);
            if (!cancelled) setSnapshot(previous => ({ ...previous, message: layout.warning ? "位置已调整。" : "位置已调整并保存。", storage_warning: layout.warning || previous.storage_warning }));
          },
          onInteract: target => {
            const next = session.interact(target);
            next.storage_warning = store.warning || next.storage_warning;
            if (!cancelled) {
              setSnapshot(next);
              const object = target.kind === "object" ? demoWorld.objects.find(o => o.object_id === target.id) : undefined;
              if (object?.content_type && store.read().object_contents[target.id]?.kind === object.content_type) setActiveContentId(target.id);
            }
          },
          onReady: () => { if (!cancelled) { setStatus("房间已就绪，点击物件探索。"); setReady(true); } },
          onError: message => { if (!cancelled) { setStatus(message); setReady(false); } },
        });
        gameRef.current = game;
      } catch {
        if (!cancelled) setStatus("房间加载失败，请检查素材配置并刷新重试。");
      }
    }
    void mountGame();
    return () => {
      cancelled = true;
      gameRef.current = null;
      layoutRef.current = null;
      giftStoreRef.current = null;
      game?.destroy(true);
    };
  }, []);

  function activate(id: string) {
    if (ready) (gameRef.current?.scene.getScene("WorldDemo") as WorldDemoScene | undefined)?.activate(id);
  }

  function resetPositions() {
    if (!ready || mode !== "sender") return;
    layoutRef.current?.reset();
    (gameRef.current?.scene.getScene("WorldDemo") as WorldDemoScene | undefined)?.resetPositions();
    setSnapshot(previous => ({ ...previous, message: "已恢复默认摆放。", storage_warning: layoutRef.current?.warning || previous.storage_warning }));
  }

  function saveContent(content: GiftContent) {
    if (mode !== "sender" || !activeContentId || !giftStoreRef.current) throw new Error("当前模式不能编辑礼物。");
    setGift(giftStoreRef.current.save(activeContentId, content));
  }

  const activeContent = activeContentId ? gift?.object_contents[activeContentId] : undefined;
  const activeAsset = demoWorld.objects.find(o => o.object_id === activeContentId)?.asset_id;
  const fallbackImage = assetManifest.assets.find(a => a.asset_id === activeAsset)?.path ?? "";

  return (
    <section className="room-demo room-experience" ref={experienceRef} aria-label="2.5D 私人房间">
      <div className="room-toolbar">
        <span>午后小屋 · 你的应许之地</span>
      </div>
      {mode && <div className="gift-mode-bar">
        <span>{mode === "sender" ? "赠送者模式" : "收礼者模式 · 只读浏览"}</span>
        {mode === "sender" && <a href={`/world-demo?mode=recipient&gift=${encodeURIComponent(gift?.gift_id ?? demoGiftJson.gift_id)}`}>预览收礼者模式</a>}
      </div>}
      <div className="room-placement">
        <span>{mode === "recipient" ? "轻点相框查看照片，轻点信件展开阅读。" : "按住物品拖动调整位置；轻点相框或信件打开专属内容。"}</span>
        {mode === "sender" && <button type="button" disabled={!ready} onClick={resetPositions}>恢复默认摆放</button>}
      </div>
      <div className="room-stage">
        <div className="world-canvas" style={{ aspectRatio: `${background.width} / ${background.height}` }} ref={containerRef} />
        <div className="room-vignette" aria-hidden="true" />
      </div>
      <div className="room-tools" aria-label="房间镜头控制">
        <button type="button" aria-label="放大房间" disabled={!ready} onClick={() => scene()?.changeZoom(0.15)}>＋</button>
        <button type="button" aria-label="缩小房间" disabled={!ready} onClick={() => scene()?.changeZoom(-0.15)}>－</button>
        <button type="button" disabled={!ready} onClick={() => scene()?.resetCamera()}>复位视角</button>
        <button type="button" onClick={() => void toggleFullscreen()}>沉浸全屏</button>
        <label><input type="checkbox" checked={ambient} disabled={!ready} onChange={e => {
          setAmbient(e.target.checked);
          scene()?.setAtmosphere(e.target.checked);
        }} />微光尘埃</label>
        {mode === "sender" && <>
          <button type="button" onClick={() => setAlbum(true)}>打开我的相册</button>
          <label><input type="checkbox" disabled={!ready} onChange={e => scene()?.setPlacementGuides(e.target.checked)} />显示承载区域</label>
        </>}
      </div>
      {album && mode === "sender" && <Album close={() => setAlbum(false)} />}
      <p className="canvas-status" role="status">{status}</p>
      <div className="room-details">
        <div className="room-panel" aria-label="物品介绍">
          <p className="room-kicker">房间里的故事</p>
          <h2>{snapshot.selected?.interaction.title ?? "欢迎来到你的应许之地"}</h2>
          <p>{snapshot.selected?.interaction.description ?? "点击房间里的物件，看看它们的故事。相框里藏着照片，信封里留着写给你的话。"}</p>
          <p className="room-feedback" role="status" aria-live="polite">{snapshot.message}</p>
          {snapshot.storage_warning && <p className="room-warning" role="alert">{snapshot.storage_warning}</p>}
        </div>
      </div>
      <details className="room-access">
        <summary>也可以用按钮探索房间</summary>
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
