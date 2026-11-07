"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WorldDemo, { type WorldDemoHandle } from "@/components/world/WorldDemo";
import { draftFromGift, giftWithDraft, openWinterGift, WINTER_GIFT_ID, type GiftDraft } from "@/world/WinterGift";
import { demoWorld } from "@/world/config";
import demoGift from "@/world/demo-gift.json";
import type { GiftConfig } from "@/world/types";
import "./winter.css";

export type GiftStep = "home" | "create" | "generating" | "edit" | "complete" | "open" | "room" | "story";
type Draft = GiftDraft;
const empty: Draft = { recipient: "", sender: "", memory: "", letter: "", photos: [] };
const COLLECTION_KEY = "promised-land:winter:collection:v1";
const GIFT_ID = WINTER_GIFT_ID;
const memories = demoWorld.objects.filter(o => o.type === "memory");
const href = (step: GiftStep) => step === "home" ? "/" : `/gift/${step}${step === "room" ? "?mode=recipient&gift=" + GIFT_ID : step === "edit" ? "?mode=sender&gift=" + GIFT_ID : ""}`;

function Icon({ name, size = 20 }: { name: "arrow" | "music" | "pause" | "snow" | "plus" | "close" | "check" | "back" | "copy"; size?: number }) {
  const paths = { arrow: "M4 12h16m-6-6 6 6-6 6", back: "M20 12H4m6-6-6 6 6 6", music: "M9 18V5l11-2v13M9 8l11-2M9 18c0 2-5 3-5 0s5-3 5 0Zm11-2c0 2-5 3-5 0s5-3 5 0Z", pause: "M9 5v14M15 5v14", snow: "M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M8 4l4 3 4-3M8 20l4-3 4 3", plus: "M12 5v14M5 12h14", close: "m6 6 12 12M6 18 18 6", check: "m5 12 4 4L19 6", copy: "M8 8h12v13H8zM16 8V3H3v13h5" };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function Snow() {
  return <div className="winter-snow" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ left: `${(i * 37 + 11) % 100}%`, "--drift": `${(i % 5 - 2) * 25}px`, "--duration": `${16 + i % 13}s`, "--delay": `${-i * 1.8}s`, width: `${i % 3 + 1}px`, height: `${i % 3 + 1}px` } as CSSProperties} />)}</div>;
}

function useMusic() {
  const context = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const starting = useRef(false);
  const alive = useRef(true);
  const [playing, setPlaying] = useState(false);
  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; void context.current?.close(); context.current = null; setPlaying(false); };
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (timer.current) clearInterval(timer.current); void context.current?.close(); }; }, []);
  async function toggle() {
    if (starting.current) return;
    if (playing) { stop(); return; }
    starting.current = true;
    try {
      const ctx = new AudioContext(); context.current = ctx;
      await ctx.resume();
      if (!alive.current) { await ctx.close(); return; }
      const schedule = () => {
        [0, 7, 12, 11, 7, 4, 2, 7, 4, 0, 2, -5].forEach((note, i) => {
          const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
          const start = ctx.currentTime + i * 0.85;
          oscillator.type = "sine"; oscillator.frequency.value = 523.25 * 2 ** (note / 12);
          gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.045, start + .015); gain.gain.exponentialRampToValueAtTime(.0001, start + 2.2);
          oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(start); oscillator.stop(start + 2.3);
        });
      };
      schedule(); timer.current = setInterval(schedule, 10200); setPlaying(true);
    } catch { stop(); }
    finally { starting.current = false; }
  }
  return { playing, toggle };
}

async function readPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 照片。");
  if (file.size > 12 * 1024 * 1024) throw new Error("照片超过 12MB，请换一张小一些的照片。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const ratio = Math.min(1, 900 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", .78);
  } finally { URL.revokeObjectURL(url); }
}

function RoomBridge({ recipient, collected, onCollect }: { recipient: boolean; collected: string[]; onCollect: (id: string) => void }) {
  const roomRef = useRef<WorldDemoHandle>(null);
  const [ready, setReady] = useState(false);
  function activate(objectId: string) {
    roomRef.current?.onEditRequest(objectId);
  }
  return <>
    {!recipient && <div className="winter-edit-tools"><button disabled={!ready} className="winter-secondary" onClick={() => activate("sunset-frame")}>编辑相框</button><button disabled={!ready} className="winter-secondary" onClick={() => activate("sealed-letter")}>编辑信件</button><span>按住房间物品拖动，调整它的位置</span></div>}
    <div className="winter-room"><WorldDemo ref={roomRef} onReady={() => setReady(true)} onError={() => setReady(false)} onItemCollected={id => { if (recipient) onCollect(id); }} /></div>
    {recipient && <section className="winter-collection" aria-label="纪念物品收集进度"><div><h2>把回忆，一件件拾起</h2><p>在房间中轻点三件纪念物，集齐后展开我们的完整故事。</p></div><div className="winter-keepsakes">{memories.map((m, i) => <div key={m.object_id} className={collected.includes(m.object_id) ? "found" : ""}><span>{collected.includes(m.object_id) ? <Icon name="check" size={17} /> : i + 1}</span>{m.interaction.title}</div>)}</div><p role="status">已发现 {collected.length} / 3 件纪念物</p></section>}
  </>;
}

export default function GiftExperience({ step }: { step: GiftStep }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(empty);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [collected, setCollected] = useState<string[]>([]);
  const [generation, setGeneration] = useState(0);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const music = useMusic();
  const recipient = ["open", "room", "story"].includes(step);
  const scenic = ["home", "open", "complete", "generating"].includes(step);
  useEffect(() => {
    try {
      const store = openWinterGift(demoGift as GiftConfig, demoWorld, "recipient", localStorage);
      const gift = store.read();
      setDraft(!gift.details && !localStorage.getItem(store.storageKey) ? empty : draftFromGift(gift));
      setSaved(!store.warning);
      setNotice(store.warning);
      const saved = JSON.parse(localStorage.getItem(COLLECTION_KEY) ?? "[]");
      if (Array.isArray(saved)) setCollected(memories.filter(m => saved.includes(m.object_id)).map(m => m.object_id));
    } catch { setSaved(false); setNotice("浏览器记录无法读取；你仍可体验示例礼物。请允许本地存储后重试。"); }
    setOrigin(window.location.origin); setHydrated(true);
  }, [step]);
  useEffect(() => {
    if (step !== "generating") return;
    setGeneration(0);
    const timer = setInterval(() => setGeneration(n => Math.min(3, n + 1)), 1700);
    return () => clearInterval(timer);
  }, [step]);
  function save(next: Draft) {
    setDraft(next);
    try {
      const store = openWinterGift(demoGift as GiftConfig, demoWorld, "sender", localStorage);
      store.saveGift(giftWithDraft(store.read(), next));
      setSaved(true); setNotice("");
    }
    catch { setSaved(false); setNotice("本地保存失败，当前输入暂保留在页面中。请减少照片大小，或允许浏览器存储后重试。"); }
  }
  function collect(id: string) {
    setCollected(previous => {
      if (previous.includes(id)) return previous;
      const next = [...previous, id];
      try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(next)); } catch { setNotice("收集进度仅保留至离开当前页面。请允许浏览器存储后重试。"); }
      return next;
    });
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (draft.photos.length + files.length > 3) { setPhotoError("最多放入 3 张照片，请先移除一张再试。"); return; }
    setUploading(true);
    try { const photos = await Promise.all(Array.from(files).map(readPhoto)); save({ ...draft, photos: [...draft.photos, ...photos] }); setPhotoError(""); }
    catch (error) { setPhotoError(error instanceof Error ? error.message : "照片读取失败，请重新选择。"); }
    finally { setUploading(false); }
  }
  function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.recipient.trim() || !draft.memory.trim() || !draft.letter.trim()) { setNotice("请填写昵称、共同回忆和想说的话，空格不能代替心意。"); return; }
    if (!draft.photos.length) { setPhotoError("请放入至少 1 张照片，让这份礼物带上你们的回忆。"); document.getElementById("photos")?.focus(); return; }
    try {
      const store = openWinterGift(demoGift as GiftConfig, demoWorld, "sender", localStorage);
      store.saveGift(giftWithDraft(store.read(), draft));
      setSaved(true);
      localStorage.removeItem(COLLECTION_KEY); setCollected([]);
      router.push(href("generating"));
    } catch (error) { setSaved(false); setNotice(error instanceof Error ? error.message : "保存失败，请允许本地存储后重试。"); }
  }
  const name = draft.recipient || "亲爱的你";
  const sender = draft.sender || "一直惦念你的人";
  const link = `${origin}${href("open")}`;
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setNotice("未能自动复制，请选中下方链接手动复制。"); }
  }
  return <main className={`winter-app winter-${step}${scenic ? " winter-scenic" : ""}`}>
    {scenic && <img className="winter-landscape" src="/images/winter-globe.png" alt="透明水晶球里，覆雪的小屋亮着温暖灯光，远方是深蓝雪林" fetchPriority="high" />}
    <div className="winter-shade" aria-hidden="true" /><Snow />
    <header className="winter-header"><Link href="/" className="winter-brand"><Icon name="snow" size={26} /><span>应许之地<small>PROMISED LAND</small></span></Link><nav aria-label="主导航">{step === "home" ? <><Link href={href("open")}>体验一份礼物</Link><Link href={href("create")} className="winter-nav-create">开始创造 <Icon name="arrow" size={15} /></Link></> : <Link href={recipient ? href("open") : href("create")}>{recipient ? "一份只属于你的礼物" : "我的冬日礼物"}</Link>}<button className={`winter-music ${music.playing ? "is-playing" : ""}`} aria-label={music.playing ? "暂停音乐" : "播放音乐"} aria-pressed={music.playing} title="本地合成音乐盒旋律" onClick={music.toggle}><Icon name={music.playing ? "pause" : "music"} /><span>{music.playing ? "音乐开启" : "音乐关闭"}</span></button></nav></header>
    {notice && <div className="winter-notice" role="alert">{notice}<button aria-label="关闭提示" onClick={() => setNotice("")}><Icon name="close" size={16} /></button></div>}
    <div key={step} className="winter-content">
      {step === "home" && <><section className="winter-home-copy"><h1>把我们的回忆，<br />藏进一场<span>不会融化的雪。</span></h1><p>一颗音乐水晶球，一间属于你们的小屋。<br />把想念和那些闪闪发光的日子，送给重要的人。</p><Link className="winter-primary" href={href("create")}>创造一份礼物 <Icon name="arrow" /></Link><Link className="winter-text-link" href={href("open")}>先看看，礼物是什么模样 <span>↗</span></Link></section><div className="winter-globe-caption"><span className="winter-light-dot" />小小世界，正在为某个人亮着灯</div><div className="winter-home-bottom"><span>有些心意，值得拥有一个小世界。</span><span>照片 · 音乐 · 共同回忆</span></div></>}
      {step === "create" && <section className="winter-create-layout"><aside><Link className="winter-back" href="/"><Icon name="back" size={16} /> 回到雪夜</Link><h1>为一个人，<br />留一盏灯。</h1><p>从一张照片、一段回忆开始。<br />剩下的，交给这个小小世界。</p><div className="winter-mini-globe"><img src="/images/winter-globe.png" alt="雪夜中的音乐水晶球" /></div><p className="winter-local-note">草稿仅保存在此浏览器。<br />现在是本地体验版，不会上传你的照片。</p></aside><form className="winter-form" onSubmit={create}><div className="winter-form-heading"><h2>创造你们的礼物</h2><span>第一步 / 共三步</span></div><fieldset disabled={!hydrated || uploading}><legend className="winter-sr-only">礼物内容</legend><div className="winter-field-heading"><label htmlFor="photos">把回忆放进来</label><span>{draft.photos.length} / 3 张</span></div><div className="winter-photo-row">{draft.photos.map((photo, i) => <div className="winter-photo" key={photo.slice(-40) + i}><img src={photo} alt={`共同回忆照片 ${i + 1}`} /><button type="button" aria-label={`删除照片 ${i + 1}`} onClick={() => save({ ...draft, photos: draft.photos.filter((_, j) => j !== i) })}><Icon name="close" size={16} /></button>{i === 0 && <small>房间相框</small>}</div>)}{draft.photos.length < 3 && <label className="winter-upload" htmlFor="photos"><Icon name="plus" size={25} /><span>{uploading ? "正在准备照片…" : "选择照片"}</span><small>JPG / PNG / WebP · 单张 ≤12MB</small></label>}</div><input id="photos" aria-describedby="photo-help photo-error" aria-invalid={!!photoError} className="winter-sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { void upload(e.target.files); e.target.value = ""; }} /><p id="photo-error" className="winter-photo-error" role="alert">{photoError}</p><p id="photo-help" className="winter-help">照片仅在此浏览器处理与保存，不会上传。支持 JPG / PNG / WebP，单张 ≤12MB。第一张放进相框，其余收进最终故事。</p><div className="winter-field-pair"><label>送给谁<input required maxLength={20} value={draft.recipient} placeholder="对方的昵称" onChange={e => save({ ...draft, recipient: e.target.value })} /></label><label>你是谁<input maxLength={20} value={draft.sender} placeholder="你的昵称（选填）" onChange={e => save({ ...draft, sender: e.target.value })} /></label></div><label>一段共同的回忆<textarea required maxLength={2000} rows={3} placeholder="比如，那个一起等初雪的晚上……" value={draft.memory} onChange={e => save({ ...draft, memory: e.target.value })} /><small>小到一顿晚餐，也可以是很珍贵的事。</small></label><label>想对 TA 说的话<textarea required maxLength={4000} rows={3} placeholder="有些话，想在这个小世界里慢慢说给你听。" value={draft.letter} onChange={e => save({ ...draft, letter: e.target.value })} /></label><div className="winter-form-actions"><span role="status">本地草稿 · {hydrated ? saved ? "已保留输入" : "尚未保存" : "读取中"}{!saved && <button type="button" className="winter-retry" onClick={() => save(draft)}>重试保存</button>}</span><button className="winter-primary" type="submit">下一步 <Icon name="arrow" /></button></div></fieldset></form></section>}
      {step === "generating" && <section className="winter-generation"><h1>{generation === 3 ? "小世界，准备好了。" : "让回忆，慢慢落成一个家。"}</h1><p>这是模拟创造过程，未调用真实 AI 或 Agent。</p><p className="winter-sr-only" role="status">{generation === 3 ? "小世界已准备完成，可以进入编辑。" : `正在${["理解共同回忆", "设计专属小世界", "准备纪念物品和故事"][generation]}`}</p><ol>{["理解共同回忆", "设计专属小世界", "准备纪念物品和故事"].map((text, i) => <li className={generation > i ? "done" : generation === i ? "active" : ""} key={text}><span>{generation > i ? <Icon name="check" size={16} /> : i + 1}</span>{text}<small>{generation > i ? "已准备" : generation === i ? "正在准备" : "等待中"}</small></li>)}</ol><p className="winter-help">本次使用现有暖调小屋与三件示例纪念物。</p><Link className={`winter-primary ${generation < 3 ? "is-disabled" : ""}`} aria-disabled={generation < 3} tabIndex={generation < 3 ? -1 : 0} onClick={e => { if (generation < 3) e.preventDefault(); }} href={href("edit")}>进入编辑 <Icon name="arrow" /></Link><Link className="winter-text-link" href={href("create")}>返回修改回忆</Link></section>}
      {(step === "edit" || step === "room") && <section className="winter-room-layout"><div className="winter-room-heading"><div><Link className="winter-back" href={step === "edit" ? href("create") : href("open")}><Icon name="back" size={16} />{step === "edit" ? "修改礼物内容" : "回到水晶球"}</Link><h1>{step === "edit" ? "把心意，安放妥当。" : `${name}，欢迎回家。`}</h1><p>{step === "edit" ? "照片、信件，还有每一件小物的位置，都可以慢慢调整。" : "窗外是冬天，这里始终为你留着温暖。"}</p></div>{step === "edit" && <div className="winter-room-actions"><Link className="winter-secondary" href={href("open")}>礼物预览</Link><Link className="winter-primary" href={href("complete")}>完成礼物 <Icon name="check" size={18} /></Link></div>}</div><RoomBridge recipient={step === "room"} collected={collected} onCollect={collect} />{step === "room" && <div className="winter-story-action">{collected.length === 3 ? <Link className="winter-primary" href={href("story")}>展开我们的故事 <Icon name="arrow" /></Link> : <button className="winter-primary" disabled>再发现 {3 - collected.length} 件纪念物，解锁故事</button>}</div>}</section>}
      {step === "complete" && <section className="winter-complete-copy"><span className="winter-complete-mark"><Icon name="check" size={22} /></span><h1>心意，已经装好了。</h1><p>送给 {name} 的冬日小世界，<br />正等着被温柔开启。</p><div className="winter-share"><label htmlFor="gift-link">本机演示链接</label><div><input id="gift-link" value={link} readOnly onFocus={e => e.target.select()} /><button aria-label="复制链接" onClick={copyLink}><Icon name={copied ? "check" : "copy"} size={19} /></button></div><p role="status">{copied ? "链接已复制。仅此浏览器可读取你保存的礼物。" : "未接入后端；此链接不支持跨设备读取礼物。"}</p></div><Link className="winter-primary" href={href("open")}>预览礼物 <Icon name="arrow" /></Link><Link className="winter-text-link" href={href("edit")}>返回编辑</Link></section>}
      {step === "open" && <section className="winter-open-copy"><p className="winter-dedication">送给 {name}</p><h1>有一整个冬天的温柔，<br />想亲手交给你。</h1><p>“{draft.letter ? draft.letter.slice(0, 64) + (draft.letter.length > 64 ? "…" : "") : "无论外面的世界多冷，这里永远有一盏为你亮着的灯。"}”</p><span className="winter-signature">来自 {sender}</span><Link className="winter-primary" href={href("room")}>开启礼物 <Icon name="arrow" /></Link><small>轻轻打开，去发现留给你的三件纪念物</small>{!draft.recipient && <small className="winter-demo-label">你正在体验一份示例礼物</small>}</section>}
      {step === "story" && <section className="winter-story-wrap">{!hydrated ? <p role="status">正在展开信纸…</p> : collected.length < 3 ? <div className="winter-locked"><h1>还有回忆，等着被发现。</h1><p>探索三件纪念物后，完整故事就会展开。</p><Link className="winter-primary" href={href("room")}>继续探索 <Icon name="arrow" /></Link></div> : <><div className="winter-story-top"><Icon name="snow" size={25} /><span>三件纪念物，一个属于我们的故事</span></div><article className="winter-paper"><h1>亲爱的 {name}：</h1><p>{draft.memory || "还记得一起走过的海边、一起看过的日落吗？那些寻常的日子，被好好收藏在了这里。"}</p>{draft.photos.length > 0 && <div className="winter-story-photos">{draft.photos.map((p, i) => <img key={i} src={p} alt={`我们的回忆 ${i + 1}`} />)}</div>}<div className="winter-paper-divider"><Icon name="snow" size={18} /></div><p className="winter-letter-text">{draft.letter || "愿每一个冬天，都有人为你留一盏灯。愿你知道，自己一直被惦念。"}</p><p className="winter-paper-sign">一直惦念你的<br />{sender}</p><small>回忆与信件由赠送者提供 · 故事排版为本地模板</small></article><Link className="winter-secondary" href={href("room")}>重新查看礼物 <Icon name="back" size={17} /></Link></>}</section>}
    </div>
    <footer className="winter-footer"><span>应许之地 · 让回忆有处安放</span><span>{recipient ? "为你而亮的一盏灯" : "本地体验版"}</span></footer>
  </main>;
}
