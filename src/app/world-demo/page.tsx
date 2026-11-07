import Link from "next/link";
import WorldDemo from "@/components/world/WorldDemo";

export default function WorldDemoPage() {
  return (
    <main className="page world-page">
      <Link className="back" href="/">← 返回首页</Link>
      <p className="eyebrow">WORLD DEMO</p>
      <h1>世界演示</h1>
      <p className="muted">一间被阳光照亮的小屋，和几件值得珍藏的回忆。点击房间里的物件，慢慢探索。</p>
      <WorldDemo />
    </main>
  );
}
