<h1 align="center">Paseo Deck</h1>

<p align="center"><strong>Agents, terminals, and files across workspaces, in one Paseo window.</strong></p>

<p align="center">
  <a href="plugin/paseo-plugin.json"><img src="https://img.shields.io/badge/Paseo-0.13.0%2B-0078D4" alt="Paseo 0.13.0 or later" /></a>
  <a href="#scope-and-compatibility"><img src="https://img.shields.io/badge/platform-desktop%20%2F%20Web-2DA44E" alt="Desktop and Web" /></a>
</p>

<p align="center"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>

<p align="center">
  <a href="#get-started">Get started</a> ·
  <a href="#add-agents-and-resources">Add resources</a> ·
  <a href="#arrange-your-splits">Layouts</a> ·
  <a href="#use-workspace-actions">Workspace actions</a> ·
  <a href="#develop-and-verify">Development</a> ·
  <a href="https://github.com/MinLeeV5/paseo-deck">GitHub</a> ·
  <a href="https://github.com/MinLeeV5/paseo-deck/issues">Issues</a>
</p>

- **Work across workspaces**: Bring existing Agents, terminals, and files into the same view on one host.
- **Keep native conversations**: Use Paseo's conversation UI, composer, and file panels inside each split.
- **Arrange your work**: Give each split its own Tabs, drag to reorder or split, and choose common layouts.
- **Follow the current workspace**: Run its scripts, open its files in an editor, and use its plugin buttons.
- **Remember your setup**: Restore layouts and choose which plugin buttons stay in the Tab bar.

![Paseo Deck with native conversation and file panels from two workspaces](assets/workspace.png)

_Screenshots show the current Paseo Deck interface in isolated demo workspaces._

## Get started

Requires **Paseo daemon and client 0.13.0+**. Supports the desktop app and Web client.

Enable plugins in **Settings → Plugins** on the target daemon. Clone the repository and install the plugin on that host:

```bash
git clone https://github.com/MinLeeV5/paseo-deck.git
cd paseo-deck
paseo plugin install "$PWD/plugin"
```

Open **Paseo Deck** in the sidebar, or search for **Paseo Deck** in the Command Center (`⌘K` / `Ctrl+K`). Plugin ID: `paseo-deck`. Current plugin menu labels are in Simplified Chinese.

## Add Agents and resources

Click a split's **`＋`** to open the unified add panel. Search existing Agents, filter by workspace, or create an Agent, terminal, or file view. Running and initializing Agents have a separate section; Agent Tabs use their source workspace's icon.

Choose the current split or a new split as the destination. Adding an Agent or terminal that is already on the board focuses its existing Tab.

![Unified add panel with workspace selection and existing Agents](assets/add-tab.png)

## Arrange your splits

Drag a Tab within its bar to reorder it, or into another bar to move it. Drag to a content area's edge to split in that direction; drag to its center to merge into that group. A preview shows the destination. Press `Esc` or release outside the board to cancel.

Moving a group's last Tab also removes its empty area. To increase the number of splits by dragging, split off an extra Tab. Resize using the divider grips, or maximize a split temporarily.

Use **`··· → 排版`** for presets:

| Layout         | Arrangement   |
| -------------- | ------------- |
| 两分屏         | Two columns   |
| 三分屏（横向） | Three columns |
| 四分屏（横向） | Four columns  |
| 四宫格         | A 2 × 2 grid  |

Presets redistribute existing Tabs and preserve their content instances, creating empty splits when needed. Vertical stacking and equal sizing are also available.

Closing Tabs removes their views and keeps the Agents and terminals. **关闭所有 Tab** closes the whole board after checking unsaved content; canceling any confirmation keeps the entire batch. Tab context menus provide rename, copy, reload, and close-left/right/others actions where applicable; those batch actions stay within the clicked Tab's group.

## Use workspace actions

The right side of a Tab bar follows the **active Tab's source workspace**, even when a group contains Tabs from several workspaces.

- **启动脚本**: Start, stop, restart, or view a workspace script. Its native terminal opens in the same split.
- **外部打开**: Open the workspace or current file using a target available through Paseo, such as an editor or file manager.
- **插件**: Use registered workspace buttons and open their panels inside the board. GitLens uses a Tab; conversation bookmarks can sit beside their source conversation.

These actions remain available in **`···`** when narrow splits hide their toolbar shortcuts. Menus share the same row style and open to the left when there is insufficient room on the right; compact layouts use native sheets.

![Workspace actions with the external editor submenu opening to the left](assets/workspace-actions.png)

## Choose your toolbar buttons

Open **`··· → 插件 → 按钮显示设置`** to choose which plugin buttons stay outside the menu. Defaults use the current workspace's first three available buttons. Selected buttons move into the menu when space is limited; unavailable workspace contributions are labeled.

Layouts and toolbar preferences are saved **per host on the current client**. They do not sync between clients. Agent messages, files, terminals, and scripts continue through Paseo's existing host and provider connections.

![Plugin button preferences in Paseo Deck](assets/button-settings.png)

## Keyboard shortcuts

Shortcuts act on the focused split and follow Paseo's configured bindings. These are desktop defaults on macOS:

| Shortcut                      | Action                                             |
| ----------------------------- | -------------------------------------------------- |
| `⌘T` / `⌘W`                   | Add / close a Tab                                  |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous Tab                                |
| `⌘⌥1` … `⌘⌥8`                 | Select a Tab by its position                       |
| `⌘⇧A` / `⌘⇧T`                 | New Agent / terminal in the current workspace      |
| `⌘\` / `⌘⇧\`                  | Add a split with horizontal / vertical arrangement |
| `⌘L`                          | Focus the Agent composer                           |
| `Shift+F10`                   | Open the focused Tab's context menu                |
| `Esc`                         | Dismiss a menu or cancel a drag                    |

On Windows/Linux, creation, closing, and composer focus use Paseo's `Ctrl` bindings. Web closing defaults to `Alt+Shift+W` to avoid the browser's reserved shortcut. Dialogs and the add panel suspend board shortcuts; unsaved-content checks still apply.

## Scope and compatibility

- One selected host, up to **8 resource Tabs / 8 splits**. The add panel reads up to 200 Agents and 200 workspaces.
- Tested with matching daemon/client builds of **0.13.0, 0.14.0, and 0.15.4**, including the 0.15.4 Electron app on macOS. Native iOS/Android clients are not supported.
- This experimental plugin reuses **private Paseo UI components** without modifying application files. Future app builds may require a compatibility update; an unsupported build displays an error.
- Third-party panels keep their own behavior and requirements. GitLens, conversation bookmarks, and Keep awake were exercised; this does not establish compatibility with every plugin.

## Develop and verify

Requires **Node.js 24+**. From the repository root:

```bash
npm run setup
npm run typecheck
npm test
npm run install:plugin
```

After source changes, run the checks and `npm run reload:plugin`. Reload the plugin to apply code changes.

| Command                 | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `npm run setup`         | Install development dependencies for the repository and plugin    |
| `npm run typecheck`     | Check TypeScript                                                  |
| `npm test`              | Run model, layout, shortcut, and menu-placement tests             |
| `npm run reload:plugin` | Reload `paseo-deck` on the selected local daemon                  |
| `npm run demo`          | Open the installed Paseo Web UI through a temporary local harness |

The demo prints an authenticated loopback URL. On macOS it reads `/Applications/Paseo.app/Contents/Resources/app-dist`; override with `PASEO_DECK_APP_DIST` and change the port with `PASEO_DECK_DEMO_PORT`. `PASEO_DECK_HOME` selects an isolated daemon. See [the harness](tools/demo.mjs) for all options.

Verification: [Tabs](TABS-RESULTS.md), [dragging to split](SPLIT-DRAG-RESULTS.md), [workspace actions and menus](ACTIONS-RESULTS.md), and [Tab context menus](TAB-CONTEXT-RESULTS.md). Measurements and test boundaries are in the [performance report](PERFORMANCE.md); see the [interaction design](design/INTERACTION-DESIGN.md) and [initial feasibility research](RESEARCH.md) for background.
