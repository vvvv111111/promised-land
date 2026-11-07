# 应许之地房间与本地相册交付

2026-11-07，北京时间。

## 审查与范围
实际主仓库：D:\应许之地，基线提交 6f16ec2，开始时工作区干净。Next 16.4.5、TypeScript 7.0.2、Phaser 3.90.0。原 /world-demo 仅有菱形占位地板，无物品交互、相册或存储接口。保留首页、布局、Phaser 动态加载和游戏创建入口，无迁移、无无关重构、无依赖变更。

另一个素材/旧 Python 仓库位于 C:\Users\52685\Documents\ChatGPT\应许之地。读取了其共享状态与交接，复用 normalized-v003 的现有 PNG，而非重新生成图像。没有调用图像生成、没有声称生成 Blender/真实 3D 源工程。

## 改动文件（相对主仓库）
- src/game/room.json：完整背景、5 个可用素材条目、4 个承载区域、4 个实例；记录原图 alpha 边界、底部中心锚点、表面多边形、深度层和校准状态。扶手椅作为库存保留，避免拥挤，未实例化。
- src/game/placement.ts：物品类别与承载面匹配，接触点及两侧接触范围必须在区域内。贝壳、相册、信件只允许 table/shelf，小猫、椅子只允许 floor。不是完整碰撞/物理系统；复杂物品需专门接触轮廓。
- src/game/scenes/WorldDemoScene.ts：等比背景、素材 alpha 锚点、表面深度排序、透明像素点击（阈值128）、故事/相册事件、校准区域开关；场景销毁移除监听。
- src/components/world/WorldDemo.tsx：场景与 React 相册桥接、故事提示和相册入口。
- src/components/world/Album.tsx：选择、预览、确认保存、相册展示、读取与删除；释放临时图片 URL；错误与忙碌状态。
- src/lib/photos.ts：PhotoStore 接口与 IndexedDB 本地实现；提交事务完成才视为保存成功。
- src/app/world-demo/page.tsx、src/app/globals.css：更新场景说明与相册响应式样式。
- public/assets/normalized-v003/：复用现有素材及来源清单。其原始 manifest 中历史“未找到 Phaser”状态为旧素材交付记录；本轮运行配置以 src/game/room.json 为准。
- placement.test.cjs：9项摆放约束断言；生成的 .placement-test 为临时产物，不需提交。

## 照片与隐私
仅接受 JPEG/PNG/WebP，8MB 文件上限，验证 MIME 与魔数，解码后拒绝超过2400万像素；缩至最长1600像素并重编码JPEG以移除原始元数据。最多12张，预览后由用户确认保存。照片存于当前来源的 IndexedDB，不进入 public、不请求外部服务。相册入口暂用已有相框素材；照片显示在打开后的相册面板，尚不投影到相框画面。

这是浏览器本地持久化，未配置云存储或账户，不是加密保管箱；同一浏览器来源可访问，清除网站数据会丢失。本版无跨设备、礼物链接照片共享、多用户隔离。更换端口也会使用不同本地存储。

## 本轮实测
- 锁文件安装成功，依赖审计0漏洞。
- tsc --noEmit 通过；最终 next build 通过，/ 与 /world-demo 静态页面生成成功。
- node placement.test.cjs：9项通过，包括纪念物禁止落地、区域外位置、过宽接触范围和未知物品拒绝。
- Edge/Playwright 实测：图片选择→预览→确认保存→刷新后仍可读取→删除通过；伪造 PNG 内容被拒绝；页面脚本错误0。
- 已检查桌面1200px、手机390px截图；调整贝壳以避开背景茶杯。仍保留 draft-visual-review-required 状态，未代替用户审美验收。表面位置为屏幕空间手工标定，并非真实3D坐标。
- 首次构建受目录权限限制，关闭构建遥测并在允许环境重试后通过；首次浏览器测试受进程/网络隔离限制，在同一允许环境重试通过。

## 启动与后续
主仓库安装锁定依赖后运行 npm run dev，进入 /world-demo；可参考本轮本机预览 http://127.0.0.1:3129/world-demo（当前会话运行，非部署）。验证命令：npm run typecheck、npm run build、node placement.test.cjs。

下一步：视觉确认表面区域与小屏点击体验；完善缩放、家具遮挡/跨表面移动时的排序；如需真实翻页相册造型，再制作相册专用素材。生产存储需要选定服务并配置服务端凭据、登录/相册所有权校验、私有桶、短时签名访问、服务端独立文件校验、配额及删除策略；替换 PhotoStore 实现，禁止将密钥放进客户端。本轮未实现或伪造上述远端能力。
