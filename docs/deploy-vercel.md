# Vercel 容器部署

网站、房间 Agent、宠物 Agent 使用同一个 Container 项目。`Dockerfile.vercel` 包含 Next.js standalone、Python 虚拟环境、Chromium 与 PetStudio 运行素材；公开网站不依赖开发电脑持续在线。

Vercel Container Runtime 当前为 Beta，可见 [官方说明](https://vercel.com/docs/functions/runtimes/container)。需要在实际账号中完成云端构建和功能验证，不能以本地 Next 构建通过代替容器验收。

## 准备

1. `npm ci`，配置本地已有的 PetStudio 素材。
2. `npm run prepare:vercel`：只复制运行时代码、猫狗 FBX、分区清单和四款轻量 GLB 到 `.deploy-assets/`，并记录摘要。不复制素材库的密钥、用户照片、生成结果或评测记录。
3. `npm test`、`npm run build`。容器构建会自动启用 standalone，普通本地构建维持原方式。
4. 将必要部署适配提交到 main。`node scripts/stage-vercel-release.cjs` 从已提交 HEAD 生成隔离的发布目录，加入经过校验的私有运行素材和本地项目绑定。发布目录在 `.room-qa/`，不提交 Git；未提交的页面改动不会混入发布。

## 项目配置

项目框架选择 `container`，使用 `Dockerfile.vercel`。生产/预览运行环境配置 `PORT=3000`、`MIMO_API_KEY`、`MIMO_BASE_URL`、`MIMO_MODEL`；可选 `PET_MIMO_MODEL`、`MIMO_ROOM_THINKING`。密钥应从 stdin 写入 Vercel Secret 环境变量，不能放入命令行、Dockerfile、上传目录或日志。

容器默认使用 `PET_AGENT_TRANSPORT=request`、`ROOM_AGENT_TRANSPORT=request`：房间自动修复和宠物生成在发起请求的实例内完成，返回最终结果，避免轮询命中另一实例。页面仍能分别启动两项任务。请求取消会停止本次宠物生成，Linux 终止 Python/Chrome 进程组，临时照片和中间结果写入 `/tmp` 并清理。普通本地运行仍采用原有轮询/持续修复协议。

PetStudio 的已校验导出也重定向到本次任务的 `Variants` 子目录，不写入素材库；这使容器中的只读素材可复用，并避免共享生成记录。

Vercel 实例可缩容，生成过程不跨实例或重启恢复；未完成时需要重试。礼物仍按原功能保存在访问者浏览器，并可下载完整只读礼物包；本次没有把个人礼物改为云端数据库存储。

## 发布

在隔离发布目录运行 Vercel CLI，先用 `--dry --json` 核对 Container 框架及上传列表，再发起预览部署。通过首页、角色路由、真实房间/宠物生成与取消、组合保存、礼物打包检查后，再将该版本部署/提升到 Production。

生成素材未提交 Git，因此后续不能仅依靠 GitHub 自动构建：每次发布须准备并上传同版本 `.deploy-assets/`。原始素材库只在生成器中使用，不放进 public。

## 检查

- `scripts/check-deployment.cjs` 覆盖请求保持、最终结果、无跨实例轮询、失败脱敏、取消清理、原本地轮询兼容。
- 房间状态回归覆盖 Container 请求模式中的多轮自动修复。
- `npm run prepare:vercel` 的约 32MB 运行素材已通过本机 Python/Chrome 离线回执的真实毛色烘焙及 GLB 导出；该项不等于 Linux 云端验证。
- 容器以非 root 用户运行；Chrome 包装脚本关闭浏览器自身 sandbox，并使用容器隔离与软件渲染，避免依赖宿主机 GPU。
