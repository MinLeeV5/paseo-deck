# Paseo Deck

[English](OVERVIEW.md) · [简体中文](OVERVIEW.zh-CN.md)

**Agents, terminals, and files across workspaces, in one Paseo window.**

- **Native conversations**: Add existing Agents or create new ones, then use Paseo's conversation UI and composer in each split.
- **Flexible layouts**: Give each split its own Tabs. Drag to reorder, move, split, or resize; choose two, three, or four columns, or a 2 × 2 grid.
- **One add panel**: Search Agents and choose a workspace, with running Agents grouped separately and workspace icons on their Tabs.
- **Workspace actions**: Run the active Tab's scripts, open its files externally, and use registered plugin buttons and panels.
- **Saved preferences**: Restore the layout and choose which plugin buttons remain in the Tab bar, with overflow access in narrow splits.

## Workflow

Open Paseo Deck from the sidebar or Command Center, select a host, and use a split's `＋` to add resources. Agent, terminal, and file content uses Paseo's native components. Closing a Tab removes its view; it does not terminate its Agent or terminal. Unsaved content is checked before a batch closes.

Layouts and button preferences are stored per host on the current client and do not sync between clients. Messages, attachments, and tool results use Paseo's existing host and configured provider connections. Scripts run in their source workspace on the selected host. No separate account or API key is needed for Deck.

## Requirements and scope

Requires **Paseo daemon and client 0.13.0+**. Desktop and Web are supported; native iOS/Android clients are not. Current plugin menus use Simplified Chinese.

A board contains up to **8 resource Tabs / 8 splits** from one selected host. The add panel reads up to 200 Agents and 200 workspaces. External editor targets depend on Paseo's desktop capabilities; third-party panels keep their own requirements.

This experimental plugin uses private Paseo UI components without changing application files. Matching daemon/client builds of 0.13.0, 0.14.0, and 0.15.4 were tested. Future builds may need adaptation, and an unsupported build displays an error. GitLens, conversation bookmarks, and Keep awake were exercised; other integrations may behave differently.

Source, installation, and development: [MinLeeV5/paseo-deck](https://github.com/MinLeeV5/paseo-deck#readme). Report problems in [GitHub Issues](https://github.com/MinLeeV5/paseo-deck/issues).
