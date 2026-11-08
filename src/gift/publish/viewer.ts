import { createRoomView, type RoomView } from "../../room/rendering/createRoomView";
import { validateGiftPackage, type GiftPackage } from "./package";
import type { RoomObjectId } from "../../room/types";

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const status = el("status");
let view: RoomView | undefined, audioUrl: string | undefined;
try {
  const payload = JSON.parse(el("gift-data").textContent!) as GiftPackage;
  validateGiftPackage(payload);
  const { gift, audio } = payload;
  const photo = gift.object_contents["sunset-frame"], letter = gift.object_contents["sealed-letter"];
  el("title").textContent = `送给 ${gift.details?.recipient || "你"}`;
  el("sender").textContent = `来自 ${gift.details?.sender || "赠送者"}`;
  const panel = el<HTMLDialogElement>("panel"), body = el("panel-body");
  const collected = new Set<string>();
  let previousFocus: Element | null = null;
  const track = document.createElement("audio"); track.controls = true; track.preload = "metadata";
  if (audio) {
    const bytes = Uint8Array.from(atob(audio.base64), char => char.charCodeAt(0));
    audioUrl = URL.createObjectURL(new Blob([bytes], { type: audio.type })); track.src = audioUrl;
  }
  track.addEventListener("play", () => view?.setAudioPlaying(true));
  track.addEventListener("pause", () => view?.setAudioPlaying(false));
  track.addEventListener("ended", () => view?.setAudioPlaying(false));
  track.addEventListener("error", () => { status.textContent = "音乐未能播放，请换用支持此格式的浏览器。"; status.setAttribute("role", "alert"); });
  function bounds() { if (panel.open) { const r = panel.getBoundingClientRect(); view?.setPanelBounds({ x: r.x, y: r.y, width: r.width, height: r.height }); } }
  function collect(id: string) { collected.add(id); el("progress").textContent = `已查看 ${collected.size} / 3`; el<HTMLButtonElement>("story-button").disabled = collected.size < 3; }
  function close() { panel.close(); view?.setPanelBounds(null); view?.clearFocus(); if (previousFocus instanceof HTMLElement) previousFocus.focus(); }
  function show(id: string, title: string) {
    collect(id); el("panel-title").textContent = title;
    body.replaceChildren(); previousFocus = document.activeElement;
    if (!panel.open) panel.showModal();
    bounds();
  }
  function paragraph(text: string) { const p = document.createElement("p"); p.textContent = text; body.append(p); }
  function open(id: "sunset-frame" | "sealed-letter") {
    show(id, id === "sunset-frame" ? "相框" : "信件");
    if (id === "sunset-frame" && photo.kind === "photo_frame" && photo.photo) {
      const frame = document.createElement("div"), img = document.createElement("img"); frame.className = "photo-window";
      img.src = photo.photo; img.alt = "礼物相框中的照片";
      img.style.objectPosition = img.style.transformOrigin = `${photo.position_x * 100}% ${photo.position_y * 100}%`;
      img.style.transform = `scale(${photo.zoom})`; frame.append(img); body.append(frame);
    } else paragraph(id === "sunset-frame" ? "暂无照片" : letter.kind === "letter" ? letter.body || "暂无正文" : "暂无正文");
    bounds();
  }
  const fail = (message?: string) => { status.textContent = message || "房间未能加载，请使用支持 WebGL 2 的浏览器后重试。"; status.setAttribute("role", "alert"); document.querySelectorAll<HTMLButtonElement>(".controls button").forEach(button => { button.disabled = true; }); };
  view = createRoomView(el("stage"), {
    definition: gift.room, photo: photo.kind === "photo_frame" ? photo : undefined,
    onReady: () => { status.textContent = ""; document.querySelectorAll<HTMLButtonElement>(".controls button").forEach(button => { button.disabled = false; }); },
    onOpen: open, onAudioRequest: () => { show("cd-player", "CD 机"); if (audio) { paragraph(audio.name); body.append(track); } else paragraph("暂无音频"); bounds(); },
    onFocusChange: () => {}, onError: fail,
  });
  el("close").onclick = close;
  panel.addEventListener("cancel", event => { event.preventDefault(); close(); });
  new ResizeObserver(bounds).observe(panel); window.addEventListener("resize", bounds);
  document.querySelectorAll<HTMLButtonElement>("[data-object]").forEach(button => { button.onclick = () => view?.activate(button.dataset.object as RoomObjectId); });
  el("zoom-in").onclick = () => view?.zoom(.88); el("zoom-out").onclick = () => view?.zoom(1.14); el("reset").onclick = () => view?.reset();
  el("memory").textContent = gift.details?.memory || "";
  el("story-letter").textContent = letter.kind === "letter" ? letter.body : "";
  el("story-sender").textContent = gift.details?.sender || "";
  const photos = [...(photo.kind === "photo_frame" && photo.photo ? [photo.photo] : []), ...(gift.details?.extra_photos ?? [])];
  for (const [index, src] of photos.entries()) { const img = document.createElement("img"); img.src = src; img.alt = `照片 ${index + 1}`; el("story-photos").append(img); }
  el("story-button").onclick = () => { el("story").hidden = false; el("story").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); };
  window.addEventListener("pagehide", () => { track.pause(); view?.dispose(); if (audioUrl) URL.revokeObjectURL(audioUrl); }, { once: true });
} catch (error) { view?.dispose(); if (audioUrl) URL.revokeObjectURL(audioUrl); status.textContent = error instanceof Error ? error.message : "礼物未能加载，请重新下载完整礼物包。"; status.setAttribute("role", "alert"); }
