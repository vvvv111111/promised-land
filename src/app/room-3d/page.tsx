import Link from "next/link";
import RoomAgentWorkbench from "@/components/room3d/RoomAgentWorkbench";
import "./room-3d.css";

export const metadata = { title: "3D 房间 · 应许之地", description: "应许之地 3D 房间样版" };

export default function Room3DPage() {
  return (
    <main className="room3d-page">
      <header className="room3d-header">
        <Link className="world-brand" href="/">应许之地<small lang="en">promised land</small></Link>
        <Link className="back" href="/">返回首页</Link>
      </header>
      <h1 className="room3d-title">3D 房间</h1>
      <RoomAgentWorkbench />
    </main>
  );
}
