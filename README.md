# 译流 · AI 翻译（LinguaFlow）

<p align="center">
  <img src="icons/icon128.png" width="96" alt="LinguaFlow 图标" />
</p>

<p align="center">
  <b>划词即译、一键整页翻译的 Chrome AI 翻译插件</b><br />
  <sub>Manifest V3 · 支持任意 OpenAI 兼容接口 · 无需登录 · 数据不出本机</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="Zero dependencies" />
</p>

---

## 特性

- **划词翻译** —— 在网页中选中文字，点击出现的红色「译」按钮，译文就地展开。使用 Shadow DOM 隔离，不污染宿主页面样式。
- **整页翻译** —— 一键把整页文本替换为译文，带实时进度与失败统计，随时「恢复原文」；
- **弹窗翻译** —— 点击工具栏图标，粘贴文字即可翻译（`Ctrl/⌘ + Enter`），自动带入页面中最后选中的文本。
- **右键菜单** —— 选中文本右键「译成中文 / Translate to English」，页面右键「翻译整页」。
- **翻译历史** —— 弹窗底部保留最近记录，点击即可回填。
- **任意后端** —— 只要兼容 OpenAI Chat Completions 协议即可：OpenAI、DeepSeek、Moonshot、通义千问、Ollama 等。
- **零依赖** —— 纯原生 JavaScript，无构建步骤，克隆即可加载。

## 安装

1. 克隆或[下载](https://github.com/15217814598/ai-translator/archive/refs/heads/main.zip)本仓库
2. 打开 Chrome，访问 `chrome://extensions`
3. 打开右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」，选择本仓库所在文件夹

## 配置

首次使用请点击插件图标 → 右上角 ⚙ 打开设置页：

| 配置项 | 说明 | 示例 |
| --- | --- | --- |
| 接口地址 | OpenAI 兼容 Base URL，填到 `/v1` 这一层 | `https://api.openai.com/v1`<br>`https://api.deepseek.com/v1` |
| API Key | 你的密钥，仅保存在本机 | `sk-...` |
| 模型名称 | 接口支持的模型 ID | `gpt-4o-mini`、`deepseek-chat` |
| 目标语言 | 弹窗与整页翻译的默认语言 | 中文 / English / 日本語 |

点击「测试连接」可以验证配置是否可用。

## 使用

| 场景 | 操作 |
| --- | --- |
| 翻译网页中的一段话 | 选中文字 → 点击「译」按钮 |
| 翻译一段任意文本 | 点击工具栏图标 → 粘贴 → 翻译 |
| 翻译整个页面 | 弹窗中点击「翻译整页」，或页面右键菜单 |
| 还原网页原文 | 弹窗中点击「恢复原文」 |

## 文件结构

```
ai-translator/
├── manifest.json        # MV3 清单：权限、内容脚本、后台入口
├── background.js        # Service Worker：接口调用、右键菜单、历史记录
├── content.js           # 内容脚本：划词悬浮面板、整页翻译（Shadow DOM 隔离）
├── popup.html/css/js    # 弹窗：快速翻译、整页翻译、最近记录
├── options.html/css/js  # 设置页：接口配置、测试连接
├── icons/               # 印章风格图标（16/32/48/128）
└── tools/
    └── generate_icons.py  # 图标生成脚本（Python + Pillow）
```

## 隐私

- 翻译请求由你的浏览器**直接**发往你配置的接口地址，不经过任何中间服务器。
- API Key、配置与翻译历史仅保存在 `chrome.storage.local` 中，不上传、不同步。
- 内容脚本只读取你选中的文字，或页面可见文本用于整页翻译。

## 已知限制

- 浏览器内置页面（`chrome://`、扩展商店等）无法注入脚本，不支持划词与整页翻译。
- 整页翻译按每批 20 段提交给模型，单页上限 4000 个文本节点；`<script>`、`<style>`、输入框、`<pre>`/`<code>` 等内容自动跳过。
- 批量翻译要求接口返回严格等长的 JSON 数组。若所用模型不遵循该格式，可能导致个别段落翻译失败（页面会保留原文并统计失败数）。

## 开发

项目不使用任何构建工具，修改源码后在 `chrome://extensions` 中点击扩展卡片上的刷新按钮即可生效。

重新生成图标（需要 Python 3 与 Pillow）：

```bash
python tools/generate_icons.py
```

欢迎提交 Issue 与 Pull Request。

## 许可证

[MIT](LICENSE)
