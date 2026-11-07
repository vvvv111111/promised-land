import Link from "next/link";
import WorldDemo from "@/components/world/WorldDemo";

export default function WorldDemoPage() {
  return (
    <main className="page world-page">
      <Link className="world-brand" href="/">应许之地<small lang="en">promised land</small></Link>
      <Link className="back" href="/">返回首页</Link>
      <h1>查看礼物</h1>
      <WorldDemo />
    </main>
  );
}
