# 宠物 Agent 与房间合并

`/room-3d` 与礼物编辑页共用宠物入口，收礼页面没有编辑入口。上传一只猫狗的照片交给 MiMo 识别，再由本地 PetStudio 主模板生成毛色模型。已移除手动选模型功能。

入口位于编辑器的「宠物」页签，照片标为选填，使用「上传照片 / 更换照片」按钮，不显示原生文件控件的空文件提示。生成中隐藏生成按钮，显示状态和取消操作。结果先在房间里预览，与房间修改共用「保存 / 撤销」，不自动覆盖已保存方案。手机端固定画面与切换栏，操作时仍可查看组合效果。

房间与宠物可以分别启动、同时运行，生成期间仍可切换页签。两项任务各有取消和错误状态；结果按完成时的最新预览合并，重新检查落地和避碰，不用旧房间覆盖新结果。所有运行中的任务结束且组合预览加载成功后才能保存；单项失败或取消仍可保留另一项成功的预览。

当前本地库已包含 `PetStudio` 猫狗主模板、`Pet_Visual_Library` 外观索引与遮罩，以及四款静态备选模型。照片识别优先使用主模板生成毛色；体型明显无法近似时才匹配同物种备选。备选保留原有毛色和姿态，主模板生成也只近似支持范围内的外观。

已补入 `f45e4aa` 的两种分区毛色：白底棕斑猫 `bicolor_white`、黑背鞍白胸腿犬 `saddle_white`。已将用户提供的 `Pet_Visual_Library.zip` 导入 `.pet-library/outputs/Pet_Visual_Library`，其中 `library_manifest.json` 已包含匹配的 `regional_mask / PetStudio / runtime_pattern` 登记。猫的 7 张遮罩在 `Patterns/Cat/BicolorWhite/Masks`，狗的 6 张遮罩在 `Patterns/Dog/SaddleWhiteChestLegs/Masks`；已校验清单、图集尺寸、遮罩层列表及参考图 SHA-256。遮罩对应 `Masks/masks.json` 记录的原始 FBX 和 PetStudio 专用逐三角形 UV 图集，不能直接用于四款备选模型。

已将用户提供的 `PetStudio.zip` 导入 `.pet-library/outputs/PetStudio`，包含 `server.py`、`storage.py`、`web/regional-masks.mjs` 和猫狗源 FBX；557 个文件与压缩包内容一致，源 FBX 摘要与遮罩元数据匹配。当前 CLI 和 `GET /api/pet-agent` 均返回 `primaryAvailable=true`，并开放 `bicolor_white`、`saddle_white`。该运行时通过 `sampleRegions` 程序化计算分区并烘焙毛色；库中的 PNG 遮罩是同一分区图集的导出资源。

生成前后校验固定物种、主辅色及 `scale=1 / amount=0.5 / seed=0`，拒绝运行时静默改变参数。`appearance`、`regionalPreset`、`appearanceChanged`、`mappingLosses` 随模型经过预览、本机保存和底层嵌入导出工具；旧方案仍兼容。毛色的 `scale` 仅控制花纹，不改变实测尺寸、落地与避碰规则。两种分区毛色已通过真实渲染、GLB 导出及房间加载验证。

## 照片毛色匹配

照片生成优先使用 `photoCoat`：MiMo 记录身体底色、头/耳/背/体侧/胸腹/四肢/爪尖/尾等部位的毛色，以及最多 12 项带明确位置、面积、颜色的色块、虎斑或斑点。左右按宠物自身，无法看见的部位不应按品种推断。旧的七个 `appearance` 字段用于模板兼容；实际导出的照片毛色以 `photoCoat` 和内嵌贴图为准，不能再只靠随机种子解释照片中的花纹。

`photo-coat.mjs` 使用源 FBX 的骨骼权重与归一化坐标绘制；黑背在体侧底色之后绘制，白爪与整条白腿分离，深色宠物不会自动长出浅色腹部和口鼻，眼睛与鼻子仍受保护。代码通过 `studio_runtime.py` 为当前 PetStudio 提供经过版本检查的局部扩展，不改写素材库原件。`--capabilities` 返回 `photoCoatAvailable`，不兼容的运行时不会接收新的分区参数。

真实生成会在第一版渲染后再做一次 MiMo 视觉对照，输入为原照片和模型正面/侧面小图；只允许返回受限毛色数据，最多再绘制一次。纠正保留原始底色，优先采用原照片中头、背、胸、爪的主色锚点，不把已经观察到的虎斑或斑点改成整块实色。参数不合法时识别阶段最多修复一次。照片回执记录对照响应、初始及最终毛色，重放最终回执不会再次调用 MiMo。该机制增加接口用量与生成时间，保留任务取消和超时限制。

`photoCoat` 会经过 Web 接口、预览、IndexedDB 保存与方案重载，导出的 GLB 也包含同一份记录，服务端检查实际导出记录与请求一致。体型、姿态、毛发长度和精确背面纹理仍不能从单张照片重建，细碎斑块与边缘属于近似。

## 本地素材与运行

已将 `猫狗模型选样_4款.zip` 解压到 `.pet-library/outputs/Pet_Model_Selection`。原件不改动、不提交 Git，按模型来源清单保留许可文件。`npm run prepare:pets` 校验原件 SHA-256，生成 `Pet_Model_Selection_Room`：静态网格简化、UV/法线参与误差约束、16 位索引、最长 1024 像素的贴图。保留来源、原件摘要、派生摘要和实际面数。

四款派生模型分别约 1.23 / 1.86 / 1.12 / 2.28 MB，面数约 3.0 / 4.1 / 3.0 / 5.2 万。简化属于有损处理；原件始终保留。只对当前单网格静态素材使用此脚本，蒙皮或动画模型会明确拒绝。

服务端默认读取项目 `.pet-library`，Windows 优先使用 `pet-recognition-generation/.venv/Scripts/python.exe`。独立 Python 环境需要安装该目录的 `requirements.txt`；本机已准备。其他机器可设置：

```dotenv
PET_AGENT_LIBRARY=素材库根目录
PET_AGENT_PYTHON=Python 可执行文件路径
PET_AGENT_CHROME=Chrome 可执行文件路径
PET_MIMO_MODEL=可选，默认继承 MIMO_MODEL
```

项目服务统一使用 `.env.local` 中的 `MIMO_API_KEY`、`MIMO_BASE_URL`、`MIMO_MODEL`，以环境变量传给 Python，不放入命令行、响应或日志。直接运行 Python CLI 时，需自行提供环境变量；CLI 不自动读取 Next.js 的 `.env.local`。

## 物理尺寸和渲染

`petAsset.ts` 定义资产与输入预算。只接受单场景、自带网格和贴图的 GLB 2.0，最大 2.5MB；拒绝外部 URI 与需要额外解码器的压缩模型。`models/petGlb.ts` 读取实际渲染姿态的包围盒，统一坐标轴、等比例缩放，水平居中并把最低点设为零。默认 Y 轴向上，数据协议兼容 Z 轴向上。

界面不再提供占地和朝向控件。新宠物使用默认尺寸，替换已有宠物时保留其已存尺寸与朝向；落地、避碰由程序处理。模型使用房间的灯光、环境、曝光和阴影。静态备选保持原贴图与 PBR 材质，其写实风格不会自动变为家具的卡通风格。没有宠物动画或互动。

`composePet.ts` 使用实测宽高深、旋转后的包围盒和现有空间校验，检查墙界、地面、家具与自定义几何。预留约 8cm 间距；地毯内完整放置时按毯面落脚，拒绝横跨毯边。重新生成房间时，保留宠物资产、明确设置的尺寸和朝向，先尝试旧位置，再寻找新位置。没有可用位置就保留当前房间并提示调整，不删掉宠物或暗中缩小它。

碰撞采用保守包围盒，自定义家具使用部件碰撞；不等于精确网格碰撞，也没有全房间通路规划。加载时再次测量模型，拒绝与保存尺寸不一致的资产。异步加载失败有明确提示，加载取消或替换时释放几何、材质、贴图和骨骼资源。

## 本机保存

浏览器将模型二进制按 SHA-256 存入 IndexedDB `promised-land:pet-assets:v1`，房间 JSON 保存尺寸、朝向、来源和模型摘要。模型不会占满原有 localStorage；礼物照片、信件、音频保持各自的存储规则。存储失败保留已提交的房间，展示未保存状态并可重试。

编辑器已移除「更多」及导出入口，房间和宠物通过「保存」留在本机。底层仍保留完整 GLB 数据的协议与嵌入工具，目前界面没有通用方案导入入口。清理站点数据会删除本机模型，需重新选择。当前仍是本地 Demo，没有跨设备分享服务。

## 接口与任务生命周期

`GET /api/pet-agent` 检查环境；`POST {image}` 返回 202 和任务 ID；`GET ?id=…` 查询结果；`DELETE ?id=…` 取消。`POST {templateId}` 已移除并返回 400。主模板可独立使用，四款备选库是照片识别后的可选自动回退，不再是主模板生成的必需依赖。写操作使用与房间接口一致的同源校验和有界请求体；不接受任意文件路径或远程资产 URL。

同一服务进程只执行一个生成任务，240 秒超时；Windows 取消会终止 Python 及其 Chrome 子进程。每次生成使用独立临时目录，结束后删除照片和中间结果。任务结果在进程内最多保留 30 分钟，下一次创建任务时清理过期记录；服务重启后需要重试，不恢复后台任务。此实现面向本地长驻 Node.js 服务，不适用于请求结束即冻结进程的 Serverless 环境。

## 验证

照片对照回归使用五张公开真实照片：黑白燕尾服猫、三花猫、橘虎斑猫、三色比格犬及斑点犬。识别与视觉对照使用真实 MiMo；修正后的批量渲染可用回执离线重放。测试记录和对照页位于本机 `.room-qa/pet-coat-qa/`，照片来源与许可写入样本清单，不提交用户照片或密钥。

`pet-recognition-generation/check_photo_coats.py --samples 清单.json --output 输出目录` 必须显式选择 `--live`（实际调用接口，密钥从环境读取）或 `--replay 回执目录`（重放 `id-receipt.json`，不调用模型）。清单为含 `id`、本地 `photo`、`source`、`license` 的 JSON 数组；输出包含独立 GLB、多视角图、结果参数和 HTML 对照页。

- `npm run typecheck`、`npm test`、独立构建目录的 `npm run build`。
- `npm run test:pets`：Python 离线能力/参数/模拟导出测试，以及尺寸、坐标轴、落地、避碰、无空间回退、房间重生成、元数据持久化、非法输入与异步释放。
- PetStudio 本地接入检查：使用明确标记的离线识别回执，走真实 Python/Chrome 毛色烘焙和导出；白棕猫 GLB 为 1,026,048 字节，背鞍白腿犬为 1,048,772 字节，均低于 2.5 MB。再以实际导出的 GLB 替代浏览器测试中的识别响应，验证房间实测尺寸、落地、IndexedDB 保存、分区元数据和重载渲染；未调用 MiMo。报告与截图保存在 `.room-qa/pet-studio`。
- `node scripts/check-pet-agent-browser.cjs`：使用已有 Playwright 与本机 Chrome，设置 `ROOM_URL`；选填照片上传、原生文件提示与手选入口移除、自动尺寸与朝向、四款真实 GLB 夹具、IndexedDB、房间重生成、本机已保存方案的收礼渲染、保存失败重试、收礼只读、手机与桌面截图。房间和照片识别使用模拟响应，不产生 MiMo 调用费用。
- `node scripts/check-room-pet-concurrency-browser.cjs`：控制两项任务的开始及完成顺序，检查独立取消/失败、运行中移除宠物、保存锁定和组合方案重载；使用模拟响应，不调用 MiMo。
- 实际 Python 离线回执检查与真实 MiMo 识别已使用本地公开猫模型预览图验证；真实调用结果与重放明确区分，不上传私人照片。
- `PET_AGENT_LIVE=1 node scripts/check-pet-photo-live-browser.cjs`：一次真实 MiMo 调用，使用项目自带猫图片，验证新版 PetStudio 毛色 GLB、房间放置、本机保存和刷新。实测生成 `original_cat`，GLB 1,161,000 字节；报告和桌面/手机截图在 `.room-qa/pet-photo`。

并行检查已有 `.next` 服务时，可设置 `NEXT_DIST_DIR=.next-pet-qa`，使用独立构建目录和端口。
