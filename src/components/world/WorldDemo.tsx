"use client";

import { useEffect, useRef, useState } from "react";
import type { Game } from "phaser";

import Album from "./Album";

export default function WorldDemo() {
  const experienceRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("正在加载画布…");

  const [album,setAlbum]=useState(false);
  const [ambient,setAmbient]=useState(true);
  useEffect(()=>setAmbient(!window.matchMedia("(prefers-reduced-motion: reduce)").matches),[]);
  const [message,setMessage]=useState("点击贝壳、相册、信件或小猫，发现房间里的回忆。");
  useEffect(()=>{const select=(e:Event)=>{const id=(e as CustomEvent<string>).detail;if(id==="album")setAlbum(true);setMessage(({shell:"那天海边拾起的小贝壳，留住了海浪的声音。",letter:"写给未来的你：愿这里永远有一盏温暖的灯。",cat:"橘子轻轻蹭了蹭你的手。",album:"相册已打开，可添加真实照片。",oven:"烤箱里透出暖光，像是刚烤好一炉面包。",fridge:"奶油色冰箱里，留着明天早餐的食材。",window:"午后的阳光穿过木窗，树影落在地板上。"} as Record<string,string>)[id]??"");};window.addEventListener("room-select",select);return()=>window.removeEventListener("room-select",select);},[]);

  useEffect(() => {
    let cancelled = false;
    let game: Game | undefined;

    async function mountGame() {
      try {
        // Phaser depends on browser APIs; never import its runtime during SSR.
        const { createWorldGame } = await import("@/game/createWorldGame");
        if (cancelled || !containerRef.current) return;
        game = createWorldGame(containerRef.current);
        setStatus("Phaser 3 画布已加载");
      } catch {
        if (!cancelled) setStatus("画布加载失败，请刷新页面重试。");
      }
    }

    void mountGame();
    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);

  return (
    <section className="room-experience" ref={experienceRef} aria-label="2.5D 世界演示画布">
      <div className="room-stage"><div className="world-canvas" ref={containerRef} /><div className="room-vignette" aria-hidden="true"/><span className="room-location">午后小屋 · 你的应许之地</span></div>
      <div className="room-tools" aria-label="房间镜头控制">
       <button aria-label="放大房间" onClick={()=>window.dispatchEvent(new CustomEvent("room-camera",{detail:"in"}))}>＋</button>
       <button aria-label="缩小房间" onClick={()=>window.dispatchEvent(new CustomEvent("room-camera",{detail:"out"}))}>－</button>
       <button onClick={()=>window.dispatchEvent(new CustomEvent("room-camera",{detail:"reset"}))}>复位视角</button>
       <button onClick={async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await experienceRef.current?.requestFullscreen();}catch{setMessage("当前浏览器不支持全屏，可使用放大按钮观察细节。");}}}>沉浸全屏</button>
       <label><input type="checkbox" checked={ambient} onChange={e=>{setAmbient(e.target.checked);window.dispatchEvent(new CustomEvent("room-atmosphere",{detail:e.target.checked}));}}/>微光尘埃</label>
      </div>
      <p className="room-hint">拖动观察 · 滚轮或双指缩放 · 点击烤箱、冰箱、窗户和纪念物</p>
      <p role="status">{message}</p>
      <button onClick={()=>setAlbum(true)}>打开相册</button>
      <button onClick={()=>setMessage("那天海边拾起的小贝壳，留住了海浪的声音。")}>贝壳的故事</button>
      <label><input type="checkbox" onChange={e=>window.dispatchEvent(new CustomEvent("room-calibration",{detail:e.target.checked}))}/>显示承载区域（待视觉验收）</label>
      {album&&<Album close={()=>setAlbum(false)}/>}
      <p className="canvas-status" role="status">{status}</p>
    </section>
  );
}
