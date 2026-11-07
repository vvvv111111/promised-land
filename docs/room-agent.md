# 房间 Agent · MiMo

入口：主流程 `/gift/edit` 和独立工作台 `/room-3d`。赠送者可输入文字需求，选择起居室或卧室家具、配置窗洞，生成配色、布局和光照。收礼页 `/gift/room` 或独立页 `?mode=recipient` 只展示房间与已有交互。

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

`文字描述 → POST /api/room-agent → MiMo JSON 输出 → 设计契约及布局检查 → 编译 RoomDefinition → 既有房间校验 → Three.js`

- `src/room/agent/design.ts`：小型设计契约、输出解析、家具边界/重叠检查、编译完整房间数据。
- `src/room/agent/prompt.ts`：模型能力、字段、尺寸和摆放约束。
- `src/room/furnitureCatalog.ts`：可选家具的真实模型、占地和承托面尺寸。
- `src/room/architecture.ts`、`models/architecture.ts`：窗洞校验和按洞口分段构造的真实墙体。
- `src/room/models/bedroom.ts`：床、书桌、椅子、床头柜、书架和衣柜几何。
- `src/lib/server/roomAgent.ts`：服务端鉴权、调用、90 秒总超时、最多一次校验修正、安全错误映射。
- `src/app/api/room-agent/route.ts`：状态检查与生成路由；输入最多 2000 字、请求体最多 12000 字节，拒绝跨站请求，单进程最多两个并发生成。
- `src/components/room3d/RoomAgentWorkbench.tsx`：需求表单、取消、错误恢复、本机保存、JSON 导出和运行记录。

模型决定材质颜色、家具选择及 x/z/朝向、左墙/后墙窗洞和有限的光照参数。程序从本地模型库编译完整定义；模型不能注入代码、远程素材、模型工厂或交互绑定。家具数组中省略的原家具会移除，新增的受支持家具会实际创建网格。CD/信封优先放在茶桌或书桌，台灯优先放在柜子；仅有一个合适承托面时，会缩放桌面物品并按独立槽位摆放。相框挂在实墙上，优先位于低家具上方，避让窗户、窗框及高柜。照片、信件和音频继续由原有 GiftStore/IndexedDB 提供，不发送给 MiMo。

每次生成以默认房间和本次完整文字需求为输入，没有多轮聊天记忆。模型说明中的 `limitations` 在界面显示未实现的需求。模型输出非法或截断时最多要求重新生成一次；鉴权、限流和网络错误直接返回，不使用固定模板冒充生成成功。

独立工作台的成功方案保存在 `promised-land:room-agent:v1`。读取时重新解析设计并编译，忽略保存对象里的完整 `definition`，避免将被篡改的场景直接交给渲染器。主流程编辑页则通过 `saveRoomLocked` 将经过校验的 `RoomDefinition` 合并进当前礼物，保留其最新相框、信件和表单内容；预览与收礼页从同一礼物读取，不依赖工作台全局方案。只有制作动作在礼物尚无房间时显式采用已有独立方案，初始化不会覆盖房间。

保存失败仍可预览生成候选并导出，明确显示未保存；主流程的完成/礼物预览入口会被阻止。生成失败或取消保留上次房间。独立工作台恢复默认会清除本机方案，主流程恢复默认只更新当前礼物的房间。JSON 导出包含设计、房间定义、运行 ID、模型、总耗时、调用次数和 token 用量，不含密钥或模型推理内容。

## 当前范围

家具库包含沙发、茶桌、矮柜、落地植物、地毯，以及床、书桌、椅子、床头柜、书架和衣柜。每种最多一件，可按需求增删组合。必须保留至少一张书桌/茶桌/矮柜承托纪念物，不能输出空房间或只放床而让纪念物悬空。床的宽度固定约 1.8m，尚不支持任意尺寸。

支持左墙、后墙合计 0–4 个矩形窗洞，每面墙最多两扇；窗宽/高、离地高度和位置可配置。窗框、窗台、窗棂、玻璃由本地几何生成，墙体在窗洞处真正留空。自定义窗户时会移除依赖旧墙体坐标的窗边植物和时钟，避免悬空。旧方案未提供 `architecture` 时继续用原墙体，兼容原本保存的起居室。暂不支持门、任意房型、照片重建或模型库以外的新家具。

设计阶段按旋转后的俯视轴对齐包围盒检查墙体边界与家具间距；完整房间再经空间校验，检查模型包围盒、承托面、落地和穿插。检查可能保守拒绝可用的旋转摆放，尚不覆盖行走可达性或家具与窗台/窗棂之间的精细碰撞。

截图中旧版的“无法新增/删除模型”“无法新增窗户”来自上一版契约与提示词的限制，现在已扩展为上述能力。已保存的旧方案保留历史摘要与限制；更新服务并刷新页面，点击“试试双窗卧室”重新生成即可验证。

接口为本地开发准备，尚无用户鉴权、持久化配额或跨进程限流；收礼者模式是界面限制。部署到公网前需要接入用户和服务端额度控制。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

`npm test` 包含 MiMo 协议 mock 测试：结构/边界/重叠校验、修正重试、默认房间不变、输入限制、同源检查、并发控制和错误不泄露密钥。

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
