# 应许之地 / promised land

私人定制数字礼物原型。Next.js、TypeScript、Phaser 与 Three.js。

## 启动与检查

环境：Node.js 20.9 以上、npm。

```powershell
npm install
npm run dev
```

默认地址：http://localhost:3000。

```powershell
npm run typecheck
npm test
npm run build
npm run start
```

## 当前功能

- `/`、`/gift/[step]`：制作、模拟生成、编辑、完成、开启、探索和回忆的八页流程。照片和信件以完整礼物保存；失败保留旧记录。
- 八页流程与 `/world-demo` 沿用 main 原有房间。物品固定，没有介绍面板、拖动摆放或独立小扶手椅。
- `/room-3d`：独立的真实 3D 预览。支持旋转缩放、物品点击特写、照片/信件查看、台灯以及 CD 音乐或已有录音文件上传、保存和播放。
- 统一暖白与绿色、统一字体。保留水晶球与已确认简短文案。
- 分享位置已预留，复制按钮禁用。尚未接入真实生成、Agent、服务端、跨设备分享或部署。

V004 的 2.5D 房间、配套素材和独立相册未纳入本次 main 集成，具体范围见 [集成记录](docs/main-integration.md)。

## 代码与验证

目录职责、数据流、事件流和房间 JSON 契约见 [代码整理说明](docs/code-organization.md)；3D 功能与限制见 [3D 预览说明](docs/room-3d.md)。

`npm test` 汇总礼物、原房间配置/历史摆放、镜头、房间数据、模型资源释放和照片处理测试。

浏览器测试使用已有 Playwright，设置 `ROOM_URL`、`ROOM_CHROMIUM`，礼物脚本同时设置 `GIFT_URL`。`check-room-browser.cjs` 包含临时修改 JSON 的测试，需要开发服务器，结束后恢复配置。其他回归可在生产服务上运行。截图与测试输出保存在 Git 忽略的 `.room-qa/`。

项目记录：`今日待办_2026-11-06.md`、`应许之地_开发节点表.html`。

仓库：https://github.com/vvvv111111/promised-land 。本轮只合入本地 main，不自动推送。
