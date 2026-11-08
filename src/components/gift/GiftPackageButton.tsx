"use client";

import { useState } from "react";

export default function GiftPackageButton({ giftId }: { giftId: string }) {
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [error, setError] = useState("");
  async function download() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { packageSavedGift } = await import("@/gift/publish/agent");
      const blob = await packageSavedGift(giftId, setStatus);
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `promised-land-${giftId}.zip`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000); setStatus("礼物包已准备好");
    } catch (failure) { setStatus(""); setError(failure instanceof Error ? failure.message : "打包失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <section className="winter-package" aria-label="礼物打包">
    <button className="winter-primary" type="button" disabled={busy} onClick={() => void download()}>{busy ? "正在打包…" : "下载礼物包"}</button>
    <p className="winter-page-note">解压后可查看，也可上传到静态网站。</p>
    {status && <p className="winter-page-note" role="status">{status}</p>}
    {error && <p className="winter-details-error" role="alert">{error}</p>}
  </section>;
}
