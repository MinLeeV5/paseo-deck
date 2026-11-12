# 原生 Tab 分屏性能验收

2026-11-12，Apple M5 / 24GB，使用真实 Paseo 面板与 daemon。桌面仅保留 32px Tab 栏，窄屏 36px。

## 工作区操作与菜单更新后的复测

最终代码在 Web 1600×1000 下再次测量，方法与下文一致。菜单关闭，包含官方按钮、可配置插件入口及新增布局能力；测试资源仍是原生 Agent、终端、文件和草稿。

| 场景 | 面板 model 构建 | 图标 hook 调用 | 布局写入 | 帧间隔 P95 | >50ms 长任务 | 主线程 TaskDuration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Web · 4 可见资源 | 0 | 0 | 1 | 16.8ms | 0 | 345.83ms/s |
| Web · 8 可见资源 | 0 | 0 | 1 | 16.8ms | 0 | 426.19ms/s |

位移均实际达到 96px。16 秒空闲期间构建、图标 hook 调用和布局写入均为 0，无长任务。原始数据：[4 资源](artifacts/performance-actions-final-4-panes.json)、[8 资源](artifacts/performance-actions-final-8-panes.json)。

官方操作观察宿主 workspace 的脚本 / 路径字段，菜单按需挂载，编辑器目标查询共享宿主缓存；没有新增每按钮轮询。资源目录拥有一个 Agent 和一个 workspace 元数据观察，离开页面释放。第三方插件原有后台请求仍存在，样本中的 RPC 总量包含这些行为，不代表分屏插件自身的轮询。下方保留早期 Tab 版本的测量作为历史记录。

## 方法

Web：Paseo 0.15.4 原始构建，独立 Chrome 157，1600×913。Electron：真实 0.15.4 的 paseo://app 页面，内置 Chrome 152，1200×800。独立 Electron profile 不包含主环境的其他插件。

加载稳定后空闲 16 秒；随后输入 48 次拖动事件，向右移动 96px 再返回起点，等待 600ms。每次都断言分屏确实移动约 96px，避免把无效拖动计为低开销。后台测试窗口使用 foreground emulation 保持 rAF 调度。

采集原生面板 model 构建、图标 hook 调用、布局 localStorage 写入、rAF 帧间隔、>50ms 长任务和 CDP TaskDuration。采样 hook 仅用于验收，结束后恢复，不进入插件。[自动采样脚本](tools/browser-performance.py) 与 [Electron 驱动](tools/native-cdp.mjs) 随仓库保留。

## 最终拖动样本

| 场景 | 面板 model 构建 | 图标 hook 调用 | 布局写入 | 帧间隔 P95 | >50ms 长任务 | 主线程 TaskDuration |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Web · 4 分屏 / 4 资源 | 0 | 0 | 1 | 16.7ms | 0 | 343.0ms/s |
| Web · 8 分屏 / 8 资源 | 0 | 0 | 1 | 16.8ms | 0 | 460.18ms/s |
| Electron · 4 分屏 / 4 资源 | 0 | 0 | 1 | 17.2ms | 0 | 375.46ms/s |

所有样本实际位移均为 96px。空闲期间面板构建、图标 hook 与布局写入均为 0，没有长任务。四资源为 2 个已有 Agent、1 个终端、1 个文件；八资源为 2 个已有 Agent、2 个草稿 Composer、2 个终端和 2 个文件。每个资源在自己的分屏中可见，未以隐藏 Tab 数冒充可见窗口数。

主线程开销仍包含原生终端、编辑器与消息视图的重排和绘制，不能据此宣称整体 CPU 显著下降。rAF 是此测试环境的调度指标，不等于 GPU 最终呈现帧率；不同浏览器、尺寸与插件配置的 TaskDuration 不宜直接横向推断。

## 资源控制

- 原生内容保持为稳定同级宿主。切换、移动 Tab 不重建已访问内容，未访问 Tab 延迟挂载。
- 外层矩形按帧更新，内容模型独立 memo；图标加载器独立 memo，不随拖动重复执行，只观察当前资源或选择器所需项目。
- 300ms 防抖持久化，退出 / 卸载补写；快速操作和恢复布局保留。
- 元数据使用单个可释放的 Agent 列表订阅，实时更新运行分栏与指示，不额外请求 Agent 时间线；离开页面释放，返回重建，已实测生命周期。
- 非当前 Tab 取消可见时间线登记，关闭时释放编辑会话缓存。选择器关闭后不再轮询资源目录。
- 总计最多 8 个资源 Tab / 8 个分屏，保留现有资源预算；上限在创建终端前检查。

## 原始数据与边界

[Web 四资源](artifacts/performance-tabs-4-panes.json) · [Web 八资源](artifacts/performance-tabs-8-panes.json) · [Electron 四资源](artifacts/performance-tabs-desktop-4-panes.json)

图标加载器隔离前的诊断样本也保留：[四资源](artifacts/performance-tabs-before-icons-4-panes.json)、[八资源](artifacts/performance-tabs-before-icons-8-panes.json)。第一版独立窗口的历史数据仍保留在 artifacts/performance-before-* 与 performance-after-*，不与当前版本混称。

这是单机短时验收，Agent 处于空闲；没有覆盖 8 个 Agent 同时长时间流式输出、超长终端输出、长期断线或数小时内存压力。堆大小受 GC 时机影响，单次值不能证明长期无泄漏。原生长会话渲染仍依赖 Paseo 自身实现。
