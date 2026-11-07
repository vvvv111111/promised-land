# 应许之地

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
赠送者将共同回忆制作成礼物；收礼者开启、聆听、探索并阅读最终故事。

## Product Purpose
把共同回忆变成可以打开、观看、聆听和探索的电子音乐水晶球。

## Capabilities and Constraints
本次实现八个外层页面、本地保存、照片预览、模拟生成和本机预览链接。没有真实 Agent、数据库、跨设备分享或公网部署。现有 Phaser 房间、WorldConfig、Asset Manifest 和房间素材保持不变。收礼者没有编辑入口；这是本地 Demo 的界面权限，不是服务器鉴权。

## Brand Commitments
冬日深蓝雪夜，巨大的透明水晶球、温暖小屋、柔和月光、精致磨砂玻璃控件。留白、短文案、缓慢自然动效。避免金色礼盒、大量卡片和 SaaS 营销页面。

## Evidence on Hand
已有 src/components/world/WorldDemo.tsx 和 public/assets/warm-room-v1/。当前房间物品可重复探索，无收集状态；外层适配器负责三件纪念物进度，不更改场景。
