# 房间 Agent · MiMo

入口：主流程 `/gift/edit` 和独立工作台 `/room-3d`。赠送者可输入文字或上传一张参考照片，生成家具、窗洞、配色、布局和光照。图片的处理、隐私与验证见 [房间参考照片](room-reference.md)。收礼页 `/gift/room` 或独立页 `?mode=recipient` 只展示房间与已有交互。

## 配置与启动

将 `.env.example` 复制为 `.env.local`，填写服务端配置：

```dotenv
MIMO_API_KEY=你的密钥
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_MODEL=mimo-v2.6-pro
```

Token Plan 使用其控制台提供的 OpenAI 兼容 Base URL 和对应密钥。不要添加 `NEXT_PUBLIC_` 前缀。`.env.local` 已被 Git 忽略。修改环境配置后重启服务。

```powershell
npm run dev
```

接口依据：[MiMo 官方首次调用说明](https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call)、[结构化输出](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/text-generation/structured-output)。默认使用 `mimo-v2.6-pro`，可通过 `MIMO_MODEL` 切换平台支持的模型。

## 执行与数据

`文字描述 / 参考照片与补充要求 → POST /api/room-agent → MiMo JSON 输出 → 设计契约及布局检查 → 编译 RoomDefinition → 既有房间校验 → Three.js`

- `src/room/agent/design.ts`：小型设计契约、输出解析、家具边界/重叠检查、编译完整房间数据。
- `src/room/agent/compile.ts`：新版独立场景构建、真实尺寸承托面、纪念物自动排布与镜头适配。
- `src/room/agent/examples.ts`：起居室、卧室、双人书房和四人餐厅示例。
- `src/room/agent/fitReference.ts`：文字和照片生成共用的轻微贴墙误差修正；只平移，不删减家具或修改尺寸，修正数量写入生成记录。
- `src/room/agent/prompt.ts`：模型能力、字段、尺寸和摆放约束。
- `src/room/agent/composerSkill.ts`、`generatedExample.ts`：运行时素材创作/空间复刻 skill 与完整自建阁楼示例。
- `src/room/generated.ts`、`models/generated.ts`：声明式几何解析、部件预算、真实承托面和自建素材网格。见 [房间素材创作与布局](room-generated-assets.md)。
- `src/room/furnitureCatalog.ts`：可选家具的真实模型、占地和承托面尺寸。
- `src/room/architecture.ts`、`models/architecture.ts`：窗洞校验和按洞口分段构造的真实墙体。
- `src/room/models/bedroom.ts`：床、书桌、椅子、床头柜、书架和衣柜几何。
- `src/room/models/parametric.ts`：按实际尺寸重新构造全部 13 种家具，保留合理桌腿、板材和坐垫厚度。
- `src/lib/server/roomAgent.ts`：服务端鉴权、逐轮生成和校验修复、安全错误映射。每轮模型调用最多 170 秒；工作台逐轮续接请求，校验失败没有固定修复轮数上限，直到通过或用户取消。前端 180 秒超时按单轮计算。
- `src/app/api/room-agent/route.ts`：状态检查与生成路由；文字最多 2000 字，纯文字请求体最多 12000 字节，带图片最多 1,612,000 字节；拒绝跨站请求，单进程最多两个并发生成。
- `src/lib/server/roomReference.ts`、`src/room/agent/referencePrompt.ts`：参考 JPEG 校验、照片观察与现有设计协议的连接。
- `src/components/room3d/RoomAgentWorkbench.tsx`：需求表单、生成进度、取消、错误恢复、预览与本机保存。

模型决定房间大小、家具类型/数量/尺寸、位置/朝向、整体及单件配色、左墙/后墙窗洞与光照。新版从房间外壳和四件交互物构建场景，不自动带入默认客厅的其他家具或装饰。程序按家具参数构建网格，不执行模型提供的代码或远程素材。CD、信封与台灯按真实占地自动排布在可用承托面，必要时适度缩小；空间不足时要求修正设计。相框挂在实墙上，优先位于低家具上方，避让窗户、窗框及高柜。礼物中的照片、信件和音频继续由原有 GiftStore/IndexedDB 提供，不发送给 MiMo；用户主动上传的房间参考照片另见照片说明。

每次生成以本次文字和可选参考照片为输入，没有跨任务聊天记忆。仅照片也可生成。模型说明中的 `limitations` 保留在结果数据中，编辑界面不展示。模型输出非法或截断时持续自动修复，带上原始要求、原照片、上一版方案和最近的校验问题；重复错误要求重新计算边界并换用局部修正，保留主要家具和布局。每轮只携带最新候选与最多八项错误，避免上下文无限增长。鉴权、模型限流、网络或单轮超时等服务错误会明确显示，取消和失败保留原房间。

工作台先 `POST {continuous:true,prompt,referenceImage?}` 获取不透明的 `generationId`，再逐次 `POST {generationId}`。每次续接只执行一轮模型调用；202 表示正在修复并附带面向用户的进度，200 才是通过完整校验的方案。只有成功方案才会合并宠物并保存。取消或离开页面会中止当前请求并用 `DELETE /api/room-agent?id=…` 释放修复任务。修复状态仅保存在当前服务进程内存中，最多八个任务，空闲十分钟过期；完成或取消即释放，服务重启后需重新生成。部署多实例时需迁移到共享任务存储。旧式不带 `continuous` 的调用也会持续修复，但仍受单次 HTTP 的 170 秒总预算限制。

房间和宠物共用一个编辑器，通过「房间 / 宠物」切换操作，画面始终作为主区域。生成、模型选择和尺寸/朝向调整只更新预览，点击「保存」才提交；「撤销」恢复已保存的整个空间。切换页签保留当前组合预览。

独立工作台的已确认方案保存在 `promised-land:room-agent:v1`。读取时校验设计和完整 `definition`，保留宠物资产与最终位置；完整场景仍通过房间边界、支撑和碰撞校验后才渲染。主流程通过 `saveRoomLocked` 合并进当前礼物，保留最新相框、信件和表单内容；预览与收礼页从同一礼物读取，不依赖工作台全局方案。只有制作动作在礼物尚无房间时显式采用已有独立方案，初始化不会覆盖房间。

保存失败保留候选和原有存储，可重试或撤销；有未确认预览、生成任务或保存任务时，主流程的完成/礼物预览入口会被阻止。预览加载失败时不能保存。生成期间隐藏「生成房间」，保留进度与「取消生成」；结束、失败或取消后恢复生成入口。编辑器移除「未实现」和「更多」区块及其中的导出、恢复默认操作，减少与制作礼物无关的选择；结果数据和本机保存不变。

## 当前范围

不再限定只有客厅和卧室：支持书房、多人工作室、餐厅、阅读室、单/双床卧室及混合用途。房间用途由家具组合决定，没有固定房型枚举。家具库共 13 类：沙发、茶桌、矮柜、落地植物、地毯、床、书桌、椅子、床头柜、书架、衣柜、新增餐桌和阅读扶手椅。

新设计使用 `version: 2`，`dimensions: [宽, 高, 深]`（米）；宽/深为 3–12m、高为 2.4–5m，镜头和阴影范围随房间调整。`furniture` 为 1–32 个实例，每项的 `id` 独立唯一，`type` 指向家具库或使用 `custom` 引用自建素材，同类可重复。库内可选 `size: [宽, 高, 深]` 使用合理尺寸范围（如床宽 0.95–2.2m），可选 `colors: {wood: "#rrggbb", ...}` 只覆盖当前实例。家具库列出每种家具实际使用的材质键；写入不会显示的材质会要求修正，餐椅坐垫使用 `creamFabric`、柜体使用 `wood`。各家具按参数建模，非整件网格拉伸。纪念物必须有足够空余面积的桌柜或真实自建承托面。

新版 `architecture.units: "meters"`，左墙/后墙合计支持 0–8 个矩形窗洞，每面墙最多四扇。窗户直接使用米制坐标，不随房间尺寸二次缩放；窗洞、窗框、窗台、窗棂和玻璃均为真实几何。旧版无 `version` 的设计仍按原编译路径读取；旧房间未提供 `architecture` 或未标注 `units` 时继续使用原坐标语义和模型，保持已保存内容兼容。

布局校验使用旋转后的包围盒分离轴测试，减少斜放家具被轴对齐包围盒误判的问题；完整场景检查边界、承托面、落地、窗户避让和穿插。现在支持 `assets` 和 `type:"custom"` 生成库外素材，并以部件为单位校验阁楼、楼梯、电视及摆件；库内家具与自建素材均可通过 `parent/surface` 放在真实承托面上。协议、预算和验证见 [房间素材创作与布局](room-generated-assets.md)。暂未实现自动通道规划、精细网格碰撞、非矩形外壳和精确照片/纹理重建；自建门板、隔断不等于主墙真实开口或建筑工程能力。模型产生无效布局时持续修复，原房间保留到新方案通过检查并保存。

页面新增“试试双人书房”和“试试四人餐厅”。已有方案保留历史摘要，重新生成后才使用新协议。

接口为本地开发准备，尚无用户鉴权、持久化配额或跨进程限流；收礼者模式是界面限制。部署到公网前需要接入用户和服务端额度控制。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

`npm test` 包含 MiMo 协议 mock 测试：结构/边界/重叠校验、修正重试、默认房间不变、输入限制、同源检查、并发控制和错误不泄露密钥。

扩展测试：`scripts/check-room-flexible.cjs` 验证重复实例、单人床、配色、大小房间、米制窗户、纪念物排布、旋转碰撞及新旧持久化；模型测试检查所有家具最小/默认/最大尺寸的实际网格包围盒与 GPU 释放。`scripts/check-room-flexible-browser.cjs` 验证新增示例、保存/刷新/导出、物品特写和桌面/手机布局。

真实调用（消耗额度，不在 `npm test` 内）：设置 `ROOM_URL` 后，运行 `node scripts/check-room-flexible-live.cjs` 或添加 `--dining`。结果保存在忽略目录 `.room-qa/flexible-{study,dining}-live.json`。

2026-11-07 扩展验证：类型检查、全部状态/模型测试、生产构建与新旧浏览器回归通过；真实 MiMo 双人书房一次通过（约 7.3 秒），材质规则修正后的四人餐厅一次通过（约 11.8 秒，程序修正一件贴墙家具）。早期餐厅调用曾在两次设计后仍未通过校验；现已在完整校验前适配轻微贴墙误差，复杂碰撞等问题仍可能失败。截图已检查桌面 1440px、手机 390px，另验证 320px 无横向溢出。

扩展前回退点：本地提交 `6850d7d`，标签 `checkpoint/room-agent-before-expansion-20261107`，包含开始修改前已存在的项目代码；不含被 Git 忽略的 `.env.local`、依赖、构建产物和浏览器本地数据。

浏览器脚本使用既有 Playwright，设置 `NODE_PATH`、`ROOM_URL`、`ROOM_CHROMIUM` 后运行 `node scripts/check-room-agent-browser.cjs`。覆盖生成、失败保留、非法响应、取消、刷新恢复、导出、信件/CD、手机宽度、收礼者无编辑入口及保存失败。截图写入 Git 忽略的 `.room-qa/`。

真实 API 检查会消耗 MiMo 额度，不包含在 `npm test` 中。先运行 `npm test` 生成临时编译文件，启动已配置密钥的服务，然后运行：

```powershell
$env:ROOM_URL = 'http://127.0.0.1:3100'
node scripts/check-room-agent-live.cjs
# 验证卧室、床/书桌/椅子、双窗、移除起居室家具：
node scripts/check-room-agent-live.cjs --bedroom
```

通过时仅输出模型、耗时、调用次数、token 用量和设计摘要；完整方案保存在忽略目录 `.room-qa/agent-live.json`。

2026-11-07 验证：类型检查、生产构建、全部状态测试、房间 Agent 浏览器回归和原有 3D 镜头/物品回归通过。真实 `mimo-v2.6-pro` 接口调用与浏览器端到端调用均一次通过校验，分别约 11.5 秒和 47.6 秒。已检查实际生成方案的桌面与手机截图，并确认密钥未进入客户端构建产物。

卧室扩展验证：新增家具真实几何、窗洞内无墙面三角形、窗下墙体保持实心、纪念物转移到书桌、桌/柜/书桌单承托面、窗洞越界/重叠拒绝、GPU 释放均通过。真实 MiMo 双窗卧室调用约 31.9 秒，含一次修正；结果有床、书桌、椅子和两扇窗，无沙发、茶桌、矮柜，`limitations` 为空。
