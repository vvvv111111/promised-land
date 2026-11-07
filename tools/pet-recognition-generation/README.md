# 宠物识别与生成

输入一张猫狗照片。MiMo 识别外观并判断体型，优先用原猫或狗模板生成毛色 GLB。只有头身、躯干或四肢比例无法近似，才考虑四款同物种备选。备选输出原模型与预览，保留其原有毛色和静态姿态。

需要 Python 3.10+、Chrome 和本机的宠物素材库。默认读取 D:\应许之地_宠物素材。通过 --library 可指定其他位置。库中应已有 outputs/PetStudio 和 outputs/Pet_Model_Selection。Git 中存放 Agent 代码，原始 FBX 和备选 GLB 从本地库读取。

在此目录运行：

```powershell
python -m pip install -r requirements.txt
python -B -X utf8 agent.py "D:\照片\小猫.jpg"
```

密钥从 MIMO_API_KEY 读取，或在本机隐藏输入。默认使用 mimo-v2.6-pro，可通过 MIMO_MODEL 设置。指定 --receipt 可用同一张照片的已保存识图回执重放，结果标记为 replay。

结果写入素材库的 Runs 目录，每次创建独立子目录。主模板产出 pet.glb 和正面、侧面、整体预览，仍受原模型形体、眼色和毛长限制。备选产出 pet.glb 与一张预览。素材匹配结果和调用凭据之外的识图信息保存在 JSON 中。
