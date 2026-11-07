import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page">
      <p className="eyebrow">PROMISED LAND</p>
      <h1>应许之地</h1>
      <p className="intro">一份属于你的 2.5D 私人定制数字礼物。</p>
      <p className="muted">项目已初始化，世界从这里开始。</p>
      <Link className="button" href="/world-demo">进入世界演示</Link>
    </main>
  );
}
