# 宠物识别与生成

输入一张猫狗照片。MiMo 识别外观并判断体型，优先用原猫或狗模板生成毛色 GLB。只有头身、躯干或四肢比例无法近似，才考虑四款同物种备选。备选输出原模型与预览，保留其原有毛色和静态姿态。

需要 Python 3.10+、Chrome 和本机的宠物素材库。优先读取项目 `.pet-library`，否则使用 `D:\应许之地_宠物素材`；通过 `--library` 可指定其他位置。`outputs/PetStudio` 提供主模板，可独立生成毛色。`outputs/Pet_Model_Selection` 为可选的同物种体型回退；若存在 `Pet_Model_Selection_Room`，优先使用轻量派生版本。项目接入说明见 [宠物 Agent](../docs/pet-agent.md)。

在此目录运行：

```powershell
python -m pip install -r requirements.txt
python -B -X utf8 agent.py "D:\照片\小猫.jpg"
```

密钥从 MIMO_API_KEY 读取，或在本机隐藏输入。默认使用 mimo-v2.6-pro，可通过 MIMO_MODEL 设置。指定 --receipt 可用同一张照片的已保存识图回执重放，结果标记为 replay。

结果默认写入素材库的 Runs 目录，`--output-dir` 可指定其他根目录，每次创建独立子目录。主模板产出 pet.glb 和正面、侧面、整体预览，仍受原模型形体、眼色和毛长限制。备选产出 pet.glb 与一张预览。素材匹配结果和调用凭据之外的识图信息保存在 JSON 中。

## 照片毛色分区更新

照片识别额外输出 `photo_coat`，包含受限的身体区域颜色和最多 12 个定位色块/条纹/斑点。`photo-coat.mjs` 与 `studio_runtime.py` 将这些数据烘焙为自带贴图的 GLB，不改写外部 PetStudio 或源 FBX。旧七字段外观参数仍用于模板校验；新照片结果不依赖随机花纹位置。

真实生成含一次原照片与正面/侧面预览的视觉对照，必要时重绘一次；识别参数无效最多修复一次。回执保存最终分区及对照记录，`--receipt` 重放时不调用模型。缺少兼容 PetStudio 时新分区能力关闭；运行 `agent.py --capabilities` 可检查 `photoCoatAvailable`。

`check_photo_coats.py --samples samples.json --output 目录 --live` 执行真实照片回归，需通过环境变量提供 MiMo 配置；`--replay 回执目录` 离线重放。清单项含 `id`、本地 `photo`、`source`、`license`，输出包含 GLB、正面/侧面预览与 HTML 对照页。两种模式必须显式选择，避免误触发接口用量。
