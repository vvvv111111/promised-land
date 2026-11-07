# 应许之地

2.5D 私人定制数字礼物产品的基础项目。使用 Next.js、TypeScript、App Router 和 Phaser 3，目前仅包含首页和世界演示占位画布。

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
3. 演示页显示菱形地面和「Phaser 3 画布已加载」。
4. 点击「返回首页」，再进入演示页，确认画布正常加载且没有重复出现。

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
    WorldDemo.tsx               Phaser 浏览器端挂载和销毁
  game/
    createWorldGame.ts          Phaser 游戏配置
    scenes/WorldDemoScene.ts    演示场景
public/assets/                 后续房间素材目录
```

依赖版本由 `package.json` 和 `package-lock.json` 记录。Phaser 运行时代码仅在浏览器端动态导入。当前使用普通 CSS，未接入 AI、数据库或其他业务。

## 开发文档

- `今日待办_2026-11-06.md`：今天的任务顺序、准备事项和验收条件。
- `应许之地_开发节点表.html`：原始开发计划的本地副本。

GitHub 仓库：https://github.com/vvvv111111/promised-land

本地 Git 分支为 `main`，远程 `origin` 已配置为上述仓库。本次初始化不自动提交或推送代码。
