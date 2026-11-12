Paseo 跨 workspace 分屏可行性调研

后续 Demo 已完成核心运行验证，并已适配 >=0.13.0（实测 0.13.0 / 0.14.0 / 0.15.4）：通过私有运行时入口复用原生面板，无需改写已安装应用。公开插件 API 的限制仍然存在，运行证据与适配边界见 [DEMO-RESULTS.md](DEMO-RESULTS.md)。

调研日期：2026-11-12。已核对本机桌面应用及 CLI，版本均为 0.15.4；同时查阅当前在线文档和 0.16.0-beta.1 的插件导出接口。本报告基于公开文档、源码和插件列表的静态分析，未对候选插件做安装验收。

**结论：产品目标在技术上可实现，但当前公开插件 API 不足以独立完成“跨 workspace 混排，并完整复用原生 Agent、终端和文件体验”。推荐让 Paseo 客户端提供原生面板嵌入能力，再由插件负责选择资源、布局和布局恢复。**

只使用现有插件 API，可以制作跨 workspace 的 Agent 总览、创建入口、会话预览以及自定义消息输入。完整原生聊天视图、终端视图和文件编辑器的嵌入是目前缺失的部分。若要求完全保持原来的交互和功能，就需要扩展客户端或维护一个包含该扩展的客户端分支。

已检索官方注册表全部 519 个插件的名称、描述和详情正文，注册表快照生成时间为 2026-11-11T16:37:08.738Z；另检索了 GitHub 的相关项目、问题和讨论。未找到满足全部需求的已发布插件。这个结论覆盖公开可发现的项目，不能排除私人或未发布实现。[官方插件目录](https://paseo.sh/plugins)、[注册表索引](https://plugins.paseo.sh/index.json)。

Paseo 上游已有几乎相同的需求：[Issue #2159](https://github.com/getpaseo/paseo/issues/2159) 和 [Issue #2174](https://github.com/getpaseo/paseo/issues/2174)。它们要求跨项目混排 Agent/终端、选择已有 Agent 和保存跨项目布局。两个问题因项目将功能建议转到 Discussions/Discord 收集而关闭，关闭状态不代表功能已经实现。

相近插件的能力如下：

| 项目 | 已提供的相关功能 | 与本需求的差距 |
| --- | --- | --- |
| [Better Paseo](https://paseo.sh/plugins/roundreddot/better-paseo) | 所有 Agent 的任务看板、筛选、详情、停止、归档和权限响应；另有聊天时间线美化 | 看板不提供多份原生完整对话的混合分屏；其时间线美化本身会调整展示方式 |
| [Agent Tabs](https://paseo.sh/plugins/m190/agent-tabs) | 跨 host 的 Agent/终端列表、预览、新建入口，点击打开对应标签 | 以总览和导航为主，打开目标仍进入对应页面；没有原生 Agent、终端、文件混排容器。部分导航依赖应用内部脚本，[作者说明](https://github.com/m190/paseo-agent-tabs/blob/5430388e7b08c3a5dfdae65f5bb9fe4d25f75bd9/OVERVIEW.md)列出了这些限制 |
| [Workspace Activity](https://paseo.sh/plugins/aborakati/workspace-activity) | Agent 树、可展开会话、工具输入输出、发送 steering 消息 | 可作为自定义监控界面的参考，但不是原生完整聊天视图的跨 workspace 分屏 |
| [SSH Manager](https://paseo.sh/plugins/ladyskillr/ssh-manager) | SSH 终端、文件浏览、2/4 终端分屏和多终端输入 | 属于 SSH 工作台；终端画面由插件自己的呈现链路绘制，没有通用原生 Agent 面板嵌入能力 |
| [Window restore](https://paseo.sh/plugins/heroicode/window-restore) | 恢复多个桌面窗口及各自的 workspace、窗口位置等 | 可以配合系统窗口平铺作为过渡方案；展示单位仍是多个窗口，且依赖部分私有桌面接口 |

还核对了实验性客户端分支 [Paseo++](https://github.com/RyanEwen/paseo-plus-plus)。它的 [Split layout controls](https://github.com/RyanEwen/paseo-plus-plus/blob/main/docs/fork-features/split-layout-controls.md) 改善分屏位置、比例和标签移动操作，没有提供已确认的跨 workspace 原生混排方案；它也不是可直接安装到官方客户端的插件。

逐项可行性判断：

| 需求 | 当前公开插件 API | 判断依据 |
| --- | --- | --- |
| 选择其他 workspace 已存在的 Agent | 支持查询和操作；可以保存引用 | SDK 提供 workspace/agent 列表和按 ID 获取 handle 的能力 |
| 在指定 workspace 新建 Agent | 支持 | `paseo.workspaces.ref(workspaceId).agents.create(...)` |
| 发消息、读取历史、处理权限 | 有对应 SDK 能力 | 能操作会话不等于获得整套原生交互组件 |
| 制作可调整布局的插件页面 | 可自行实现 | `addScreen` 提供自定义 React Native 页面；持久化布局也可实现 |
| 在格子中嵌入完整原生 Agent 对话 | 没有公开组件或嵌入接口 | `/client/ui` 未导出完整聊天面板及 Composer 组合 |
| 在格子中嵌入原生交互终端 | 没有公开组件 | 终端 SDK 的创建、输入、抓取等操作不提供原生终端视图 |
| 在格子中嵌入指定 workspace 的原生文件编辑器 | 没有通用嵌入接口 | `addFilePanel` 用于为匹配文件贡献自定义查看器，不是嵌入内置编辑器 |
| 直接把外部 workspace 的标签放进现有分屏 | 没有公开布局操作接口，而且现有模型有归属约束 | 布局、上下文及标签协调逻辑按 workspace 工作 |

操作能力见 [SDK reference](https://paseo.sh/docs/sdk/reference.md)；页面、面板、文件面板的契约见 [Plugin reference](https://paseo.sh/docs/plugins/reference.md)。

源码中有四处证据决定了实现边界：

1. **插件可用的宿主模块是明确列举的。** [evaluate.ts](https://github.com/getpaseo/paseo/blob/v0.15.4/packages/app/src/plugins/evaluate.ts#L509) 只给插件提供指定运行时模块；未提供的模块会报错。内部 `@/panels/...` 不能通过正常插件导入获得。[ui.ts](https://github.com/getpaseo/paseo/blob/v0.15.4/packages/plugin/src/client/ui.ts) 导出了 Markdown、StreamedText、Modal 等组件，没有完整 Agent/Terminal/File 面板。
2. **分屏的资源身份目前依附所属 workspace。** [model.ts](https://github.com/getpaseo/paseo/blob/v0.15.4/packages/app/src/workspace-tabs/model.ts#L36) 的 Agent 和终端 target 只有对应实体 ID，文件也没有独立的来源 workspace 上下文；布局持久化键是 `serverId:workspaceId`。跨 workspace 工作台需要另外保存每个格子的来源身份。
3. **原生视图需要完整的 pane 运行环境。** [workspace-pane-content.tsx](https://github.com/getpaseo/paseo/blob/v0.15.4/packages/app/src/screens/workspace/workspace-pane-content.tsx#L59) 为面板注入 host、workspace、标签、导航、文件打开回调、焦点和 Composer 编辑作用域。[Agent 面板](https://github.com/getpaseo/paseo/blob/v0.15.4/packages/app/src/panels/agent-panel.tsx#L308)、[终端面板](https://github.com/getpaseo/paseo/blob/v0.15.4/packages/app/src/panels/terminal-panel.tsx#L80)、[文件面板](https://github.com/getpaseo/paseo/blob/v0.15.4/packages/app/src/panels/file-panel.tsx#L31) 都使用这些内部上下文。单独复制组件或传入 agentId 不足以保持原体验。
4. **跨 workspace 标签会受到协调逻辑清理。** [agent-visibility.ts](https://github.com/getpaseo/paseo/blob/v0.15.4/packages/app/src/workspace-tabs/agent-visibility.ts#L36) 区分本 workspace 与 foreign Agent；[reconcileWorkspaceTabs](https://github.com/getpaseo/paseo/blob/v0.15.4/packages/app/src/stores/workspace-layout-actions.ts#L2436) 不保留已确认属于其他 workspace 的显式固定 Agent。直接修改标签存储不能构成稳定方案。

维护者文档也明确说明插件不能访问 Expo Router 和 workspace-layout store，见 [docs/plugins.md](https://github.com/getpaseo/paseo/blob/v0.15.4/docs/plugins.md#L414)。公开导航的 `openAgent`、`openWorkspace` 是跳转操作，不会返回可嵌入视图。

0.16.0-beta.1 新增侧边栏视图和 Composer 控制能力，便于跨 workspace/host 查询、导航和修改输入框状态；它仍没有公开原生完整面板的嵌入组件。因此升级到这个 beta 本身不能解决本需求。[版本说明](https://paseo.sh/changelog)、[beta 的客户端导出](https://github.com/getpaseo/paseo/blob/v0.16.0-beta.1/packages/plugin/src/client/index.ts)、[beta 的 UI 导出](https://github.com/getpaseo/paseo/blob/v0.16.0-beta.1/packages/plugin/src/client/ui.ts)。

可选实现路线：

| 路线 | 原生功能保持程度 | 代价与适用性 |
| --- | --- | --- |
| 现有 API + 自建聊天/终端/编辑界面 | 需要逐项重做 | 可以作为独立产品开发，但难以持续跟上原生功能，不符合本次完整保留体验的要求 |
| Paseo 客户端增加原生嵌入契约 + 插件 | 可复用原组件 | 推荐。嵌入契约被上游接受后，插件可以独立发布和升级 |
| 自维护客户端分支，内置跨 workspace 布局 | 可复用原组件 | 上游暂不接受接口时的实际选择；需要持续合并客户端更新 |
| 桌面/Web 页面嵌套、私有模块或 DOM 注入 | 未验证 | 可以研究实验原型，但焦点、快捷键、弹窗、文件打开和终端行为都有待验证，不能据此承诺完整体验 |
| 多个官方客户端窗口 + 系统窗口平铺 | 每个窗口保留原体验 | 立即可用的过渡方式，同一窗口内的布局目标仍需前述扩展 |

推荐方案将“展示位置”和“资源归属”分开：插件的每个格子保存来源 host、workspace、资源类型及 Agent/终端 ID 或文件路径；Paseo 为这个格子创建对应来源的原生面板运行环境。格子内的文件链接、新建 Agent、终端工作目录和权限操作都沿用该来源 workspace。

这里所需的原生嵌入契约是**建议新增的接口，当前并不存在**。它需要封装面板本身、焦点和 Composer 作用域、文件打开与新建资源的导航回调、订阅清理，以及断线和资源失效状态，不能只导出三个 React 组件。

“导入已有 Agent”应保存对现有 Agent 的引用，继续使用同一个会话 ID、历史及工作目录。新建 Agent 时先明确选择其所属 workspace，再调用相应 workspace 的创建 API。移除分屏格子应只移除展示引用；归档 Agent 或终止终端应作为独立操作。

建议后续先做一个范围明确的可行性验证：同一个 daemon、两个 workspace、两个可正常对话的原生 Agent 格子。验证流式回复、附件、权限/问答、模型切换、焦点快捷键、文件链接和返回原 workspace 的行为，再接入原生终端与文件编辑器。第二阶段再验证布局恢复、重新连接、资源归档/删除、宽窄屏及多主题。跨 daemon 展示可以沿用相同的资源身份设计，放在后续阶段。

当前可以据此确定开发方向；正式估算工期前，仍需用上述最小验证确认原生面板对路由和全局状态的隐含依赖。
