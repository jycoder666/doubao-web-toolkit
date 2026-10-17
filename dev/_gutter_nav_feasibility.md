# 原生 gutter 导航美化 — 可行性结论（2026-10-17）

## 目标回顾

美化豆包原生左侧刻度栏（用户选中节点：`w-34` + `gutter-v8GxSc` / `root-MSn2si`），利用其「拖拽可加载更多」能力，并加上搜索与总数量；去掉注入的 `#dwt-nav`。做不到则放弃。

## 证据（DOM / 布局）

| 项 | 观察 |
|----|------|
| 刻度列宽 | `w-34` ≈ **34px**，仅刻度线，无提问文案 |
| 父级 | `w-316` / `aside.left-12.gutter-*`，React 组件栈 `Wrapper > SpiWrapper > Cn` |
| 样式哈希 | `gutter-v8GxSc`、`root-MSn2si` 等为构建期 class，**易随豆包发版失效** |
| 交互 | 竖向 `overflow-y-auto` + 隐藏滚动条；拖拽滑动由宿主虚拟列表驱动加载 |

## 更正（用户澄清）

滑动/悬停原生刻度时，豆包**已有标题浮层**。需求是 **CSS 美化**该原生体验，而非在 34px 内重做列表。

## 结论（rev7）：**CSS 美化 + 挪到右侧可行；搜索仍不做**

| 能力 | 做法 |
|------|------|
| 位置 | CSS：`aside[class*="gutter"]` → `right:12px; top:84px`（对齐原 `#dwt-nav`） |
| 刻度更易点/更清晰 | CSS：加粗、提亮、hover scale |
| 标题浮层更清晰 | CSS：略放大、圆角、阴影、毛玻璃 |
| 总数量 | `#dwt-gutter-count` 贴右侧 |
| 搜索 | **不做** |
| `#dwt-nav` | 有原生 gutter 时隐藏 |

## 验收

- [x] CSS 美化路径落地（`NAV_REV=6` / `mode=gutter-css`）
- [x] 有 gutter 时不再依赖右侧 `#dwt-nav`
- [ ] 搜索：明确不做
