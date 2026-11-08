import type { GiftPackage } from "./package";

export function packageHtml(payload: GiftPackage) {
  // User text is JSON data, never executable script or HTML.
  const data = JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>应许之地</title>
<style>
:root{color-scheme:light;--bg:#f7f4ed;--ink:#343d35;--green:#465a47;--muted:#687063;--line:#d8dcd0;--secondary:#e9e9df}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 "Microsoft YaHei",sans-serif;caret-color:var(--green)}::selection{background:#d6dfcf;color:#26362b}html{scrollbar-color:#a0aa96 var(--bg)}
header,main{width:min(100% - 40px,960px);margin:auto}header{padding:24px 0;border-bottom:1px solid var(--line);font-size:21px}header small{display:block;color:var(--muted);font-size:11px;letter-spacing:.06em}main{padding:32px 0 64px}h1{font-size:28px;font-weight:500;margin:0}h2{font-size:22px;font-weight:500;margin:0}p{overflow-wrap:anywhere}#sender,#status,#progress{color:var(--muted);font-size:13px}#status{min-height:24px}#status[role=alert]{color:#89472f}
#stage{height:clamp(300px,65vh,680px);touch-action:none}canvas{display:block;width:100%;height:100%}button,audio{font:inherit}button{min-height:44px;border:0;border-radius:6px;padding:10px 18px;background:var(--secondary);color:var(--green);cursor:pointer}button:hover{background:#dedfd2}button:disabled{color:var(--muted);cursor:not-allowed;opacity:.6}button:focus-visible,summary:focus-visible,audio:focus-visible{outline:2px solid var(--green);outline-offset:4px}.controls{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.view-controls{margin-left:auto;display:flex;gap:8px}#story-button{background:var(--green);color:#fffdf8}#story-button:disabled{background:var(--secondary);color:var(--muted)}
dialog{position:fixed;inset:24px 24px auto auto;margin:0;width:min(380px,calc(100% - 32px));max-height:calc(100dvh - 48px);overflow:auto;padding:24px;border:0;border-radius:12px;background:var(--bg);color:var(--ink);box-shadow:0 20px 70px #26362b33}dialog::backdrop{background:#26362b26}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px;position:sticky;top:-24px;padding-top:8px;background:var(--bg)}.panel-head button{width:44px;padding:10px}#panel-body p{white-space:pre-wrap;line-height:2}.photo-window{aspect-ratio:4/3;overflow:hidden;background:var(--secondary)}.photo-window img{width:100%;height:100%;object-fit:cover;display:block}audio{width:100%;margin-top:16px}#story{max-width:680px;margin:40px auto 0;padding:28px;background:#fffdf8;border-radius:6px}#story p{white-space:pre-wrap;line-height:2}#story-photos{display:flex;flex-wrap:wrap;gap:12px}#story-photos img{width:min(100%,180px);aspect-ratio:1;object-fit:cover}#story-sender{text-align:right;color:var(--muted)}[hidden]{display:none!important}
@media(max-width:700px){main{padding-top:24px}h1{font-size:26px}#stage{height:52svh;min-height:300px}.view-controls{margin-left:0}dialog{inset:auto 12px 12px;width:calc(100% - 24px);max-height:46dvh;padding:20px}.panel-head{top:-20px}#story{padding:20px}}
</style></head><body>
<header>应许之地<small lang="en">promised land</small></header>
<main><h1 id="title">送给你</h1><p id="sender"></p><p id="status" role="status">正在加载房间…</p><noscript>请开启 JavaScript 后查看礼物。</noscript>
<div id="stage" aria-label="3D 房间"></div>
<div class="controls"><button data-object="sunset-frame" disabled>相框</button><button data-object="sealed-letter" disabled>信件</button><button data-object="cd-player" disabled>CD 机</button><div class="view-controls"><button id="zoom-in" disabled>放大</button><button id="zoom-out" disabled>缩小</button><button id="reset" disabled>复位视角</button></div></div>
<p id="progress" role="status">已查看 0 / 3</p><button id="story-button" disabled>查看回忆</button>
<article id="story" hidden><h2>回忆</h2><p id="memory"></p><div id="story-photos"></div><p id="story-letter"></p><p id="story-sender"></p></article></main>
<dialog id="panel" aria-labelledby="panel-title"><div class="panel-head"><h2 id="panel-title"></h2><button id="close" aria-label="关闭"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div><div id="panel-body"></div></dialog>
<script id="gift-data" type="application/json">${data}</script><script src="./viewer.js" defer></script></body></html>`;
}
