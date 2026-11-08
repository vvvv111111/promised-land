"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import GiftRoom from "./GiftRoom";
import GiftDetailsEditor from "./GiftDetailsEditor";
import GiftPackageButton from "./GiftPackageButton";
import Icon from "./GiftIcon";
import useGiftMusic from "./useGiftMusic";
import { draftFromGift, openGift, WINTER_GIFT_ID, EXAMPLE_GIFT_ID, giftMemories as memories, collectionKey, type GiftDraft } from "@/world/WinterGift";
import { demoWorld } from "@/world/config";
import demoGift from "@/world/demo-gift.json";
import type { GiftConfig } from "@/world/types";
import "./winter.css";
import "./gift-home.css";
import "@/app/room-3d/room-3d.css";

export type GiftStep = "home" | "edit" | "complete" | "open" | "room" | "story";
type Draft = GiftDraft;
const empty: Draft = { recipient: "", sender: "", memory: "", letter: "", photos: [] };

export default function GiftExperience({ step, giftId = WINTER_GIFT_ID }: { step: GiftStep; giftId?: string }) {
  const COLLECTION_KEY = collectionKey(giftId);
  const href = (target: GiftStep, id = giftId) => target === "home" ? "/" : `/gift/${target}${target === "room" || target === "edit" ? `?mode=${target === "room" ? "recipient" : "sender"}&gift=${encodeURIComponent(id)}` : id !== WINTER_GIFT_ID ? `?gift=${encodeURIComponent(id)}` : ""}`;
  const [draft, setDraft] = useState<Draft>(empty);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [collected, setCollected] = useState<string[]>([]);
  const [roomSaved, setRoomSaved] = useState(true);
  const [detailsSaved, setDetailsSaved] = useState(true);
  const canLeave = roomSaved && detailsSaved;
  function requireSaved(event: { preventDefault: () => void }) {
    if (canLeave) return;
    event.preventDefault();
    setNotice("请先保存或撤销房间与宠物的更改，并保存礼物信息，再继续。正在进行的任务请先等待完成或取消。");
  }
  const music = useGiftMusic();
  const recipient = ["open", "room", "story"].includes(step);
  useEffect(() => {
    try {
      const store = openGift(demoGift as GiftConfig, demoWorld, giftId, recipient ? "recipient" : "sender", localStorage);
      const gift = store.read();
      setDraft(!gift.details && !localStorage.getItem(store.storageKey) ? empty : draftFromGift(gift));
      setNotice(store.warning);
      const saved = JSON.parse(localStorage.getItem(COLLECTION_KEY) ?? "[]");
      setCollected(Array.isArray(saved) ? memories.filter(m => saved.includes(m.object_id)).map(m => m.object_id) : []);
    } catch { setNotice("保存记录无法读取，已显示默认内容。"); }
    setHydrated(true);
  }, [step, giftId, recipient, COLLECTION_KEY]);
  function collect(id: string) {
    setCollected(previous => {
      if (previous.includes(id)) return previous;
      const next = [...previous, id];
      try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(next)); } catch { setNotice("进度未保存，离开页面后可能丢失。"); }
      return next;
    });
  }
  const name = draft.recipient || "你";
  const sender = draft.sender || "赠送者";
  if (step === "home") return (
    <main className="gift-home">
      <div className="gift-home-title">
        <h1>应许之地</h1>
        <p lang="en">promised land</p>
      </div>
      <img className="gift-home-globe" src="/images/promised-land-globe.png" alt="透明水晶球里的小房间，有一把扶手椅和一只猫" width={1024} height={1024} fetchPriority="high" />
      <nav className="gift-home-actions" aria-label="礼物入口">
        <Link className="gift-home-create" href={href("edit")}>制作礼物</Link>
        <Link className="gift-home-example" href={href("open", EXAMPLE_GIFT_ID)}>打开示例</Link>
      </nav>
    </main>
  );

  return (
    <main className={`winter-app winter-${step}`}>
      <header className="winter-header">
        <a href="/" className="winter-brand"><span>应许之地<small lang="en">promised land</small></span></a>
        <nav aria-label="主导航">
          <button className="winter-music" aria-label={music.playing ? "暂停音乐" : "播放音乐"} aria-pressed={music.playing} onClick={music.toggle}>
            <Icon name={music.playing ? "pause" : "music"} size={18} />{music.playing ? "暂停音乐" : "播放音乐"}
          </button>
        </nav>
      </header>
      {notice && <div className="winter-notice" role="alert">{notice}<button aria-label="关闭提示" onClick={() => setNotice("")}><Icon name="close" size={16} /></button></div>}
      <div className="winter-content">
        {(step === "edit" || step === "room") && <section className="winter-room-layout">
          <div className="winter-room-heading">
            <div>{step === "edit" ? <a className="winter-back" href="/">返回首页</a> : <Link className="winter-back" href={href("open")}>返回水晶球</Link>}<h1>{step === "edit" ? "编辑礼物" : "查看礼物"}</h1><p className="winter-page-note">{step === "edit" ? "点击相框或信件编辑。" : "点击物品，查看照片和信件。"}</p></div>
            {step === "edit" && <div className="winter-room-actions"><Link className="winter-secondary" href={href("open")} aria-disabled={!canLeave} onNavigate={requireSaved}>预览</Link><Link className="winter-primary" href={href("complete")} aria-disabled={!canLeave} onNavigate={requireSaved}>完成</Link></div>}
          </div>
          <GiftRoom recipient={step === "room"} giftId={giftId} collected={collected} onCollect={collect} onSaveStateChange={setRoomSaved} onAudioPlaying={playing => { if (playing) music.stop(); }} backgroundPlaying={music.playing} />
          {step === "edit" && <GiftDetailsEditor giftId={giftId} onSaveStateChange={setDetailsSaved} />}
          {step === "room" && <div className="winter-story-action">{collected.length === 3 ? <Link className="winter-primary" href={href("story")}>查看回忆</Link> : <button className="winter-primary" disabled>再查看 {3 - collected.length} 件物品</button>}</div>}
        </section>}
        {step === "complete" && <section className="winter-complete-copy">
          <h1>礼物已完成</h1>
          <GiftPackageButton giftId={giftId} />
          <div className="winter-action-row"><Link className="winter-primary" href={href("open")}>预览礼物</Link><Link className="winter-text-link" href={href("edit")}>返回编辑</Link></div>
        </section>}
        {step === "open" && <section className="winter-open-copy">
          <h1>送给 {name}</h1>
          <p className="winter-signature">来自 {sender}</p>
          <img className="winter-open-globe" src="/images/promised-land-globe.png" alt="透明水晶球里的小房间" width={1024} height={1024} fetchPriority="high" />
          <Link className="winter-primary" href={href("room")}>打开水晶球</Link>
          {!draft.recipient && <small className="winter-demo-label">示例礼物</small>}
        </section>}
        {step === "story" && <section className="winter-story-wrap">
          {!hydrated ? <p role="status">读取中…</p> : collected.length < 3 ? <div className="winter-locked"><p>查看三件纪念物后，可打开回忆。</p><Link className="winter-primary" href={href("room")}>返回房间</Link></div> : <>
            <article className="winter-paper">
              <h1>回忆</h1>
              <p>{draft.memory || (!draft.recipient ? "这是一段示例回忆。" : "")}</p>
              {draft.photos.length > 0 && <div className="winter-story-photos">{draft.photos.map((p, i) => <img key={i} src={p} alt={`照片 ${i + 1}`} />)}</div>}
              <div className="winter-paper-divider" />
              <p className="winter-letter-text">{draft.letter || (!draft.recipient ? "这是一封示例信件。" : "暂无正文")}</p>
              <p className="winter-paper-sign">{sender}</p>
            </article>
            <Link className="winter-text-link" href={href("room")}>返回房间</Link>
          </>}
        </section>}
      </div>
    </main>
  );
}
