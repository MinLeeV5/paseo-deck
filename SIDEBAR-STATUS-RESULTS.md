# Deck 侧栏状态计数

2026-11-12，Paseo 0.15.4 隔离 Web 客户端。

[深色](artifacts/deck-sidebar-counts-dark.png) · [浅色](artifacts/deck-sidebar-counts-light.png) · [375px 侧栏](artifacts/deck-sidebar-counts-compact.png)

Paseo Deck 的侧栏入口参考“任务”的图标加数字形式，汇总当前工作台的 Agent Tab。等待输入或审批、失败、正在运行、未读各自显示数量，为 0 时隐藏；空闲、文件、终端和未创建会话的草稿不计入。悬停提示和无障碍名称提供完整状态说明。

状态与 Tab 共用原生 `WorkspaceTabPresentationResolver`，运行图标复用原生 `StatusRing`。侧栏持有宿主共享的元数据观察，因此恢复布局后或离开 Deck 时仍会更新。布局变更在提交时同步给侧栏，关闭 Tab 无需等待保存即可扣除数量。计数本身不会将会话标为已读，也不加载会话时间线。

验证结果：

- 类型检查、62 项自动测试及无开发依赖的插件构建通过。
- [20 项界面检查](artifacts/deck-sidebar-counts-experience.json)通过，涵盖首次在历史页恢复计数、后台状态转换、权限与错误优先级、活跃 turn、跨分屏、关闭 Tab、输入框实例保留、浅深色、减少动画设置、375px 可见侧栏、横屏和全部空闲时隐藏。
- [0.13.0 / 0.14.0 / 0.15.4 接口检查](artifacts/deck-sidebar-counts-compatibility.json)通过：64 个必需原生导出均可解析，共享目录观察方法均存在。

界面检查向隔离客户端的原生 session store 注入测试快照，未发送 Agent 消息或审批答复；结束后恢复测试页面原始布局与主题。这些检查覆盖展示与状态联动，未代替各 provider 的端到端运行测试。

实现见 [侧栏入口](plugin/client/sidebar-item.tsx)、[布局快照同步](plugin/client/web.ts)与[原生桥接](plugin/shared/bridge.ts)。
