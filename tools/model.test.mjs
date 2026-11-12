import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  addPane,
  boardSchema,
  emptyBoard,
  findMetroModule,
  restoreBoard,
  removeTab,
  moveTab,
  activateTab,
  relatedTabIds,
  targetSchema,
} from "../plugin/shared/model.ts";
import {
  matchesShortcutStroke,
  shortcutDigit,
} from "../plugin/shared/shortcuts.ts";
const pane = (workspaceId, id = "agent-1") => ({
  id: `pane-${workspaceId}-${id}`,
  serverId: "host-1",
  workspaceId,
  workspaceName: workspaceId,
  title: "Agent",
  target: { kind: "agent", agentId: id },
});
test("native fork settings survive opening and restoring a Deck draft", () => {
  const target = {
    kind: "draft",
    draftId: "fork-draft",
    setup: {
      provider: "codex",
      cwd: "/source/workspace",
      model: "source-model",
      modeId: "plan",
      thinkingOptionId: "high",
      featureValues: { sandbox: "workspace-write", webSearch: false },
    },
  };
  const opened = addPane(emptyBoard, {
    ...pane("workspace-a", "draft"),
    target: targetSchema.parse(target),
  });
  assert.deepEqual(opened.panes[0].target, target);
  const restored = restoreBoard(JSON.parse(JSON.stringify(opened)), "host-1");
  assert.deepEqual(restored.panes[0].target, target);
});
test("resource references retain their workspace and deduplicate repeated imports", () => {
  const once = addPane(emptyBoard, pane("workspace-a"));
  assert.equal(addPane(once, pane("workspace-a")), once);
  const twice = addPane(once, pane("workspace-b"));
  assert.equal(twice.panes.length, 2);
  assert.deepEqual(
    twice.panes.map((p) => p.workspaceId),
    ["workspace-a", "workspace-b"],
  );
});
test("restored state rejects invalid resource identities and split ratios", () => {
  assert.equal(
    boardSchema.safeParse({
      ...emptyBoard,
      panes: [{ ...pane("workspace-a"), workspaceId: "" }],
    }).success,
    false,
  );
  assert.equal(
    boardSchema.safeParse({ ...emptyBoard, ratio: 0.01 }).success,
    false,
  );
  assert.equal(
    boardSchema.safeParse(addPane(emptyBoard, pane("workspace-a"))).success,
    true,
  );
});
test("the pane limit is checked before adding another resource", () => {
  let state = emptyBoard;
  for (let i = 0; i < 8; i++) state = addPane(state, pane(`workspace-${i}`));
  assert.throws(() => addPane(state, pane("workspace-9")), /8/);
});
test("private component lookup follows the current build instead of a fixed module id", () => {
  const source =
    "\n__d(function(g,r,i,a,m,e,d){e.WorkspacePaneContent=function(){};},91,[1,2]);\n__d(function(g,r,i,a,m,e,d){e.Other=function(){};},27,[]);";
  assert.equal(findMetroModule(source, "WorkspacePaneContent"), 91);
  assert.throws(
    () => findMetroModule(source, "getPanelRegistration"),
    /getPanelRegistration/,
  );
});
test("the installed Paseo build exposes the native panel contract", async () => {
  const base =
    process.env.PASEO_DECK_APP_DIST ??
    "/Applications/Paseo.app/Contents/Resources/app-dist";
  const html = await readFile(`${base}/index.html`, "utf8");
  const path = html.match(
    /src="([^"]*\/_expo\/static\/js\/web\/index-[^"]+\.js)"/,
  )[1];
  const source = await readFile(`${base}${path}`, "utf8");
  for (const name of [
    "WorkspacePaneContent",
    "WorkspaceTabPresentationResolver",
    "StatusIcon",
    "getPanelRegistration",
    "ensurePanelsRegistered",
    "ComposerEditingSessionsProvider",
    "WorkspaceComposerEditingSessionsProvider",
    "useSessionStore",
    "getHostRuntimeStore",
    "useShortcutKeys",
    "useKeyboardActionDispatcher",
    "queryClient",
    "ProjectIconView",
    "useProjectIcons",
    "ContextMenuTrigger",
    "buildWorkspaceTabMenuEntries",
    "WorkspaceTabRenameModal",
    "useFilePanelOpenWithMenu",
    "buildProviderCommand",
  ])
    assert.ok(Number.isInteger(findMetroModule(source, name)));
});
test("Composer focus respects native modifiers, remapping and IME input", () => {
  const key = {
    key: "l",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  };
  assert.equal(matchesShortcutStroke(key, ["mod", "L"], true), true);
  assert.equal(matchesShortcutStroke(key, ["mod", "L"], false), false);
  assert.equal(
    matchesShortcutStroke(
      { ...key, metaKey: false, ctrlKey: true },
      ["mod", "L"],
      false,
    ),
    true,
  );
  assert.equal(
    matchesShortcutStroke({ ...key, shiftKey: true }, ["mod", "L"], true),
    false,
  );
  assert.equal(
    matchesShortcutStroke({ ...key, isComposing: true }, ["mod", "L"], true),
    false,
  );
  assert.equal(matchesShortcutStroke(key, [], true), false);
  assert.equal(
    matchesShortcutStroke(
      { ...key, key: "j", shiftKey: true },
      ["mod", "shift", "J"],
      true,
    ),
    true,
  );
});

test("number shortcuts recognize physical digits with macOS Option symbols", () => {
  const key = {
    key: "¡",
    code: "Digit1",
    metaKey: true,
    ctrlKey: false,
    altKey: true,
    shiftKey: false,
  };
  assert.equal(shortcutDigit(key), 1);
  assert.equal(matchesShortcutStroke(key, ["mod", "alt", "1-9"], true), true);
  assert.equal(
    matchesShortcutStroke(
      { ...key, altKey: false },
      ["mod", "alt", "1-9"],
      true,
    ),
    false,
  );
  assert.equal(
    matchesShortcutStroke(
      { ...key, isComposing: true },
      ["mod", "alt", "1-9"],
      true,
    ),
    false,
  );
  assert.equal(shortcutDigit({ key: "8" }), 8);
  assert.equal(shortcutDigit({ key: "0", code: "Digit0" }), null);
  assert.equal(shortcutDigit({ key: "ArrowRight" }), null);
});

test("split shortcuts recognize shifted Backslash without ignoring modifiers", () => {
  const event = {
    key: "|",
    code: "Backslash",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: true,
  };
  assert.equal(
    matchesShortcutStroke(event, ["mod", "shift", "\\"], true),
    true,
  );
  assert.equal(matchesShortcutStroke(event, ["mod", "\\"], true), false);
});

test("v1 layouts migrate one window per group without losing resource state", () => {
  const resources = [
    pane("frontend"),
    { ...pane("backend"), state: { scrollTop: 42 } },
  ];
  const result = restoreBoard({
    version: 1,
    panes: resources,
    direction: "column",
    ratio: 0.63,
  });
  assert.equal(result.version, 2);
  assert.deepEqual(result.panes, resources);
  assert.deepEqual(
    result.groups.map((group) => group.tabIds),
    resources.map((pane) => [pane.id]),
  );
  assert.equal(result.ratio, 0.63);
  assert.equal(boardSchema.safeParse(result).success, true);
});
test("switching, moving and closing Tabs preserve other resources and their identities", () => {
  const first = pane("frontend"),
    second = pane("backend");
  let board = addPane(addPane(emptyBoard, first), second);
  assert.equal(board.groups.length, 1);
  board = activateTab(board, first.id);
  const moved = moveTab(board, second.id, "group-backend", true);
  assert.equal(moved.panes[0], first);
  assert.equal(moved.panes[1], second);
  assert.equal(moved.groups.length, 2);
  const returned = moveTab(moved, second.id, moved.groups[0].id);
  assert.equal(returned.groups.length, 1);
  assert.equal(returned.panes.length, 2);
  const closed = removeTab(returned, second.id);
  assert.equal(closed.groups[0].activeTabId, first.id);
  assert.equal(removeTab(closed, first.id).groups[0].activeTabId, null);
  assert.equal(boardSchema.safeParse(closed).success, true);
});
test("corrupt group identities and stale destinations cannot orphan a Tab", () => {
  const board = addPane(emptyBoard, pane("frontend"));
  assert.equal(
    boardSchema.safeParse({
      ...board,
      groups: [
        ...board.groups,
        {
          id: "copy",
          tabIds: board.groups[0].tabIds,
          activeTabId: board.groups[0].activeTabId,
        },
      ],
    }).success,
    false,
  );
  assert.throws(
    () => addPane(board, pane("backend"), { groupId: "removed" }),
    /分屏/,
  );
  assert.equal(restoreBoard({ ...board, groups: [] }), null);
});

test("Tabs reorder in both directions using the final insertion position", () => {
  const tabs = [pane("a"), pane("b"), pane("c"), pane("d")];
  const board = tabs.reduce((state, tab) => addPane(state, tab), emptyBoard);
  const groupId = board.groups[0].id;
  const right = moveTab(board, tabs[0].id, groupId, false, 2);
  assert.deepEqual(right.groups[0].tabIds, [
    tabs[1].id,
    tabs[2].id,
    tabs[0].id,
    tabs[3].id,
  ]);
  const left = moveTab(right, tabs[3].id, groupId, false, 0);
  assert.deepEqual(left.groups[0].tabIds, [
    tabs[3].id,
    tabs[1].id,
    tabs[2].id,
    tabs[0].id,
  ]);
  assert.equal(left.panes, board.panes);
  assert.equal(left.groups[0].activeTabId, board.groups[0].activeTabId);
  assert.equal(moveTab(left, tabs[2].id, groupId, false, 2), left);
  assert.equal(boardSchema.safeParse(left).success, true);
});

test("cross-group insertion preserves resources and chooses a neighboring source Tab", () => {
  const tabs = [
    pane("a"),
    pane("b"),
    pane("c"),
    { ...pane("d"), state: { draft: "unsaved" } },
  ];
  let board = tabs.reduce((state, tab) => addPane(state, tab), emptyBoard);
  board = moveTab(board, tabs[0].id, "other", true);
  board = moveTab(board, tabs[1].id, "other");
  const moved = moveTab(board, tabs[3].id, "other", false, 1);
  assert.deepEqual(moved.groups.find((g) => g.id === "other").tabIds, [
    tabs[0].id,
    tabs[3].id,
    tabs[1].id,
  ]);
  assert.equal(
    moved.groups.find((g) => g.id === "other").activeTabId,
    tabs[3].id,
  );
  assert.equal(moved.groups[0].activeTabId, tabs[2].id);
  assert.equal(moved.panes, board.panes);
  assert.equal(moved.panes[3], tabs[3]);
  assert.equal(boardSchema.safeParse(moved).success, true);
});

test("moving the last Tab into an empty group removes only the source group", () => {
  const tab = pane("a");
  const board = {
    ...addPane(emptyBoard, tab),
    groups: [
      ...addPane(emptyBoard, tab).groups,
      { id: "empty", tabIds: [], activeTabId: null },
    ],
  };
  const moved = moveTab(board, tab.id, "empty", false, 0);
  assert.deepEqual(moved.groups, [
    { id: "empty", tabIds: [tab.id], activeTabId: tab.id },
  ]);
  assert.equal(moved.panes, board.panes);
  assert.equal(boardSchema.safeParse(moved).success, true);
});

test("stale moves and existing new-group IDs cannot corrupt the board", () => {
  const tab = pane("a");
  const board = addPane(emptyBoard, tab);
  assert.equal(moveTab(board, "missing", board.groups[0].id, false, 0), board);
  assert.equal(moveTab(board, tab.id, "missing", false, 0), board);
  assert.equal(moveTab(board, tab.id, board.groups[0].id), board);
  const split = moveTab(addPane(board, pane("b")), tab.id, "other", true);
  assert.equal(moveTab(split, tab.id, split.groups[0].id, true), split);
});

test("context-menu closes follow visual order in the clicked Tab's own split", () => {
  const tabs = [pane("a"), pane("b"), pane("c"), pane("d")];
  let board = tabs.reduce((state, tab) => addPane(state, tab), emptyBoard);
  board = moveTab(board, tabs[3].id, "other", true);
  board = moveTab(board, tabs[2].id, board.groups[0].id, false, 0);
  board = activateTab(board, tabs[1].id);
  assert.deepEqual(relatedTabIds(board, tabs[0].id, "before"), [tabs[2].id]);
  assert.deepEqual(relatedTabIds(board, tabs[0].id, "after"), [tabs[1].id]);
  const others = relatedTabIds(board, tabs[0].id, "others");
  assert.deepEqual(others, [tabs[2].id, tabs[1].id]);
  const closed = others.reduce(removeTab, board);
  assert.equal(closed.groups[0].activeTabId, tabs[0].id);
  assert.equal(
    closed.panes.find((p) => p.id === tabs[3].id),
    tabs[3],
  );
  assert.equal(boardSchema.safeParse(closed).success, true);
});

test("context-menu boundary and stale Tabs never target unrelated resources", () => {
  const first = pane("a"),
    last = pane("b");
  const board = addPane(addPane(emptyBoard, first), last);
  assert.deepEqual(relatedTabIds(board, first.id, "before"), []);
  assert.deepEqual(relatedTabIds(board, last.id, "after"), []);
  const alone = moveTab(board, last.id, "other", true);
  for (const scope of ["before", "after", "others"]) {
    assert.deepEqual(relatedTabIds(alone, last.id, scope), []);
    assert.deepEqual(relatedTabIds(alone, "missing", scope), []);
  }
});
