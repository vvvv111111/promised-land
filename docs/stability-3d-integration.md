# 稳定性修复与 3D 主流程接入

日期：2026-11-07。本轮保留八页顺序和暖白/绿色视觉，复用工作区已有的 MiMo 房间 Agent，没有重写 GiftExperience，没有部署或推送。

## 修复与接入

- 旧 GiftStore 快照可能覆盖其他页面修改。现在目标字段保存先取得最新完整礼物，合并本次字段后单次写入；同字段冲突和过期完整快照拒绝提交，输入保留。支持 Web Locks 的浏览器跨页面串行保存，revision 随成功提交增加。
- 房间校验从节点原点扩大到缩放、旋转和父子变换后的模型范围，拒绝越界、悬空、支撑面悬出、主要模型穿插和伪造承托面。默认墙上装饰仅允许已知承托位置。
- 首页示例使用独立只读礼物，不再显示用户当前礼物；示例音频与进度也独立。
- 主流程编辑、预览和收礼使用相同 3D 组件。相框、信件、CD 可点击特写；赠送者可编辑/上传，收礼者只读。三件物品的查看进度按礼物隔离，音频选填。
- 编辑页接入已有文字生成工作台，房间随当前礼物保存。生成未完成或保存失败时阻止完成/预览，保留重试与方案导出。CD 和页头音乐互相暂停。
- 保留独立 `/room-3d` 工作台、`/world-demo` 原 Phaser 演示和旧数据兼容；测试编译路径固定，避免读到过期产物。

## 数据与事件

原来：表单和房间编辑器各自持有礼物快照；房间方案另存于独立工作台，主流程仍使用 Phaser；示例与用户共用礼物 ID。

现在：`表单/内容编辑/房间生成 → GiftStore 保存队列与冲突检查 → 当前 giftId 的完整礼物（包含 room）→ 编辑/预览/收礼`。页面初始化只读，不回写旧草稿或全局房间。CD Blob 仍以相同 giftId 存于 IndexedDB，保持原来明确保存的操作方式。

事件：`3D 射线命中或明确编辑命令 → RoomView.activate(objectId) → 镜头特写与内容回调 → RoomPreview → GiftRoom → GiftExperience`。不读取中文文案或通过模拟 DOM 点击控制房间。

## 本轮文件

| 范围 | 文件 |
| --- | --- |
| 保存与隔离 | `src/world/GiftStore.ts`、`WinterGift.ts`、`types.ts` |
| 主流程 | `src/app/gift/[step]/page.tsx`、`src/app/layout.tsx`、`src/components/gift/GiftExperience.tsx`、`GiftRoom.tsx`、`useGiftMusic.ts`、`winter.css` |
| 3D 与旧编辑器兼容 | `src/components/room3d/RoomPreview.tsx`、`RoomAgentWorkbench.tsx`、`RoomAudioDialog.tsx`、`src/components/world/GiftContentDialog.tsx`、`WorldDemo.tsx`、`src/room/rendering/createRoomView.ts` |
| 房间数据 | `src/room/spatial.ts`、`definition.ts`、`src/room/agent/persistence.ts` |
| 状态回归 | `scripts/check-gift-state.cjs`、`check-room-state.cjs`、`check-placement-state.cjs`、`check-room-definition.cjs` |
| 浏览器回归 | `scripts/check-gift-flow-browser.cjs`、`check-gift-concurrency-browser.cjs`、`check-room-3d-browser.cjs`、`check-room-focus-browser.cjs`、`check-winter-routes.cjs` |
| 说明 | `DESIGN.md`、`PRODUCT.md`、`README.md`、`docs/code-organization.md`、`room-3d.md`、`room-agent.md`、本文件 |

工作区原有的 Agent 服务端、模型库、卧室和窗洞扩展继续保留，不作为本轮从零新增的成果。

## 验证

- `npm run typecheck`、`npm test`、`npm run build`。
- 生产预览：八页 3D 闭环、相框裁剪、信件、房间绑定、只读收礼、示例隔离、桌面/手机无横向溢出。
- 双页面：同字段冲突保留输入、不同字段及房间合并、配额失败完整回退、未保存阻止完成、按礼物播放音频及背景音乐互斥。
- 原有 3D：真实模型射线点击、视角与手机缩放、WebGL 失败/重试、物品特写及关闭恢复。
- CD：真实 WAV 解码、试听/保存/播放、错误和超大文件拒绝、事务失败回退、收礼只读。
- Agent：状态与浏览器使用模拟响应验证生成/取消/修正/失败恢复，不调用付费接口。本轮未重新进行真实 MiMo 额度测试。

## 仍未解决

- 房间照片重建、模型库外的新模型、任意房型和宠物 Agent。
- 服务器礼物/音频持久化、用户鉴权、跨设备分享与上线前的持久化额度控制；没有自动部署。
- 准备页仍为本地整理演示，文字生成在编辑页发起。
- 空间校验为保守包围盒，不是精确网格碰撞或行走可达性分析；模型变动需同步维护边界。
- GiftStore 与音频 IndexedDB 各自保证完整保存，尚无跨存储事务。不支持 Web Locks 的浏览器尚无可靠跨页面同时写入互斥。
- 真机性能、iOS 音频与触控、CI 自动化仍待后续验收与接入。

等待人工验收，不自动进入下一批开发。
