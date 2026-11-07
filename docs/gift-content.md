# 相框与信件内容

## 使用

默认打开 `/world-demo` 为赠送者模式。轻点相框打开「珍藏相框」，点击「编辑相框」上传或更换照片，用三个滑块调整缩放、左右和上下位置。轻点信件打开「展开信件」，点击「编辑信件」编辑正文。内容变化会立即自动保存；「保存编辑」再次确认保存并退出编辑状态。关闭弹窗、按 Esc 或刷新后，已保存内容仍会恢复。

上传支持 JPG/PNG/WebP，原文件不超过 10 MB；浏览器本地解码，将最长边缩至最多 1200 像素并保存为 JPEG，避免直接保存大图导致配额不足。照片以固定 4:3 取景窗等比覆盖，缩放范围 1～3 倍，取景位置范围 0～1；原图不会拉伸。替换照片会重置取景。信件正文最多 10000 字符，以纯文本保留换行，不执行 HTML。

点击页面上方「预览收礼者模式」进入同一礼物的只读预览。也可以直接使用：

```text
/world-demo?mode=sender&gift=warm-room-gift-v1
/world-demo?mode=recipient&gift=warm-room-gift-v1
```

收礼者点击相框/信件只能查看，无上传、取景滑块、正文输入或编辑/保存按钮，也不能拖动房间物品。物品介绍与反复查看仍正常。

## 配置和持久化

房间 JSON 的物体用 `content_type: "photo_frame" | "letter"` 声明专属交互，不通过素材文件名猜测类型。新增相同交互时，需要在礼物配置的 `object_contents` 中登记该物体 ID。素材清单、独立 PNG 和 Phaser 素材加载方式不变。

`src/world/demo-gift.json` 为默认礼物配置。`GiftConfig` 包含：

```json
{
  "version": 1,
  "gift_id": "warm-room-gift-v1",
  "world_id": "warm-room-demo-v1",
  "object_contents": {
    "sunset-frame": {
      "kind": "photo_frame",
      "photo": null,
      "zoom": 1,
      "position_x": 0.5,
      "position_y": 0.5
    },
    "sealed-letter": { "kind": "letter", "body": "写给你的话" }
  }
}
```

`photo` 为上传后处理得到的图片 data URL；为空时弹窗展示已有的日落相框 PNG。小房间中的立体相框仍使用队友原始素材，私人照片在放大弹窗中展示，不覆盖或修改该 PNG。

`GiftStore` 按 `promised-land:gift:<gift_id>` 保存完整礼物内容配置。相框和信件分别按 `object_id` 更新，互不覆盖；不同 gift_id 的内容相互隔离。读入时校验礼物和房间身份、内容类型、字段范围与数据 URL。房间物品固定，位置缓存不再读写。收集模式已停用，旧收集记录不会影响物品外观与点击。

只有 sender 模式的写入方法可以保存。浏览器存储不可用或超出配额时，弹窗明确显示失败，不会把失败草稿当作已保存结果，也不会覆盖之前的已保存配置；关闭时需先重试保存或点击「放弃未保存更改」。

当前仍为本地 Demo：模式来自 URL，是界面及本地写入保护，不是账号鉴权。数据保存在当前浏览器/同源中，未写回仓库源文件，不会自动跨设备传给收礼者。真实交付仍需后续服务端持久化与赠送者身份校验；当前未添加登录或数据库。

## 文件

- `src/world/types.ts`：GiftConfig、PhotoFrameContent、LetterContent 和模式类型。
- `src/world/demo-gift.json`：默认礼物文案与相框配置。
- `src/world/GiftStore.ts`：配置持久化、校验、按礼物隔离、只读写入保护。
- `src/components/world/GiftContentDialog.tsx`：原生 dialog 弹窗、编辑/只读界面、自动保存和失败提示。
- `src/lib/media/photos.ts`：共用照片处理，`prepareFramePhoto` 保留相框入口原有文件限制和压缩策略。
- `src/components/world/WorldDemo.tsx`：模式、专属物体点击及礼物配置连接。
- `src/game/scenes/WorldDemoScene.ts`：物品固定；原点击交互保持。
- `src/world/config.ts`、`demo-world.json`：content_type 配置与校验。
- `src/app/globals.css`：相框、信纸、弹窗及手机适配。

## 验证

```powershell
node scripts/check-gift-state.cjs
npm run typecheck
npm run build
```

浏览器检查脚本 `scripts/check-gift-browser.cjs` 使用既有 Playwright，环境配置同房间验收脚本。测试使用合成照片，不读取个人文件。覆盖画布点开相框、照片上传/更换/缩放/位置、保存后关闭及刷新恢复、信件自动保存与显式保存、收礼者无编辑控件、不同礼物隔离、非法图片不覆盖旧数据、存储失败无假成功及手机弹窗。另由固定房间测试验证位置缓存不会影响画面。
