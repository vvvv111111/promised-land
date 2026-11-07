"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GiftRoom from "./GiftRoom";
import Icon from "./GiftIcon";
import useGiftMusic from "./useGiftMusic";
import { prepareGiftPhoto } from "@/lib/media/photos";
import { draftFromGift, giftWithDraft, openGift, WINTER_GIFT_ID, EXAMPLE_GIFT_ID, giftMemories as memories, collectionKey, type GiftDraft } from "@/world/WinterGift";
import type { GiftStore } from "@/world/GiftStore";
import { selectedRoom } from "@/room/agent/persistence";
import { demoWorld } from "@/world/config";
import demoGift from "@/world/demo-gift.json";
import type { GiftConfig } from "@/world/types";
import "./winter.css";
import "./gift-home.css";
import "@/app/room-3d/room-3d.css";

export type GiftStep = "home" | "create" | "generating" | "edit" | "complete" | "open" | "room" | "story";
type Draft = GiftDraft;
const empty: Draft = { recipient: "", sender: "", memory: "", letter: "", photos: [] };

export default function GiftExperience({ step, giftId = WINTER_GIFT_ID }: { step: GiftStep; giftId?: string }) {
  const router = useRouter();
  const storeRef = useRef<GiftStore | null>(null);
  const savingSequence = useRef(0);
  const COLLECTION_KEY = collectionKey(giftId);
  const href = (target: GiftStep, id = giftId) => target === "home" ? "/" : `/gift/${target}${target === "room" || target === "edit" ? `?mode=${target === "room" ? "recipient" : "sender"}&gift=${encodeURIComponent(id)}` : id !== WINTER_GIFT_ID ? `?gift=${encodeURIComponent(id)}` : ""}`;
  const [draft, setDraft] = useState<Draft>(empty);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [collected, setCollected] = useState<string[]>([]);
  const [generation, setGeneration] = useState(0);
  const [roomSaved, setRoomSaved] = useState(true);
  const music = useGiftMusic();
  const recipient = ["open", "room", "story"].includes(step);
  useEffect(() => {
    try {
      const store = openGift(demoGift as GiftConfig, demoWorld, giftId, recipient ? "recipient" : "sender", localStorage);
      storeRef.current = store;
      const gift = store.read();
      setDraft(!gift.details && !localStorage.getItem(store.storageKey) ? empty : draftFromGift(gift));
      setSaved(!store.warning);
      setNotice(store.warning);
      const saved = JSON.parse(localStorage.getItem(COLLECTION_KEY) ?? "[]");
      setCollected(Array.isArray(saved) ? memories.filter(m => saved.includes(m.object_id)).map(m => m.object_id) : []);
    } catch { setSaved(false); setNotice("保存记录无法读取，已显示默认内容。"); }
    setHydrated(true);
  }, [step, giftId, recipient, COLLECTION_KEY]);
  useEffect(() => {
    if (step !== "generating") return;
    setGeneration(0);
    const timer = setInterval(() => setGeneration(n => Math.min(3, n + 1)), 1700);
    return () => clearInterval(timer);
  }, [step]);
  function save(next: Draft) {
    setDraft(next);
    const sequence = ++savingSequence.current, store = storeRef.current;
    setSaved(false);
    if (!store) { setNotice("当前无法保存，请刷新后重试。"); return; }
    void store.saveGiftLocked(giftWithDraft(store.read(), next)).then(() => {
      if (sequence === savingSequence.current) { setSaved(true); setNotice(""); }
    }).catch(error => {
      if (sequence === savingSequence.current) { setSaved(false); setNotice(error instanceof Error ? error.message : "保存失败。输入已暂留，请检查浏览器存储或减少照片大小后重试。"); }
    });
  }
  function collect(id: string) {
    setCollected(previous => {
      if (previous.includes(id)) return previous;
      const next = [...previous, id];
      try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(next)); } catch { setNotice("进度未保存，离开页面后可能丢失。"); }
      return next;
    });
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (draft.photos.length + files.length > 3) { setPhotoError("最多选择 3 张照片。"); return; }
    setUploading(true);
    try { const photos = await Promise.all(Array.from(files).map(prepareGiftPhoto)); save({ ...draft, photos: [...draft.photos, ...photos] }); setPhotoError(""); }
    catch (error) { setPhotoError(error instanceof Error ? error.message : "照片无法处理，请重新选择。"); }
    finally { setUploading(false); }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.recipient.trim() || !draft.memory.trim() || !draft.letter.trim()) { setNotice("请填写对方昵称、共同回忆和信件。"); return; }
    if (!draft.photos.length) { setPhotoError("请至少选择一张照片。"); document.getElementById("photos")?.focus(); return; }
    try {
      const store = storeRef.current;
      if (!store) throw new Error("当前无法保存，请刷新后重试。");
      const next = giftWithDraft(store.read(), draft);
      next.room ??= selectedRoom(localStorage);
      await store.saveGiftLocked(next);
      setSaved(true);
      localStorage.removeItem(COLLECTION_KEY); setCollected([]);
      router.push(href("generating"));
    } catch (error) { setSaved(false); setNotice(error instanceof Error ? error.message : "保存失败。输入已暂留，请检查浏览器存储或减少照片大小后重试。"); }
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
        <Link className="gift-home-create" href={href("create")}>制作礼物</Link>
        <Link className="gift-home-example" href={href("open", EXAMPLE_GIFT_ID)}>打开示例</Link>
      </nav>
    </main>
  );

  return (
    <main className={`winter-app winter-${step}`}>
      <header className="winter-header">
        <Link href="/" className="winter-brand"><span>应许之地<small lang="en">promised land</small></span></Link>
        <nav aria-label="主导航">
          <button className="winter-music" aria-label={music.playing ? "暂停音乐" : "播放音乐"} aria-pressed={music.playing} onClick={music.toggle}>
            <Icon name={music.playing ? "pause" : "music"} size={18} />{music.playing ? "暂停音乐" : "播放音乐"}
          </button>
        </nav>
      </header>
      {notice && <div className="winter-notice" role="alert">{notice}<button aria-label="关闭提示" onClick={() => setNotice("")}><Icon name="close" size={16} /></button></div>}
      <div className="winter-content">
        {step === "create" && <section className="winter-create-layout">
          <Link className="winter-back" href="/">返回首页</Link>
          <h1>制作礼物</h1>
          <p className="winter-page-note">照片和文字仅保存在此浏览器。</p>
          <form className="winter-form" onSubmit={create}>
            <fieldset disabled={!hydrated || uploading}>
              <legend className="winter-sr-only">礼物内容</legend>
              <div className="winter-field-heading"><label htmlFor="photos">照片</label><span>{draft.photos.length} / 3</span></div>
              <div className="winter-photo-row">
                {draft.photos.map((photo, i) => <div className="winter-photo" key={photo.slice(-40) + i}>
                  <img src={photo} alt={`照片 ${i + 1}`} />
                  <button type="button" aria-label={`删除照片 ${i + 1}`} onClick={() => save({ ...draft, photos: draft.photos.filter((_, j) => j !== i) })}><Icon name="close" size={16} /></button>
                  {i === 0 && <small>相框照片</small>}
                </div>)}
                {draft.photos.length < 3 && <label className="winter-upload" htmlFor="photos"><Icon name="plus" size={22} /><span>{uploading ? "正在处理照片…" : "选择照片"}</span></label>}
              </div>
              <input id="photos" aria-describedby="photo-help photo-error" aria-invalid={!!photoError} className="winter-sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { void upload(e.target.files); e.target.value = ""; }} />
              <p id="photo-error" className="winter-photo-error" role="alert">{photoError}</p>
              <p id="photo-help" className="winter-help">1–3 张 · JPG / PNG / WebP · 每张不超过 12MB<br />第一张用于相框，其余显示在回忆中。</p>
              <div className="winter-field-pair">
                <label>送给谁<input required maxLength={20} value={draft.recipient} placeholder="对方的昵称" onChange={e => save({ ...draft, recipient: e.target.value })} /></label>
                <label>你的名字（选填）<input maxLength={20} value={draft.sender} placeholder="你的名字" onChange={e => save({ ...draft, sender: e.target.value })} /></label>
              </div>
              <label>共同的回忆<textarea required maxLength={2000} rows={3} placeholder="写下一段共同的回忆" value={draft.memory} onChange={e => save({ ...draft, memory: e.target.value })} /></label>
              <label>写给对方的话<textarea required maxLength={4000} rows={4} placeholder="写下想说的话" value={draft.letter} onChange={e => save({ ...draft, letter: e.target.value })} /></label>
              <div className="winter-form-actions"><span role="status">{hydrated ? saved ? "已保存" : "未保存" : "读取中…"}{!saved && <button type="button" className="winter-retry" onClick={() => save(draft)}>重试保存</button>}</span><button className="winter-primary" type="submit">下一步</button></div>
            </fieldset>
          </form>
        </section>}
        {step === "generating" && <section className="winter-generation">
          <h1>{generation === 3 ? "准备好了" : "正在准备"}</h1>
          <p className="winter-page-note">当前为演示，未使用 AI 生成。</p>
          <p className="winter-sr-only" role="status">{generation === 3 ? "准备好了" : `正在${["整理内容", "准备房间", "放入照片和信件"][generation]}`}</p>
          <ol>{["整理内容", "准备房间", "放入照片和信件"].map((text, i) => <li className={generation > i ? "done" : generation === i ? "active" : ""} key={text}><span>{generation > i ? <Icon name="check" size={16} /> : i + 1}</span>{text}<small>{generation > i ? "已完成" : generation === i ? "进行中" : "等待中"}</small></li>)}</ol>
          <div className="winter-action-row">
            <Link className={`winter-primary ${generation < 3 ? "is-disabled" : ""}`} aria-disabled={generation < 3} tabIndex={generation < 3 ? -1 : 0} onClick={e => { if (generation < 3) e.preventDefault(); }} href={href("edit")}>进入编辑</Link>
            <Link className="winter-text-link" href={href("create")}>返回修改</Link>
          </div>
        </section>}
        {(step === "edit" || step === "room") && <section className="winter-room-layout">
          <div className="winter-room-heading">
            <div><Link className="winter-back" href={step === "edit" ? href("create") : href("open")}>{step === "edit" ? "修改内容" : "返回水晶球"}</Link><h1>{step === "edit" ? "编辑礼物" : "查看礼物"}</h1><p className="winter-page-note">{step === "edit" ? "点击相框或信件编辑。" : "点击物品，查看照片和信件。"}</p></div>
            {step === "edit" && <div className="winter-room-actions"><Link className="winter-secondary" href={href("open")} aria-disabled={!roomSaved} onClick={e => { if (!roomSaved) e.preventDefault(); }}>预览</Link><Link className="winter-primary" href={href("complete")} aria-disabled={!roomSaved} onClick={e => { if (!roomSaved) e.preventDefault(); }}>完成</Link></div>}
          </div>
          <GiftRoom recipient={step === "room"} giftId={giftId} collected={collected} onCollect={collect} onSaveStateChange={setRoomSaved} onAudioPlaying={playing => { if (playing) music.stop(); }} backgroundPlaying={music.playing} />
          {step === "room" && <div className="winter-story-action">{collected.length === 3 ? <Link className="winter-primary" href={href("story")}>查看回忆</Link> : <button className="winter-primary" disabled>再查看 {3 - collected.length} 件物品</button>}</div>}
        </section>}
        {step === "complete" && <section className="winter-complete-copy">
          <h1>礼物已完成</h1>
          <section className="winter-share" aria-labelledby="share-title">
            <h2 id="share-title">分享链接</h2>
            <div className="winter-share-placeholder"><span id="share-status">分享功能尚未开放</span><button type="button" className="winter-secondary" disabled aria-describedby="share-status">复制链接</button></div>
          </section>
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
