"use client";

import { useEffect, useRef, useState } from "react";
import type { Game } from "phaser";

export default function WorldDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("正在加载画布…");

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
    <section aria-label="2.5D 世界演示画布">
      <div className="world-canvas" ref={containerRef} />
      <p className="canvas-status" role="status">{status}</p>
    </section>
  );
}
