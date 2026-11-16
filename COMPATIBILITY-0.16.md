# Paseo 0.16.0 兼容与新增能力评估

核对日期：2026-11-16。依据：[正式版 changelog](https://paseo.sh/changelog#0.16.0)、[插件契约](https://paseo.sh/docs/plugins/reference.md)、本机 0.16.0 正式版 Web 构建与 SDK。客户端资源来自 `/Applications/Paseo.app`；daemon 为本机桌面托管的 0.16.0。

## 已修复

0.16 将原来的 `hasActiveWebOverlay` 替换为跨平台的 `hasActiveOverlay`。Deck 原先把旧名称列为必需导出，导致客户端解析失败，随后回退到 `bridge.info` RPC 时再次失败，最终显示 `handler_error`。这次问题发生在插件的私有 UI 桥接层。

- 桥接解析与运行时读取共同支持两个名称；对 Deck 其余代码保留同一个弹层检测契约。
- 继续使用宿主真实的弹层检测，菜单打开时暂停 Deck 快捷键；未知契约仍报错，避免快捷键穿透。
- 开发用 `@getpaseo/plugin` 升至 0.16.0，并保留最低支持版本 0.13.0。新增的 0.16 专用 API 尚未成为运行依赖。
- 回归检查覆盖完整必需桥接列表，而不再只检查其中的部分面板导出。

本机目录安装的 `paseo-deck` 已执行插件重载。应用安装文件未修改。

## Changelog 中与 Deck 有关的变化

| 变化 | 对 Deck 的影响与建议 | 优先级 |
| --- | --- | --- |
| 移动端外接键盘支持，弹层键盘处理统一 | 必须兼容改名后的弹层入口；已完成。 | 已修复 |
| macOS 桌面切换 Tab 改为 `⌘⇧[` / `⌘⇧]` | Deck 已通过 `useShortcutKeys` 读取宿主绑定，自动沿用新值；额外的 `Ctrl+Tab` / `Ctrl+Shift+Tab` 继续可用。 | 已兼容 |
| Composer 控件、草稿/附件读写与 Agent 设置 API | 可通过 `useComposer`、`useComposers({ agentId })` 操作草稿、模型与附件，逐步减少私有代码。迁移前需验证同一 Agent 的多个原生输入框同步；插件页面上的 `{ focused: true }` 不会返回 Deck 活动 Agent，`focus()` 也可能导航回原工作区。不能直接替换现有补丁。 | 下一阶段优先研究 |
| 自定义 sidebar view | 可增加按 Deck 分屏或来源工作区分组的侧栏，汇总 Tab 与等待处理状态。应作为用户主动选择的侧栏视图，并保留旧版侧栏入口。它不提供原生面板嵌入能力。 | 可新增 |
| 后台任务与后台 Agent | 原生面板已提供新版后台任务控件。Deck 可额外展示 `backgroundWork.count`，并通过 `agent.backgroundWork` 查询/停止任务；后台任务数量与 Agent 正在执行一轮对话是不同状态。默认目录继续沿用 SDK 对后台 Agent 的过滤，不主动设置 `includeBackground`。 | 可新增 |
| New workspace 扩展项、Agent/workspace metadata | 可研究给原生新建页增加「添加到 Deck」选项，或给资源保存 Deck 相关元数据。Deck 的自定义创建弹窗不会自动获得 `useNewWorkspace()` 上下文，接入需另做设计。metadata 也不会自动同步目前保存在客户端的分屏布局。 | 可新增 |
| 内置插件商店 | 已有 manifest 名称、描述、截图、双语 OVERVIEW；已通过 0.16 编译器对无开发依赖插件副本的编译检查。是否更新商店来源需在发布后处理。 | 本地已验证 |
| 连接保留/恢复、返回工作区恢复上次 Tab、关闭 Agent Tab 保留草稿 | 本次继续保留 Deck 自身的布局、原生草稿来源与订阅生命周期。后续可针对断线恢复与同 Agent 多处展示增加长期场景验收。 | 后续回归重点 |
| 原生聊天滚动、diff 分批加载、终端恢复、工具卡片与审批交互修复 | Deck 复用对应原生面板，可以获得宿主改进。没有证据需要在 Deck 重写这些功能；各场景仍需单独验收才能承诺完整兼容。 | 沿用宿主 |

建议下一步先研究 Composer 公开 API 的适用范围，再考虑自定义侧栏与后台任务摘要。0.16 仍未公开提供可直接嵌入的完整 Agent/终端/文件面板，核心桥接目前仍需维护。

## 本次验证

- `npm run typecheck`：通过，使用 0.16.0 SDK。
- `npm test`：66 项通过，包含旧/新弹层契约、缺少弹层能力时拒绝加载、已安装构建的完整桥接解析，以及 Paseo 正式版编译器对无 `node_modules` 插件副本的编译。
- 0.13.0 / 0.14.0 / 0.15.4 历史正式版 bundle：全部必需桥接入口仍能解析。此处为静态契约复查，本次未重新执行这些版本的完整 UI 验收。
- 0.16.0 原始打包 Web UI + 同版本本机 daemon，独立浏览器配置：Deck 页面、资源弹窗、已有 Agent 原生面板及 Composer 均正常加载。
- 实际键盘事件：无菜单时弹层检测为 `false`；打开分屏菜单后为 `true`，`⌘T` 不打开添加弹窗；`Esc` 关闭菜单后为 `false`，`⌘T` 恢复打开添加弹窗。

界面验收没有发送模型消息、终止 Agent 或编辑原生文件面板中的文件。尚未重新验收 0.16 的完整 Electron 专属行为（如内嵌浏览器、外部编辑器）、多主机、全部后台任务类型或 iOS / Android 原生客户端。
