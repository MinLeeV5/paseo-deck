# Tab 原生状态验收

2026-11-12，Paseo 0.15.4 隔离 Electron 客户端。

[深色](artifacts/tab-status-native-dark.png) · [浅色](artifacts/tab-status-native-light.png) · [430px 窄屏](artifacts/tab-status-native-compact.png)

Agent 与新建 Agent Tab 复用宿主的 `WorkspaceTabPresentationResolver` 和 `StatusIcon`，在来源工作区图标上显示原生状态。优先级、颜色、动画和已读操作均沿用 Paseo；插件不另存未读标记，不增加会话时间线订阅。

| 原生状态 | Tab 显示 |
| --- | --- |
| `needs_input` | 黄色提示：等待回答或审批 |
| `failed` | 红点：运行失败 |
| `running` | 运行转圈，包含原生已开始但生命周期状态尚未更新的 turn |
| `attention` | 绿点：未读 |
| `done` / 无状态 | 只显示工作区图标 |

状态说明同时加入 Tab 的悬停提示和无障碍名称。初次打开前、后台和前台 Tab 都从原生状态源更新；当前会话中完成的新回复继续遵循原生的聚焦已读规则。等待回答或审批不会被聚焦操作清除。

## 验证

- TypeScript 检查与 47 项自动测试通过；原生运行时契约测试包含新增的两个导出。
- [15 项 Electron 界面检查](artifacts/tab-status-experience.json)通过：后台更新、运行转未读、权限数量和权限原因两条路径、组合状态优先级、活跃 turn、失败清除、输入框实例保留、浅深色和窄屏、进入未读会话、前台新回复后的输入聚焦，以及待输入状态不误清除。
- 界面检查向隔离客户端的原生 session store 注入测试快照，并拦截该 fixture 的已读 RPC 来检查触发行为；未向 Agent 发消息或提交审批答复。结束后恢复原始布局、状态、RPC 与主题。这些检查不替代各 provider 的端到端运行测试。
- [0.13.0 / 0.14.0 / 0.15.4 构建契约检查](artifacts/tab-status-compatibility.json)通过，63 个必需导出均可解析；本轮完整界面检查使用 0.15.4。

实现见 [Tab 渲染](plugin/client/pane-frame.tsx)、[原生类型](plugin/client/native-types.ts)和[运行时桥接](plugin/shared/bridge.ts)。
