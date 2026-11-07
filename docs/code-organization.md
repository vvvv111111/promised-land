# 代码职责与房间数据

历史整理来自 `b92c76f`，选择性集成到 main；排除 V004 的 2.5D 房间、配套素材与独立相册。本轮将八页流程接入 3D，沿用已确认的统一风格。历史范围见 [main 集成记录](main-integration.md)。

## 当前入口

| 入口 | 责任 | 状态 |
| --- | --- | --- |
| `/`、`/gift/[step]` | 送礼与收礼的八页流程 | 编辑/探索使用 Three.js，编辑页接入房间 Agent |
| `/world-demo` | 独立 Phaser 房间 | 保留现有功能 |
| `/room-3d` | Three.js 房间生成、物品特写、CD 播放 | 独立工作台，与主流程共用组件 |

## 代码位置

| 位置 | 责任 |
| --- | --- |
| `components/gift/GiftExperience.tsx` | 页面流程、表单状态、完整礼物保存与收集进度 |
| `components/gift/GiftRoom.tsx` | 3D 工作台的就绪/查看事件、明确编辑命令，与外层进度连接 |
| `components/gift/GiftIcon.tsx`、`useGiftMusic.ts` | 原有图标与背景音乐；与 CD 播放互斥，避免叠音 |
| `components/world`、`game` | 原房间的 Phaser 挂载、场景和现有内容弹窗 |
| `components/room3d` | 3D 预览页面状态与音频面板；不再定义模型或镜头算法 |
| `components/shared/useDialogBounds.ts` | 内容面板尺寸回调，供镜头取景使用 |
| `room/types.ts`、`definition.ts`、`spatial.ts`、`default-room.json` | 可序列化房间数据、结构/空间校验和默认布局 |
| `room/buildRoom.ts` | 根据房间数据组装模型、建立交互目标、统一释放资源 |
| `room/models/context.ts` | 几何工具、材质、确定性纹理及 GPU 资源归属 |
| `room/models/architecture.ts`、`furniture.ts` | 房间壳体、地毯、家具和生活用品的局部几何 |
| `room/models/giftObjects.ts`、`pet.ts` | 礼物物品与宠物模型，互不决定对方的位置 |
| `room/rendering` | WebGL 生命周期、镜头、射线点击和物品特写 |
| `world/GiftStore.ts`、`WinterGift.ts` | 完整礼物唯一来源、草稿转换、旧记录只读迁移 |
| `lib/media` | 照片压缩与音频内容检查，不负责持久化 |
| `lib/storage` | CD 音频的 IndexedDB 存取 |
| `room/agent` | MiMo 房间设计契约、提示词、布局校验与 RoomDefinition 编译 |
| `lib/server/roomAgent.ts`、`app/api/room-agent` | 服务端 MiMo 配置、调用、校验修正和安全错误返回 |
| `components/room3d/RoomAgentWorkbench.tsx` | 文字需求、生成、取消、本机保存、方案导出与运行记录 |

原先集中在 `buildRoom.ts` 的摆放、模型、材质和交互状态已分离。`GiftExperience` 仅抽出原有图标、音乐和房间适配，没有重写页面。

## 数据流

礼物走 `GiftStore → GiftDraft → 表单 → giftWithDraft → saveGiftLocked(完整对象)`。相框/信件的 `saveLocked` 和房间的 `saveRoomLocked` 在锁内读取最新完整礼物，只合并本次目标字段，再以完整对象提交；不同字段的编辑不会相互覆盖。同一字段变化或表单完整快照过期时拒绝保存并保留输入，提示用户刷新。每次成功保存增加 revision，写入失败保留原记录和内存状态。浏览器支持 Web Locks 时跨页面串行化；不支持时使用当前页面队列和旧快照检查，无法保证真正同时写入的跨页面互斥。

相框、信件、表单和 `room?: RoomDefinition` 都以 `promised-land:gift:${giftId}` 为唯一来源。没有改变 `winter-local-v1`、旧草稿只读迁移或正式数据优先的规则。页面初始化不写存储；制作时才显式采用独立工作台已有方案，没有方案则采用默认房间。首页示例使用 `promised-land-example-v1` 的固定只读数据，不读取或写入个人礼物。进度改为按 giftId 隔离的 `collection:v2`，避免把旧贝壳进度误算成 CD。

房间从「模型代码内写死位置」改为 `default-room.json → validateRoomDefinition → buildRoom → 模型局部几何 → Three.js`。场景数据只描述空间，不复制照片、信件或音频。照片和信件来自 GiftStore；音频仍按 `giftId` 存在 `promised-land-room-audio` 的单条完整记录中。

制作页与相框复用解码、缩放和画布处理，保留原策略：制作页 12MB / 900px / JPEG 0.78；相框 10MB / 1200px / 0.86，并限制编码长度。相框保留白底，制作页保留原背景处理方式。独立相册属于此次排除内容。

## 房间数据契约

`RoomDefinition` 是 JSON 数据：版本、尺寸、随机种子、材质、模型节点、父子关系、位置/旋转/缩放、支撑面、交互 ID、灯光和初始镜头。当前模型库支持矩形房间与已有家具。尺寸调整仅缩放壳体，家具布局由节点明确给出，不会自动重新排布。

CD 机、相框、信封是必需交互物品，分别绑定 `cd-player`、`sunset-frame`、`sealed-letter`；台灯绑定 `lamp`。桌子和柜子提供有位置与宽深的 `top` 支撑面，CD、信封和台灯声明父节点和支撑面，移动父节点会带动物品。相框使用 `wall: back/left`，贴合实墙并朝向室内；`wallMount.ts` 描述墙面与窗洞，`wallPhoto.ts` 在低家具上方安排不遮窗、不被高柜遮挡的位置。生成方案保存完整挂墙位置；旧桌面相框只在渲染前适配，不回写原方案。模型工厂仅按挂墙标记去掉桌面支架，不决定摆放。

校验在创建 WebGL 或纹理之前执行，拒绝未知模型、非法数值/材质、重复 ID、缺失或循环父节点、缺失必需物品和无效支撑面。空间校验使用模型几何包围范围，计算缩放、旋转与父节点变换，检查越界、承托高度、物品悬出、主要模型重叠和支撑面元数据。它是保守包围盒检查，尚非精确网格碰撞或可达性分析；复杂旋转可能被保守拒绝。模型几何和支撑面变化时需同步维护校验范围与回归。

## 事件流

独立 Phaser 演示仍保留 `WorldDemo → onReady / onItemCollected / onObjectClicked` 及 `WorldDemoHandle.onEditRequest(objectId)`，不再参与主流程。

主流程使用 `GiftRoom → RoomPreviewHandle.onEditRequest → RoomView.activate(objectId)`；3D 射线命中/物品按钮同样进入 activate。镜头特写后通过明确回调打开内容面板，收礼模式以 `onItemCollected` 向 GiftExperience 报告相框、信件、CD 已查看；未上传音频也可计入 CD。面板通过 `onBounds` 报告尺寸；关闭通过 `clearFocus` 恢复镜头。无中文文案判断或模拟 DOM 点击。宠物目前只有独立模型，没有添加移动或互动。

## 现役与历史代码

`world/RoomPlacement.ts` 仍参与 Phaser 默认落点与遮挡，不可当作废代码删除。`world/RoomLayout.ts` 留作已取消摆放功能的历史回归资料，不由当前页面导入。保留这些资料不代表重新启用拖动物品、恢复位置缓存或摆放辅助区域。

原有 `winter` 文件名、CSS 类名、礼物 ID 和存储键保留，以免本轮重构引入不必要的兼容变化。视觉已全年化，名字仍有历史痕迹。

## 验证与下一步边界

`npm run typecheck`、`npm run build`、`npm test`。`npm test` 汇总原有状态测试，并加入房间契约、真实模型组装/释放和照片策略回归。

可选浏览器脚本仍使用已有 Playwright，设置 `ROOM_URL`、`ROOM_CHROMIUM`，礼物脚本同时设置 `GIFT_URL`。`check-refactor-visual.cjs` 先通过 `ROOM_CAPTURE_BASELINE=1` 保存基线，移除此变量后比较；截图写入忽略目录 `.room-qa/`。测试使用独立浏览器上下文，不修改开发浏览器中的礼物。旧 `check-room-browser.cjs` 含临时修改 JSON 的热更新测试，应针对开发服务器运行，结束后在 `finally` 恢复配置；其余本轮浏览器回归使用生产构建。

集成前已验证：八页流程、相框/信件、固定物品、3D 原生点击、镜头与手机手势、物品特写、CD 上传与保存失败回退。重构前后桌面/手机的首页、房间、CD 特写、相框特写共 8 张截图像素差异为 0。

独立 `/room-3d` 和主流程编辑页共用房间 Agent，通过服务端 MiMo 接口输出经过校验的设计数据，再编译为 `RoomDefinition`，不直接修改页面或操纵 DOM。主流程保存到当前礼物，独立工作台保留自己的方案键；生成/保存未完成时主流程阻止完成与预览。配置、能力范围与验证见 [房间 Agent](room-agent.md)。宠物 Agent、照片重建、服务端数据库和分享仍待接入；没有部署或推送。

本轮回归增加并发目标字段合并、过期快照拒绝、房间绑定、失败回退与示例隔离；测试脚本固定编译根路径，避免误读旧产物。浏览器 `check-gift-flow-browser.cjs` 覆盖 3D 八页闭环与桌面/手机，`check-gift-concurrency-browser.cjs` 覆盖真实双页面冲突和未保存导航保护。Agent 浏览器回归使用模拟响应，不产生模型调用费用。
