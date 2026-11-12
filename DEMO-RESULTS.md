# 第一版原生分屏 Demo 验收记录

本页保留首版独立标题栏的验证证据。当前原生 Tab、统一添加面板与运行标识的结果见 [TABS-RESULTS.md](TABS-RESULTS.md)。

2026-11-12。插件 `workspace-split-demo` 已安装并启用。**同一界面可以使用来自不同 workspace 的原生 Agent、终端、文件编辑器，完成真实操作。** 无需修改 Paseo 应用安装文件。

## 实测版本

| Paseo | 实际环境 | 验证范围 |
| --- | --- | --- |
| 0.13.0 | 官方同版本 Web 构建 + 独立 0.13.0 daemon | 两个 workspace、新建与导入 Agent、原生对话、终端输入和目录、文件读写、重复导入去重 |
| 0.14.0 | 官方同版本 Web 构建 + 独立 0.14.0 daemon | 上述核心流程；额外确认回复隔离、原生 provider 查询上下文 |
| 0.15.4 | 本机 Web 构建 + 实际 daemon | 核心流程、附件、未保存关闭确认、布局与性能、窄屏和主题 |
| 0.15.4 | 独立 Electron 实例，真实 `paseo://app` 页面 + 独立 daemon | 新建/导入、对话、模型与模式、权限审批、结构化问答、回退、停止、快捷键、终端输入、文件编辑保存与恢复 |

0.13 / 0.14 测试使用各自官方发布包的原始前端构建与对应 daemon，不是仅放宽版本号或将新版前端连接旧版后端。本机主 daemon 未因验收而重启。所有写操作限定在仓库 fixture 与独立测试目录。

安装要求为 `>=0.13.0`。以上是已验证版本；后续版本通过动态入口识别加载，私有接口变化仍需复测。模块契约解析结果见 [native-contracts.json](artifacts/native-contracts.json)。

## 功能验收

| 场景 | 实际结果 |
| --- | --- |
| 跨 workspace Agent 同屏 | 前、后端各自收到对应回复，另一侧不串入会话内容 |
| 新建与导入 | 原生模型选择器和 Composer 可新建；导入保留相同 ID、历史和目录；重复导入只聚焦已有窗口 |
| 连续对话与文件链接 | 第二轮回复正常；原生 Markdown 文件链接按回复来源打开正确文件 |
| 模型、模式、思考选项 | 使用宿主原生选择器，选取测试模型；桌面端切换 Plan / Default permissions 实际生效 |
| 终端 | 在原生终端输入命令，daemon capture 收到独立标记和对应 fixture 目录；桌面端也完成输入验收 |
| 文件 | 后端原生源代码编辑器保存实际更新后端文件，前端文件未变；桌面端新增标记后保存，并经 UI 恢复原文 |
| 未保存关闭 | 取消关闭保留窗口并继续保存；选择放弃后移除窗口，磁盘保留关闭前的内容 |
| 附件 | 通过原生 Upload file 选择 fixture 文本，provider 实际读取上传文件并返回第一行标记 |
| 权限审批 | 桌面原生审批卡显示接受/拒绝；点击接受后，真实工具仅向测试目录写入 `PERMISSION_UI_OK` |
| 结构化问答 | 桌面原生单选问题选择 Alpha 并提交，Agent 收到回答并回复已选择 Alpha |
| 回退 | 桌面原生“回退到此消息”菜单执行“回退对话”，历史回退、原提示恢复到 Composer，可重新提交 |
| 停止与中断 | 原生 Stop 可停止；原生配置的 Escape 在真实 `sleep 30` 工具执行时中断，Stop 按钮消失 |
| Composer 快捷键 | 原生配置的 ⌘L 聚焦当前 Agent 输入框；按键来自宿主配置，适配系统修饰键及重映射 |
| 布局与状态 | 比例、排列、均分、放大/还原、刷新恢复通过；方向变化不重建原生编辑器 DOM，快速刷新会补写布局 |
| 页面切换 | 离开分屏清空各窗口可见时间线 owner；返回后恢复两侧 Agent 的可见登记，保留布局 |
| 移除与再导入 | 移除展示后 Agent 仍为 idle，再导入保留原 ID 和历史；终端不被关闭 |
| 窄屏和主题 | 430px 仅显示一个窗口，可切换文件/Agent；浅色与深色正常 |
| 上限与压力 | 8 个混合窗口可用；第 9 个窗口提示上限；4 / 8 窗口拖动和空闲实测见性能报告 |
| 检查 | TypeScript 通过；6 项基础测试通过，原生契约检查分别在 0.13.0 / 0.14.0 / 0.15.4 构建通过 |

机器记录：[初始核心验收](artifacts/acceptance.json)、[版本兼容](artifacts/compatibility.json)、[扩展体验](artifacts/experience.json)。这些 JSON 是实际验收结果记录，自动化基础检查位于 `tools/model.test.mjs`，浏览器性能采样位于 `tools/browser-performance.py`。

## 界面与截图

移除多余标题、计数与说明栏，工具栏改为图标。桌面工具栏 28px、窗口栏 24px；窄屏分别 34px / 30px。长 Agent 标题会省略，来源 workspace 单独保留显示位置。

- [实际 Electron 四窗口](artifacts/desktop-native-four-panes.png)
- [宽屏精简布局](artifacts/minimal-wide-demo.png) / [八窗口](artifacts/minimal-eight-demo.png)
- [430px 窄屏](artifacts/compact-native-demo.png) / [浅色主题](artifacts/light-native-demo.png)
- [0.13.0](artifacts/compat-0.13.0.png) / [0.14.0](artifacts/compat-0.14.0.png)
- [结构化问答](artifacts/desktop-question.png) / [权限审批](artifacts/desktop-permission.png) / [回退菜单](artifacts/desktop-rewind-menu.png)

## 适配与性能处理

动态识别当前脚本的模块入口；0.13 缺少的 Sheet Provider 按可选能力处理；原生子树共享宿主 QueryClient，避免旧版模型列表卡在加载；插件路由下用宿主按键配置和 action dispatcher 补齐聚焦/中断。

每个窗口持有独立编辑会话缓存、唯一原生 tab 身份；稳定 memo 子树避免拖动时重复构建。布局按帧更新、300ms 防抖写入，离开页面补写。资源列表仅在选择器打开时定时刷新，隐藏页面停止目录查询，非可见窗口清理时间线 owner。

## 未覆盖的边界

语音、系统拖放、附件下载、所有 provider / MCP、provider 子 Agent 未逐项验收；跨 daemon 混排和移动端原生客户端不在本 Demo 范围。性能采样使用空闲 Agent 和混合窗口，不能代表 8 个 Agent 同时长时间流式输出，也不等同于长期内存泄漏证明。

本 Demo 验证了核心原生复用路径。私有运行时不是稳定 API，仍建议上游提供原生面板嵌入契约，再由插件负责资源选择和布局。
