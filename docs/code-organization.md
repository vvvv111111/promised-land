# 代码职责与房间数据

本轮整理来自 `b92c76f`，选择性集成到 main；排除 V004 的 2.5D 房间、配套素材与独立相册。八页流程保留 main 原有房间，沿用已确认的统一风格。范围见 [main 集成记录](main-integration.md)。

## 当前入口

| 入口 | 责任 | 状态 |
| --- | --- | --- |
| `/`、`/gift/[step]` | 送礼与收礼的八页流程 | 使用现有 Phaser 房间 |
| `/world-demo` | 独立 Phaser 房间 | 保留现有功能 |
| `/room-3d` | Three.js 房间、物品特写、CD 播放 | 独立预览，尚未替换八页流程 |

## 代码位置

| 位置 | 责任 |
| --- | --- |
| `components/gift/GiftExperience.tsx` | 页面流程、表单状态、完整礼物保存与收集进度 |
| `components/gift/GiftRoom.tsx` | Phaser 的明确事件和编辑命令，与外层进度连接 |
| `components/gift/GiftIcon.tsx`、`useGiftMusic.ts` | 原有图标与背景音乐，不与 CD 音频混用 |
| `components/world`、`game` | 原房间的 Phaser 挂载、场景和现有内容弹窗 |
| `components/room3d` | 3D 预览页面状态与音频面板；不再定义模型或镜头算法 |
| `components/shared/useDialogBounds.ts` | 内容面板尺寸回调，供镜头取景使用 |
| `room/types.ts`、`definition.ts`、`default-room.json` | 可序列化房间数据、校验和当前布局 |
| `room/buildRoom.ts` | 根据房间数据组装模型、建立交互目标、统一释放资源 |
| `room/models/context.ts` | 几何工具、材质、确定性纹理及 GPU 资源归属 |
| `room/models/architecture.ts`、`furniture.ts` | 房间壳体、地毯、家具和生活用品的局部几何 |
| `room/models/giftObjects.ts`、`pet.ts` | 礼物物品与宠物模型，互不决定对方的位置 |
| `room/rendering` | WebGL 生命周期、镜头、射线点击和物品特写 |
| `world/GiftStore.ts`、`WinterGift.ts` | 完整礼物唯一来源、草稿转换、旧记录只读迁移 |
| `lib/media` | 照片压缩与音频内容检查，不负责持久化 |
| `lib/storage` | CD 音频的 IndexedDB 存取 |

原先集中在 `buildRoom.ts` 的摆放、模型、材质和交互状态已分离。`GiftExperience` 仅抽出原有图标、音乐和房间适配，没有重写页面。

## 数据流

礼物仍走 `GiftStore → GiftDraft → 表单 → giftWithDraft → saveGift(完整对象)`。相框与信件也由同一完整礼物读取。保存失败保留原完整记录；组件中的未保存输入不会冒充成功保存的数据。没有改变 `winter-local-v1`、localStorage 键或迁移优先级。

房间从「模型代码内写死位置」改为 `default-room.json → validateRoomDefinition → buildRoom → 模型局部几何 → Three.js`。场景数据只描述空间，不复制照片、信件或音频。照片和信件来自 GiftStore；音频仍按 `giftId` 存在 `promised-land-room-audio` 的单条完整记录中。

制作页与相框复用解码、缩放和画布处理，保留原策略：制作页 12MB / 900px / JPEG 0.78；相框 10MB / 1200px / 0.86，并限制编码长度。相框保留白底，制作页保留原背景处理方式。独立相册属于此次排除内容。

## 房间数据契约

`RoomDefinition` 是 JSON 数据：版本、尺寸、随机种子、材质、模型节点、父子关系、位置/旋转/缩放、支撑面、交互 ID、灯光和初始镜头。当前模型库支持矩形房间与已有家具。尺寸调整仅缩放壳体，家具布局由节点明确给出，不会自动重新排布。

CD 机、相框、信封是必需交互物品，分别绑定 `cd-player`、`sunset-frame`、`sealed-letter`；台灯绑定 `lamp`。桌子和柜子提供有位置与宽深的 `top` 支撑面，礼物物品声明父节点和支撑面。移动父节点会带动物品，模型工厂不再私自决定摆放。

校验在创建 WebGL 或纹理之前执行，拒绝未知模型、非法数值/材质、重复 ID、缺失或循环父节点、缺失必需物品、无效支撑面和落点超出支撑面。当前不做完整模型足迹、穿插、承托高度或可达性验证；不能把校验通过等同于生成结果已适合发布。支撑面数据应随家具模型同步维护。

## 事件流

Phaser 保持 `WorldDemo → onReady / onItemCollected / onObjectClicked → 外层业务`；`GiftRoom` 使用就绪和收集回调连接 `GiftExperience`，编辑按钮通过 `WorldDemoHandle.onEditRequest(objectId)` 调用房间。不读取中文文案或模拟 DOM 点击。

3D 保持 `射线命中或物品按钮 → RoomView.activate(objectId) → 镜头特写 → 明确业务回调 → 内容面板`。面板通过 `onBounds` 报告尺寸；关闭面板通过 `clearFocus` 恢复镜头。宠物目前只有独立模型，没有添加移动或互动。

## 现役与历史代码

`world/RoomPlacement.ts` 仍参与 Phaser 默认落点与遮挡，不可当作废代码删除。`world/RoomLayout.ts` 留作已取消摆放功能的历史回归资料，不由当前页面导入。保留这些资料不代表重新启用拖动物品、恢复位置缓存或摆放辅助区域。

原有 `winter` 文件名、CSS 类名、礼物 ID 和存储键保留，以免本轮重构引入不必要的兼容变化。视觉已全年化，名字仍有历史痕迹。

## 验证与下一步边界

`npm run typecheck`、`npm run build`、`npm test`。`npm test` 汇总原有状态测试，并加入房间契约、真实模型组装/释放和照片策略回归。

可选浏览器脚本仍使用已有 Playwright，设置 `ROOM_URL`、`ROOM_CHROMIUM`，礼物脚本同时设置 `GIFT_URL`。`check-refactor-visual.cjs` 先通过 `ROOM_CAPTURE_BASELINE=1` 保存基线，移除此变量后比较；截图写入忽略目录 `.room-qa/`。测试使用独立浏览器上下文，不修改开发浏览器中的礼物。旧 `check-room-browser.cjs` 含临时修改 JSON 的热更新测试，应针对开发服务器运行，结束后在 `finally` 恢复配置；其余本轮浏览器回归使用生产构建。

集成前已验证：八页流程、相框/信件、固定物品、3D 原生点击、镜头与手机手势、物品特写、CD 上传与保存失败回退。重构前后桌面/手机的首页、房间、CD 特写、相框特写共 8 张截图像素差异为 0。

后续才接入房间 Agent 和宠物 Agent、3D 主流程、服务端和分享；本轮没有实现这些功能，也没有部署或推送。Agent 应输出经过校验的房间数据，不直接修改页面或操纵 DOM。
