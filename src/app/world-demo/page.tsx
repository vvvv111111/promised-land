import Link from "next/link";
import WorldDemo from "@/components/world/WorldDemo";

export default function WorldDemoPage() {
  return (
    <main className="page world-page">
      <Link className="back" href="/">← 返回首页</Link>
      <p className="eyebrow">MY LITTLE WORLD</p>
      <h1>午后，回到你的小屋。</h1>
      <p className="muted">窗外有树影，烤箱里有暖光。把真实的回忆，留在这个小世界里。</p>
      <WorldDemo />
    </main>
  );
}
