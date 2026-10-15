# Doubao Web Toolkit

Chrome/Edge MV3 浏览器扩展，专门服务 doubao.com / dola.com 网页版。

## 核心功能

| 功能 | 状态 |
| --- | --- |
| 调试面板 (DOM selector inspect + 实时状态) | ✅ |
| 批量输入 + 验证码暂停 (用户原创) | ✅ |
| 对话导出 Markdown / JSON | 🚧 占位 |

## 安装 (开发模式)

1. `git clone https://github.com/jycoder666/doubao-web-toolkit.git`
2. Chrome → `chrome://extensions` → 开发者模式 → 加载未打包扩展 → 选中本目录
3. 打开 `https://www.doubao.com/chat` → 右下角出现「⚙ DWT」按钮

## 技术栈

- Manifest V3
- 传统 ES5 脚本 + window.dwt 全局命名空间 (MV3 content scripts 不支持 ES Module)
- 零构建, 零 npm install
- chrome.storage.local

## 合规

**不做**: 去水印 / 免Token / 逆向API / 多账号轮询 / 自动答题 / 伪造AI水印

**做**: 纯 DOM 层操作, 不调用豆包私有 API endpoint; 批量输入是单账号、手动触发、无循环的辅助工具

GitHub: [jycoder666/doubao-web-toolkit](https://github.com/jycoder666/doubao-web-toolkit)
