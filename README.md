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
- 八页流程的编辑与探索已接入真实 3D 房间：旋转缩放、物品点击特写、相框/信件编辑、台灯、CD 音乐或已有录音上传与播放。物品固定，没有介绍面板或拖动摆放。
- `/room-3d` 保留为独立生成工作台；`/world-demo` 保留原 Phaser 演示，不再作为主流程的房间。
- 统一暖白与绿色、统一字体。保留水晶球与已确认简短文案。
- `/room-3d` 已接入 MiMo 房间 Agent：文字或参考照片生成可交互 3D 房间，缺少模型时可自建楼梯、阁楼、电视和摆件等几何素材；支持承托/碰撞校验、本机保存和方案导出。见 [房间 Agent](docs/room-agent.md)、[参考照片](docs/room-reference.md)与[素材创作 skill](docs/room-generated-assets.md)。
- 生成范围已扩展到书房、多人工作室、餐厅、阅读室及混合空间：支持 3–12 米矩形房间、同类家具多实例、参数化尺寸、单件配色和最多八扇窗。页面提供双人书房、四人餐厅示例；旧方案继续兼容。
- 主流程编辑页复用房间 Agent，生成的 `RoomDefinition` 与礼物完整保存。不同字段并发编辑可合并，同一字段或过期完整快照保存会提示冲突；失败保留旧记录。首页示例使用独立只读礼物。
- 宠物 Agent 已接入：照片识别匹配四款猫狗模型，支持实际尺寸归一化、落地避碰、房间重生成保留宠物、IndexedDB 保存与包含模型的方案导出。当前素材保留原有毛色和静态姿态，见 [宠物 Agent](docs/pet-agent.md)。
- 分享位置已预留，复制按钮禁用。尚无照片精确重建、服务端数据库、跨设备分享或部署。准备页仍是本地整理演示，房间生成在编辑页发起。

V004 的 2.5D 房间、配套素材和独立相册未纳入本次 main 集成，具体范围见 [集成记录](docs/main-integration.md)。

## 代码与验证

目录职责、数据流、事件流和房间 JSON 契约见 [代码整理说明](docs/code-organization.md)；3D 功能与限制见 [3D 预览说明](docs/room-3d.md)。

`npm test` 汇总礼物、原房间配置/历史摆放、镜头、房间数据、模型资源释放和照片处理测试。

浏览器测试使用已有 Playwright，设置 `ROOM_URL`、`ROOM_CHROMIUM`，礼物脚本同时设置 `GIFT_URL`。`check-room-browser.cjs` 包含临时修改 JSON 的测试，需要开发服务器，结束后恢复配置。其他回归可在生产服务上运行。截图与测试输出保存在 Git 忽略的 `.room-qa/`。

项目记录：`今日待办_2026-11-06.md`、`应许之地_开发节点表.html`。

仓库：https://github.com/vvvv111111/promised-land 。本轮只合入本地 main，不自动推送。
