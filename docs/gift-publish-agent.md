# 最简礼物打包 Agent

完成页点击“下载礼物包”，浏览器执行固定流程：收集已保存礼物 → 从 IndexedDB 取出宠物和音乐 → 校验 → 生成 ZIP。无需再次调用 MiMo，不修改已保存数据，不上传照片或音频。

入口为 `GiftPackageButton.tsx`，流程为 `src/gift/publish/agent.ts`。`package.ts` 校验完整礼物并压缩，`template.ts` 与 `viewer.ts` 提供独立只读收礼页面。这里采用确定性任务流程，不添加额外的模型决策。

## 包内内容

- `index.html`：礼物数据、完整房间配置、内嵌宠物 GLB、照片、取景、信件、回忆、昵称及可选音乐。
- `viewer.js`：与编辑器共用的 Three.js 房间渲染、灯光、实测宠物尺寸及物品特写。
- `THIRD_PARTY_NOTICES.txt`：Three.js 许可。
- `README.txt`：查看和部署说明。

宠物模型从摘要引用解析为完整二进制；包内不依赖原浏览器的 IndexedDB 或 localStorage。保留房间节点的位置、朝向、尺寸和毛色记录。缺少模型、音频读取失败、礼物在打包期间变化、程序文件版本不匹配时明确报错，不下载残缺包。

## 查看和上线

解压后用支持 WebGL 2 的现代浏览器打开 `index.html`。本机 Chrome 已验证直接以 `file://` 打开。也可将包内全部文件放进静态托管目录，访问该目录的 `index.html`；支持子目录，不依赖本站路由、CDN、API 或生成服务。

收礼者可以旋转缩放房间、点击物品、查看照片和信件、手动播放音乐、开关台灯；查看相框、信件、CD 机后解锁回忆。没有编辑或生成入口。收礼进度只在当前页面内存中保留，刷新重新探索。

这是手动上传的静态快照，不自动绑定域名、上传云端或生成公网链接；更新礼物需要重新下载并替换发布文件。包内包含礼物原文和媒体，没有访问密码或服务器鉴权。素材原有来源和许可保留在模型记录中。

## 构建与验证

`npm run build:gift-viewer` 使用 esbuild 将同一份渲染代码打为单文件浏览器程序，生成 `public/gift-viewer/`。该目录不提交 Git，`npm run dev`、`npm run build`、`npm test` 会自动生成。生产部署须带上构建后的 `public` 目录。打包使用 fflate；生成服务仍沿用原部署方式。

- `scripts/check-gift-package.cjs`：ZIP 完整性、相对资源、原数据不变、文本转义、非法媒体与运行时拒绝。
- `scripts/check-gift-package-browser.cjs`：真实 GLB 经 IndexedDB 保存后打包；位置、尺寸、音频字节、照片裁剪保持；缺失模型拒绝；全新浏览器禁用本地存储后通过静态子目录和 `file://` 查看；音乐、回忆、文字注入检查及桌面/手机截图。生成接口使用模拟响应，不调用 MiMo。
- `npm run typecheck`、`npm test`、独立目录的生产构建及原礼物流程浏览器回归。

本地 QA 包和截图在 `.room-qa/gift-package/`，包含测试文本，不作为用户正式礼物发布。
