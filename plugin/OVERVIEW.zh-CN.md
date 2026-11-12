# Paseo Deck

[English](OVERVIEW.md) · [简体中文](OVERVIEW.zh-CN.md)

**在一个 Paseo 窗口中，并排使用不同工作区的 Agent、终端和文件。**

- **原生对话**：添加已有 Agent 或新建 Agent，在各分屏中使用 Paseo 的原生会话与输入框。
- **灵活排版**：每个分屏拥有独立 Tab，可拖动排序、移动、拆分、缩放，支持两列、三列、四列及四宫格。
- **统一添加**：集中搜索 Agent、选择工作区，运行中的 Agent 单独分栏，Tab 使用来源工作区的图标。
- **工作区操作**：运行活动 Tab 所属工作区的脚本，外部打开文件，使用已注册的插件按钮与面板。
- **偏好记忆**：恢复布局，自选常驻 Tab 栏的插件按钮，窄分屏仍可通过更多菜单访问。

## 使用流程

从侧栏或 Command Center 打开 Paseo Deck，选择主机，点击分屏中的 `＋` 添加资源。Agent、终端和文件使用 Paseo 原生组件。关闭 Tab 只移除展示，不终止 Agent 或终端；批量关闭前会检查未保存内容。

布局与按钮偏好按主机保存在当前客户端，不会在不同客户端间同步。消息、附件和工具结果使用 Paseo 现有的主机连接及模型提供商配置；脚本在所选主机的来源工作区执行。Deck 无需额外账号或 API 密钥。

## 要求与范围

要求 **Paseo daemon 和客户端均为 0.13.0+**。支持桌面与 Web，不支持 iOS / Android 原生客户端。当前插件菜单使用简体中文。

同一工作台支持一个所选主机中的最多 **8 个资源 Tab / 8 个分屏**。添加面板读取最多 200 个 Agent 和 200 个工作区。外部编辑器目标取决于 Paseo 桌面能力，第三方插件面板保留各自的要求。

目前为实验版本，使用 Paseo 私有 UI 组件，不修改应用安装文件。已实测配套的 0.13.0、0.14.0、0.15.4 daemon 与客户端；后续构建可能需要适配，无法识别时会显示错误。已验证 GitLens、对话书签和保持唤醒，其它集成的行为可能有所不同。

源码、安装与开发指南：[MinLeeV5/paseo-deck](https://github.com/MinLeeV5/paseo-deck/blob/main/README.zh-CN.md)。问题反馈请使用 [GitHub Issues](https://github.com/MinLeeV5/paseo-deck/issues)。
