"use client";

import { useEffect, useState } from "react";

interface Props {
  startedAt: number;
  phase: "generating" | "repairing" | "waiting" | "previewing" | "complete";
  round: number;
}

export default function RoomGenerationProgress({ startedAt, phase, round }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const complete = phase === "complete";
  useEffect(() => {
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    if (complete) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, complete]);

  const label = phase === "repairing" ? `自动修复 · 第 ${round} 轮`
    : phase === "waiting" ? "等待继续生成…"
    : phase === "previewing" ? "正在加载房间预览…"
    : complete ? "房间已生成" : "正在生成并校验房间…";
  const duration = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return <div className="room-generation-progress" data-complete={complete}>
    <div className="room-generation-progress-heading">
      <span role="status">{label}</span>
      <span className="room-generation-progress-time">{complete ? "用时" : "已用"} {duration}</span>
    </div>
    <div className="room-generation-progress-track" role="progressbar" aria-label="房间生成进度"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={complete ? 100 : undefined} aria-valuetext={label}>
      <span aria-hidden="true" />
    </div>
  </div>;
}
