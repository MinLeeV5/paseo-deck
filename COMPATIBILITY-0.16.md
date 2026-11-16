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
| New workspace 扩展项、Agent/workspace metadata | 已接入原生新建页的 Deck 目标选项，使用 workspace metadata 保存本次创建的客户端意图；首个 Agent 创建后加入发起客户端的布局。metadata 不用于同步各客户端的分屏布局。 | 已实现 |
| 内置插件商店 | 已有 manifest 名称、描述、截图、双语 OVERVIEW；已通过 0.16 编译器对无开发依赖插件副本的编译检查。是否更新商店来源需在发布后处理。 | 本地已验证 |
| 连接保留/恢复、返回工作区恢复上次 Tab、关闭 Agent Tab 保留草稿 | 本次继续保留 Deck 自身的布局、原生草稿来源与订阅生命周期。后续可针对断线恢复与同 Agent 多处展示增加长期场景验收。 | 后续回归重点 |
| 原生聊天滚动、diff 分批加载、终端恢复、工具卡片与审批交互修复 | Deck 复用对应原生面板，可以获得宿主改进。没有证据需要在 Deck 重写这些功能；各场景仍需单独验收才能承诺完整兼容。 | 沿用宿主 |

## 本次添加弹窗已接入的能力

- `＋` 默认打开所有 project 的已有 Agent，搜索框直接获焦；未读、运行中、待处理和后台任务可以按状态筛选。列表按「需要处理 → 未读 → 正在运行 → 后台任务 → 最近会话」排列，同组按活动时间排序。点击已有 Agent 直接添加到 Deck；已添加的 Agent 沿用原来的去重与切换行为。
- 搜索框与状态筛选合并为单行，移除列表顶部重复的标题说明，增加滚动内容区。窄屏下状态筛选横向滚动。
- 使用 0.16 目录元数据中的 `backgroundWork.count` 显示后台任务数量，并单独分组，不把 idle Agent 的后台任务冒充为前台对话正在运行。目录订阅也会发布仅后台任务数量变化的更新。
- 未读继续读取客户端原生状态。daemon 的 `attentionReason: "finished"` 可能在用户读过消息后仍存在，不将其直接当作未读；浏览弹窗本身也不会标记已读。
- 「新建 Agent」降为次级入口，原有按 project 创建 workspace、选择 worktree/原目录并自动添加新 Agent 的流程保留在同一个弹窗内。
- 这些适配没有增加 0.16 专用 hook 的强制运行依赖。旧主机缺少 `backgroundWork` 时按 0 个后台任务处理，仍沿用最低 0.13.0 要求。

## 原生页面加入 Deck

- 0.16+ 原生 Agent 页提供「加入 Deck」菜单，可选当前或新分屏；已加入时显示「在 Deck 中打开」，定位现有 Tab。Command Center 也可加入当前 Agent。
- 原生 New workspace 页增加 Deck 选项，默认不添加。选择目标后，以客户端唯一标记和创建请求 ID 识别本次 workspace 的首个 Agent，避免其它客户端响应，以及重连和重复目录事件导致的重复添加。
- workspace 侧栏显示当前客户端的 Deck 标签数。共享布局快照使原生页面在 Deck 未打开时也能保存加入结果，并保留后续 Deck 编辑。
- 原生新入口按客户端能力启用；0.13–0.15 的原有 Deck 入口保留。新建页使用 metadata 的自动加入需要 0.16+ daemon 和客户端。

## 后续适配顺序

1. **Composer 公开 API**：按明确的 Agent ID 读取和修改草稿、附件、模型与权限模式，逐步减少私有输入框补丁。先验证同一 Agent 多处输入、光标、IME 和焦点行为，再迁移现有双向同步。
2. **自定义 sidebar view**：可按 Deck 分屏或 project 聚合已加入的 Tab。它会改变用户的侧栏布局，宜作为可主动选择的视图。

0.16 仍未公开提供可直接嵌入的完整 Agent/终端/文件面板，核心桥接目前仍需维护。

## 本次验证

- `npm run typecheck`：通过，使用 0.16.0 SDK。
- `npm test`：66 项通过，包含旧/新弹层契约、缺少弹层能力时拒绝加载、已安装构建的完整桥接解析，以及 Paseo 正式版编译器对无 `node_modules` 插件副本的编译。
- 0.13.0 / 0.14.0 / 0.15.4 历史正式版 bundle：全部必需桥接入口仍能解析。此处为静态契约复查，本次未重新执行这些版本的完整 UI 验收。
- 0.16.0 原始打包 Web UI + 同版本本机 daemon，独立浏览器配置：Deck 页面、资源弹窗、已有 Agent 原生面板及 Composer 均正常加载。
- 实际键盘事件：无菜单时弹层检测为 `false`；打开分屏菜单后为 `true`，`⌘T` 不打开添加弹窗；`Esc` 关闭菜单后为 `false`，`⌘T` 恢复打开添加弹窗。

界面验收没有发送模型消息、终止 Agent 或编辑原生文件面板中的文件。尚未重新验收 0.16 的完整 Electron 专属行为（如内嵌浏览器、外部编辑器）、多主机、全部后台任务类型或 iOS / Android 原生客户端。

添加弹窗与后台摘要的后续适配已通过 **74 项测试与 19 项界面检查**，包括状态优先级、快捷筛选、后台数量变化、直接添加、去重、同排搜索与筛选、深浅主题和窄屏边界。状态场景使用隔离客户端内的样本快照，直接添加使用隔离 daemon 中已有的真实 Agent；未发送模型消息或启动后台任务。记录见 [交互验收](artifacts/agent-picker-priority-experience.json)。

原生页面加入的后续适配已通过 **92 项测试与 13 项界面检查**，覆盖原生菜单加入新分屏、重复定位、workspace 徽标、命令中心、原生新建页目标 metadata、真实 workspace 首个 Agent 的自动加入、刷新后布局保留及窄屏入口。创建验收使用原生页面选出的 metadata，经公开 API 创建无 prompt 的 Agent，未发送模型消息。记录见 [原生加入验收](artifacts/native-deck-entry-experience.json)。
