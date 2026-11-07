# 应许之地

2.5D 私人定制数字礼物产品。使用 Next.js、TypeScript、App Router 和 Phaser 3，包含首页和由 JSON 驱动的可交互房间 Demo。

## 启动

环境要求：Node.js 20.9 或更高版本、npm。

在本目录打开终端，执行：

```powershell
npm install
npm run dev
```

浏览器打开 http://localhost:3000。若 3000 端口被占用，以终端输出地址为准。

## 检查运行结果

1. 首页显示「应许之地」和「进入世界演示」入口。
2. 点击入口或直接打开 http://localhost:3000/world-demo。
3. 演示页显示真实暖色房间、猫咪、扶手椅和三件纪念物；点击物件与背景里的书架、边桌、台灯可查看介绍。
4. 贝壳、相框、信封均可反复点击：贝壳显示介绍，相框与信件打开专属弹窗。物体保持原本外观，不显示收集进度或标记。
5. 调整浏览器窗口，确认物体与背景对齐。也可展开「用按钮探索房间」进行键盘操作。
   按住猫咪、扶手椅或纪念物拖动可调整摆放；位置会保存在当前浏览器。点击「恢复默认摆放」返回 JSON 位置，不改变已保存的照片和信件。
6. 点击「返回首页」，再进入演示页，确认画布正常加载且没有重复出现。

## 构建检查

```powershell
npm run build
```

类型检查可单独执行 `npm run typecheck`。构建通过后，可以用 `npm run start` 启动生产服务。

## 目录

```text
src/
  app/
    globals.css                 全局样式
    layout.tsx                  根布局和页面元信息
    page.tsx                    首页 /
    world-demo/page.tsx         世界演示 /world-demo
  components/world/
    WorldDemo.tsx               Phaser 挂载销毁、介绍面板和内容弹窗
  game/
    createWorldGame.ts          Phaser 游戏配置
    scenes/WorldDemoScene.ts    数据驱动场景、点击、拖动和遮挡
  world/
    types.ts                   配置、素材和运行状态类型
    asset-manifest.json        统一运行素材索引
    demo-world.json            可编辑测试房间
    config.ts                  配置加载和运行时校验
    RoomSession.ts             可重复触发的物品介绍状态
public/assets/                 队友原始视觉素材（保留）
scripts/check-room-state.cjs    状态与配置校验测试
scripts/check-room-browser.cjs  可选浏览器验收（需已有 Playwright）
docs/room-demo.md               素材审计、配置规范、验收说明
```

依赖版本由 `package.json` 和 `package-lock.json` 记录。Phaser 运行时代码仅在浏览器端动态导入。当前使用普通 CSS，未接入 AI、数据库或其他业务。

房间配置、新增物体方法和测试结果见 [房间 Demo 开发说明](docs/room-demo.md)。

相框与信件支持专属弹窗：默认赠送者模式可上传/更换照片、调整取景和编辑正文；编辑自动保存，也可点「保存编辑」。点击「预览收礼者模式」只读查看。礼物内容按 `gift_id` 保存在当前浏览器的礼物配置中，刷新或关闭弹窗后恢复。详见 [礼物内容说明](docs/gift-content.md)。

## 开发文档

- `今日待办_2026-11-06.md`：今天的任务顺序、准备事项和验收条件。
- `应许之地_开发节点表.html`：原始开发计划的本地副本。

GitHub 仓库：https://github.com/vvvv111111/promised-land

本地 Git 分支为 `main`，远程 `origin` 已配置为上述仓库。本次初始化不自动提交或推送代码。
