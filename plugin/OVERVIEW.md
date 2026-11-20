# Paseo Deck

[English](OVERVIEW.md) · [简体中文](OVERVIEW.zh-CN.md)

**Agents, terminals, and files across workspaces, in one Paseo window.**

![Native conversations and files from two workspaces in Paseo Deck](https://raw.githubusercontent.com/MinLeeV5/paseo-deck/26ae82b6af241b3fdae6542288d87eb88d5b08b8/assets/workspace.png)

## 🧩 Native tools across workspaces

Open Paseo Deck from the sidebar or Command Center and use a split's `＋` to select a workspace. Create Agents, terminals, and files from that workspace or double-click an existing resource to open it. Status dots show workspace activity and the highest-priority status in a collapsed project. Hover over a project to create a workspace or over a workspace to archive it. Archiving closes its Tabs and collapses any splits that become empty.

- **Native conversations**: Use Paseo's conversation UI, composer, and file panels inside each split.
- **Shared drafts**: Unsent text stays in sync between Deck and the Agent's original workspace on the same client.
- **Choose a base branch**: When creating a worktree, search local and remote branches or use the project's automatic choice. The last selection is remembered separately for each host and project on this client. The branch menu adapts to available space, and the compact form keeps the workspace name and project path close to their labels.
- **Deck locations**: Agents already on the board show the Deck icon and split number in the add panel, alongside their activity status. Within each activity group, Agents sort by Deck number before Agents not yet added; activity order is preserved within each Deck. Locations and ordering follow Tab moves.
- **Native entry points (0.16+)**: Add the current Agent through Command Center, or choose a Deck destination on New workspace to add its first Agent automatically. Workspace sidebar badges show which Deck splits contain its Tabs and update when you move them. An unnamed workspace follows its first Agent's generated title until you rename the workspace yourself.
- **Subagents in the current split**: Open managed and provider subagents as Tabs beside their parent, including children in another workspace on the same host. A child already open in another split moves into the current split.
- **Agent status at a glance**: Tabs show running, unread, input or approval requests, and failures using Paseo's native indicators and read behavior. The sidebar entry keeps live counts for each state and hides zero counts.

Closing a Tab removes its view without terminating its Agent or terminal. Unsaved content is checked before a batch closes.

![Creating a worktree from a selected base branch](assets/workspace-creation.png)

## ↔️ Drag Tabs to arrange your view

Reorder Tabs within a bar, move them between splits, or drop into another split's center to join its group. Drop at a content area's left, right, top, or bottom edge to create a new split in that direction.

![Dragging Frontend README to the bottom edge previews a new split](https://raw.githubusercontent.com/MinLeeV5/paseo-deck/26ae82b6af241b3fdae6542288d87eb88d5b08b8/assets/tab-drag-preview.png)

_The highlighted area shows where the Tab will land._

![Three panes after the drop, with a draft on the left and two files stacked on the right](https://raw.githubusercontent.com/MinLeeV5/paseo-deck/26ae82b6af241b3fdae6542288d87eb88d5b08b8/assets/tab-drag-three-panes.png)

_Two columns become three panes while the draft stays in place._

Moving Tabs preserves their content, including unsent drafts and unsaved file edits. Press `Esc` or release outside the board to cancel. An empty source split collapses when its last Tab moves out.

Resize with the dividers, maximize a split temporarily, or choose two, three, or four columns or a 2 × 2 grid from the layout menu.

## ⚡ Actions from the active workspace

Each Tab bar follows its active Tab's source workspace. Run its scripts, open files in an external editor, and use registered plugin buttons and panels without leaving the board.

![Workspace actions and the external editor menu](https://raw.githubusercontent.com/MinLeeV5/paseo-deck/26ae82b6af241b3fdae6542288d87eb88d5b08b8/assets/workspace-actions.png)

Choose which plugin buttons stay in the Tab bar; narrow splits keep the same actions in the overflow menu. Layouts and toolbar preferences are saved per host on the current client.

## Requirements and data

Requires **Paseo daemon and client 0.13.0+**. Desktop and Web are supported; native iOS/Android clients are not. Current plugin menus use Simplified Chinese.

A board contains up to **8 splits** from one selected host, with no limit on resource Tabs. The add panel reads up to 200 Agents and 200 workspaces. External editor targets depend on Paseo's desktop capabilities; third-party panels keep their own requirements.

Layouts and preferences do not sync between clients. Messages, attachments, and tool results use Paseo's existing host and configured provider connections. Scripts run in their source workspace on the selected host. No separate account or API key is needed for Deck.

This experimental plugin uses private Paseo UI components. Its daemon-side component reads the installed Paseo web bundle to locate native views, and its client component wraps the host composer to synchronize drafts. It does not change application files. Matching daemon/client builds of 0.13.0, 0.14.0, 0.15.4, and 0.16.0 were tested. Future builds may need adaptation, and an unsupported build displays an error. GitLens, conversation bookmarks, and Keep awake were exercised; other integrations may behave differently.

Source, installation, and development: [MinLeeV5/paseo-deck](https://github.com/MinLeeV5/paseo-deck#readme). Report problems in [GitHub Issues](https://github.com/MinLeeV5/paseo-deck/issues).
