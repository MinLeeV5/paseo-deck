# 原生 Tab 与统一添加面板验收

2026-11-12。已按 [交互方案](design/INTERACTION-DESIGN.md) 实施，安装入口仍为左侧 **跨 Workspace 分屏**。

[真实 Electron 分屏](artifacts/tabs-native-workspace.png) · [统一添加与运行分栏](artifacts/tabs-unified-picker.png) · [窄屏面板](artifacts/tabs-compact-picker.png)

## 这版的交互

- 删除整窗蓝色选中描边、独立标题栏和全局工具栏。每个分屏只保留一行原生风格 Tab：桌面 32px、窄屏 36px；活动 Tab 使用中性底色。
- Agent / 新建 Agent Tab 使用宿主的真实 workspace 项目图标；自定义图片、字母、颜色与原生回退逻辑共用，完整来源放在悬停提示中。
- 每个分屏的 `＋` 打开统一选择器，集中搜索已有 Agent、选择来源并新建 Agent，也可进入终端和文件操作。
- 运行与启动中的 Agent 单独置顶到 **正在运行** 一栏，每行显示 **运行中 / 启动中** 文字；对应 Tab 有运行指示。状态由元数据订阅实时更新，完成后自动清除。
- 默认添加到当前分屏。底部可改为新分屏；`···` 包含移动 Tab、分屏、排列、均分和返回原 workspace 等操作。

## 实测结果

| 场景 | 验证结果 |
| --- | --- |
| 旧布局迁移 | v1 每个窗口成为独立单 Tab 分屏，资源 ID / 比例保留；迁移前保存 v1 本地备份 |
| 多 Tab | 新建 Agent 草稿进入当前分屏；关闭选中 Tab 后回到相邻 Tab |
| 移动 / 切换 | 原生文件编辑器 DOM 保持同一个实例；移动只改显示位置，不重新挂载资源 |
| 导入去重 | 已打开的 Agent 切回已有 Tab；ID 与历史保持，不创建重复资源 |
| 运行标识 | 通过真实 fixture Agent 执行只读 sleep 命令；打开面板之前 Tab 已更新，面板显示独立运行分栏，完成后标识清除 |
| 新建 Agent | 真实 Electron 中选 workspace、新建 Tab、原生 Composer 发送，Agent 回复 TAB_DESKTOP_CREATE_OK |
| 终端 | 0.13.0 / 0.14.0 与桌面端通过选择器新建，实际输入命令；daemon capture 验证标记与 fixture 目录 |
| 文件 | 通过统一面板选择来源与相对路径，打开正确文件 |
| 未保存关闭 | 取消后继续保存；放弃后移除 Tab，磁盘保持放弃前内容，测试文件已恢复 |
| 新分屏 | 选择资源后创建；取消选择不增加空分屏，关闭空分屏正常 |
| 搜索 / 键盘 | 无结果有反馈；箭头切换 Tab，Esc 关闭并返回正确触发按钮，含宽窄屏来回切换；真实 Electron 中 Cmd+L 随当前 Tab 定位原生 Composer |
| 后台释放 | 实际监听元数据 observation 生命周期，离开页面释放；返回重新建立 |
| 主题 / 窄屏 | 浅色与深色、430px 分屏切换与统一浮层均通过；面板限制在视口内，图标与列表首个分栏完整显示 |
| 资源上限 | 实际填满 8 个 Tab 后拒绝新增草稿 / 终端，终端 ID 集合保持不变，无多余进程 |
| 分隔条反馈 | 中央灰色握柄，12px 抓取区；左右 / 上下排列分别显示对应缩放光标，悬停与拖动高亮；实际拖动 96px / 72px，松手恢复，浅深色及 375px 窄屏通过 |
| 版本 | 0.13.0 / 0.14.0 原始 Web 构建与同版 daemon；0.15.4 Web 与真实 paseo://app Electron |
| 自动检查 | TypeScript 通过；9 项测试包含资源归属、上限、迁移、Tab 移动/关闭、损坏身份校验与运行时契约 |

记录保存在 [tabs-experience.json](artifacts/tabs-experience.json)。此前的附件、审批问答、回退和中断等原生功能验收见 [第一版记录](DEMO-RESULTS.md)；这些功能的原生渲染组件继续复用。

分隔条补充验收见 [divider-experience.json](artifacts/divider-experience.json)，[左右排列悬停效果](artifacts/divider-hover.png)、[上下排列悬停效果](artifacts/divider-horizontal-hover.png)。抓取区覆盖原有间隙附近，不额外压缩工作区域；反馈状态仅保存在分隔条内部。

## Tab 拖拽补充验收

2026-11-12，Paseo 0.15.4 原始 Web 构建，在独立 Chrome 会话中使用真实指针与触摸事件验证：

- 同栏排序、跨分屏指定位置插入、上下排列，以及拖入空分屏；源分屏移走最后一个 Tab 后自动收起。
- 悬停和小幅按下移动保持 `pointer`，超过 6px 才进入拖动并显示 `grabbing`；松手、Esc 或无效落点恢复点击光标。取消不改变顺序。
- 跨分屏移动后，原生 Composer 与文件编辑器 DOM 均保持相同实例，未发送草稿保留；页面重载后恢复新顺序。
- 375px 窄屏的边缘自动滚动、触摸排序，以及菜单中的向左 / 向右移动。

拖动预览按帧更新独立图层，松手时才提交布局。记录见 [tab-drag-experience.json](artifacts/tab-drag-experience.json)，[插入预览](artifacts/tab-drag-preview.png)、[跨分屏拖动](artifacts/tab-drag-cross-pane.png)、[窄屏](artifacts/tab-drag-compact.png)。模型测试补充了排序、指定位置插入、空分屏与失效目标，共 13 项通过。

## 状态与资源

已访问的 Tab 切换时保持挂载，未访问的内容延迟创建；隐藏 Tab 取消可见时间线登记。关闭时释放编辑会话缓存。所有资源宿主保持为同级稳定节点，跨分屏移动也保留原生实例。图标观察器独立缓存，不跟随分隔线拖动重复执行；运行状态采用单个可释放的元数据订阅。

本轮保持总计最多 **8 个资源 Tab**、最多 8 个分屏的预算；不是每个分屏各 8 个 Tab。同一所选 host 内跨 workspace 使用；选择器读取最近最多 200 个 Agent / workspace。语音、系统拖放、所有 provider / MCP、长时间持续输出压力等仍未逐项覆盖。私有原生入口仍需随 Paseo 升级复测。

最新性能数据和方法见 [PERFORMANCE.md](PERFORMANCE.md)。

## 快捷键补充

桌面端支持 `Command+W` 关闭当前 Tab，`Ctrl+Tab` / `Ctrl+Shift+Tab` 在当前分屏内按显示顺序循环切换，保留宿主的左右切换键位和自定义设置。关闭后焦点落到相邻 Tab；关闭最后一个后落到 `＋`。消息输入框内可以触发，添加面板与 Command Center 打开时暂停，离开插件页后注销监听。

[快捷键验收记录](artifacts/keyboard-experience.json) 使用隔离的 0.15.4 Electron 客户端进行真实键盘事件验证，并对未保存文件确认接口分别模拟取消和放弃，确认草稿保留、磁盘内容不变。隔离副本通过类型检查和 13 项现有测试；此记录不替代工作目录内同期其他界面改动的全量验收。

数字直达与新建快捷键补充：`Command+Option+1…8` 按当前分屏的实际 Tab 顺序选择；`Command+Shift+A` / `Command+Shift+T` 在当前来源 workspace 新建 Agent / 终端，空分屏先选来源；`Command+Backslash` / `Command+Shift+Backslash` 打开新分屏资源选择器，选定后应用左右 / 上下排列。取消保持原布局，超限时不会创建多余终端。参见 [快捷操作验收](artifacts/quick-actions-experience.json)，测试包含真实终端创建与清理、macOS Option 符号和 Shift+Backslash。
