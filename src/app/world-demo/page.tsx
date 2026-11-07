import Link from "next/link";
import WorldDemo from "@/components/world/WorldDemo";

export default function WorldDemoPage() {
  return (
    <main className="page world-page">
      <Link className="back" href="/">← 返回首页</Link>
      <p className="eyebrow">WORLD DEMO</p>
      <h1>世界演示</h1>
      <p className="muted">Phaser 3 基础画布。菱形地面为占位，后续用于展示 2.5D 房间。</p>
      <WorldDemo />
    </main>
  );
}
