# 第一版素材驱动房间

## 素材审计

已递归检查 `public/` 与项目文件清单，目前实际视觉素材均在 `public/assets/warm-room-v1/`。六张 PNG 均可解码，尺寸均为 **1536×1024，比例 3:2**。

| asset_id / 文件名（加 .png） | 类型 | 模式 | 完全透明像素数 | Alpha 非零范围（左、上、右、下） |
| --- | --- | --- | ---: | --- |
| room_warm_01 | 背景 | RGB | 0 | 无透明通道 |
| armchair_sage_01 | 家具 | RGBA | 1064886 | 31,19,1506,959 |
| cat_orange_01 | 宠物 | RGBA | 1213913 | 0,30,1480,1024 |
| memory_shell_01 | 纪念物 | RGBA | 1090911 | 0,20,1514,1024 |
| memory_frame_01 | 纪念物 | RGBA | 1019228 | 0,41,1508,989 |
| memory_letter_01 | 纪念物 | RGBA | 985618 | 0,0,1442,1024 |

右、下为 Pillow 包围盒的排他边界。五张独立 PNG 的 Alpha 极值均为 0～254，是真透明而非棋盘格底图。少量边缘残余像素使 Alpha 包围盒偏大，不能把包围盒当成物体主体的精确轮廓。已预览整套图及实际房间叠放：背景含固定书架、边桌、台灯；独立图分别为橘白猫、浅绿扶手椅、贝壳、日落相框、信封。

原始素材、原 manifest、提示词和队友预览页均不改动。物体始终使用各自独立 PNG，不合成进背景。

## Asset Manifest

运行清单为 `src/world/asset-manifest.json`，沿用原素材 ID，但补充运行信息，避免覆盖队友的素材审计清单。

```json
{
  "asset_id": "cat_orange_01",
  "path": "/assets/warm-room-v1/cat_orange_01.png",
  "type": "pet",
  "width": 1536,
  "height": 1024,
  "has_alpha": true,
  "alpha_bounds": [0, 30, 1480, 1024],
  "default_anchor": { "x": 0.5, "y": 1 },
  "default_size": { "width": 0.17 }
}
```

`type` 为 `background | pet | furniture | memory`。`path` 从 public 根目录对应的 URL 开始。像素尺寸为原图尺寸。默认锚点相对完整 PNG；`default_size.width` 是建议使用的背景宽度比例。房间中每件物体通过 `size.width` 明确指定实际显示宽度，可复制素材建议值。

## WorldConfig

`src/world/types.ts` 定义类型，`config.ts` 校验测试房间 `demo-world.json`。

- version、world_id、background_id：版本、房间身份、背景素材 ID。
- objects：object_id、asset_id、type、position_x/y、size.width、可选 anchor、visible、clickable、可选 draggable、可选 content_type、interaction。
- hotspots：hotspot_id、furniture_name、左上角 position_x/y、width/height、interaction。
- interaction：title、description，按纯文本显示。
- content_type：photo_frame 或 letter，关联礼物配置，详见 [礼物内容说明](gift-content.md)。

坐标、锚点和大小相对背景归一化为 0～1，左上角为原点。物体位置指锚点，热区位置指矩形左上角。物体宽度相对背景宽度，热区高度相对背景高度。背景采用原图逻辑画布并 FIT 等比适配窗口，物体统一等比缩放，按 Y 深度遮挡。

固定家具热区在独立物体后面。点击只命中 Alpha ≥32 的像素，透明留白能点击到背景家具；背景、物体、热区使用同一个坐标系。

## 点击交互

已停用纪念物收集模式。猫咪、扶手椅、贝壳、固定家具显示介绍，相框与信件打开专属内容弹窗。所有物体可反复点击，不变淡、不隐藏、不变色，不显示收集标记、进度和清单。

`RoomSession` 仅生成物品介绍，不读写浏览器存储。旧版 `promised-land:collection:<world_id>` 数据不再读取，不影响物品显示与点击，无需用户清理浏览器。照片、信件正文、摆放位置仍分别保存。

## 拖动摆放

已增加真实地板四边形、桌面支撑、占地防穿插和固定家具遮挡，详见 [物理摆放与投影](placement.md)。物体深度按实际底部接触点排序；配置了 placement 的房间使用支撑面边界，不再按整个画布矩形自由摆放。

赠送者可以用鼠标或触摸拖动独立物体；draggable 为 false 时禁止移动。轻点触发内容，移动超过 7 像素视为拖动。物体留在背景内，并实时更新 Y 遮挡顺序。收礼者不能拖动。

`RoomLayout` 保存到 `promised-land:layout:<world_id>`，刷新恢复。JSON 默认位置、尺寸、锚点或素材变化时，对应旧摆放自动失效。「恢复默认摆放」不影响照片与正文。书架、边桌、台灯已画在背景中，只能点击，不能独立移动。

## 通过 JSON 新增物体

将新独立素材放到 public/assets 的新路径，在运行 manifest 登记，然后向 objects 追加：

```json
{
  "object_id": "second-cat",
  "asset_id": "cat_orange_01",
  "type": "pet",
  "position_x": 0.72,
  "position_y": 0.80,
  "size": { "width": 0.15 },
  "visible": true,
  "clickable": true,
  "interaction": { "title": "另一位小伙伴", "description": "喜欢陪你看窗外。" }
}
```

保存后刷新即可，不需要修改 Scene。position_x/y 控制位置，size.width 控制大小。不要覆盖队友素材。

## 验证

```powershell
npm run typecheck
npm run build
node scripts/check-room-state.cjs
node scripts/check-gift-state.cjs
```

浏览器脚本使用已有 Playwright；NODE_PATH 可指向既有安装，ROOM_CHROMIUM 指定 Chromium，ROOM_URL 指定服务地址。

- check-room-browser.cjs：预置旧版全部收集记录，验证物体多次点击、相框/信件反复开关、点击前后画布像素一致、旧记录不变、刷新、固定家具、缩放、卸载重建、JSON 改位置、透明命中和存储不可用。
- check-room-drag.cjs：五物品拖动、松手后点击、位置保存、重置与手机触摸。
- check-gift-browser.cjs：照片上传取景、正文编辑、保存恢复、收礼者只读、礼物隔离及存储异常。

JSON 验收会临时修改测试配置，并在 finally 恢复原文；不要同时编辑该文件。截图与报告保存在被 Git 忽略的 .room-qa/。

## 当前限制

素材透视和风格尚未严格数值标定，未重绘原图。固定家具使用矩形热区。手机小物品可通过页面底部按钮触发。礼物内容和位置只在当前浏览器同源保存，不跨设备同步。本阶段未添加 AI、登录、数据库、复杂 3D 或多人功能。
