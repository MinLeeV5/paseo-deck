import test from "node:test";
import assert from "node:assert/strict";
import { emptyBoard, addPane, boardSchema, groupInspector } from "../plugin/shared/model.ts";
import { applyLayoutPreset, boardGeometry, layoutTracks } from "../plugin/shared/layout.ts";
const resource = (index, workspaceId = "front") => ({ id: `pane-${index}`, serverId: "host", workspaceId, workspaceName: workspaceId, title: `Agent ${index}`, target: { kind: "agent", agentId: `agent-${index}` } });
const populated = Array.from({ length: 8 }, (_, i) => resource(i)).reduce((board, pane) => addPane(board, pane), emptyBoard);
for (const [preset, count, columns, rows] of [["two", 2, 2, 1], ["three", 3, 3, 1], ["four", 4, 4, 1], ["grid", 4, 2, 2]]) {
  test(`${preset} redistributes every resource once and preserves native identities`, () => {
    const result = applyLayoutPreset(populated, preset, "pane-6");
    assert.equal(result.groups.length, count);
    assert.equal(result.panes, populated.panes);
    assert.deepEqual(result.groups.flatMap((group) => group.tabIds), populated.groups.flatMap((group) => group.tabIds));
    assert.equal(result.groups.find((group) => group.tabIds.includes("pane-6")).activeTabId, "pane-6");
    const geometry = boardGeometry(result, 1200, 800);
    assert.equal(geometry.columns, columns); assert.equal(geometry.rows, rows);
    const rectangles = [...geometry.rects.values()];
    assert.equal(rectangles.reduce((sum, r) => sum + r.width * r.height, 0), 1200 * 800);
    for (const rect of rectangles) { assert.ok(rect.left >= 0 && rect.top >= 0); assert.ok(rect.left + rect.width <= 1200.001); assert.ok(rect.top + rect.height <= 800.001); }
    assert.equal(boardSchema.safeParse(result).success, true);
  });
}
test("presets create usable empty splits without creating resources", () => {
  const result = applyLayoutPreset(addPane(emptyBoard, resource(1)), "three");
  assert.equal(result.panes.length, 1); assert.deepEqual(result.groups.map((group) => group.tabIds.length), [1, 0, 0]);
  assert.ok(result.groups.slice(1).every((group) => group.activeTabId === null));
});
test("grid resizing has independent horizontal and vertical tracks", () => {
  const board = { ...applyLayoutPreset(populated, "grid"), columnWeights: [0.3, 0.7], rowWeights: [0.6, 0.4] };
  const result = boardGeometry(board, 1000, 500);
  assert.deepEqual([...result.rects.values()].map(({ left, top, width, height }) => [left, top, width, height]), [[0, 0, 300, 300], [300, 0, 700, 300], [0, 300, 300, 200], [300, 300, 700, 200]]);
  assert.equal(result.dividers.filter((divider) => divider.axis === "x").length, 2);
  assert.equal(result.dividers.filter((divider) => divider.axis === "y").length, 1);
  assert.deepEqual(layoutTracks({ ...board, columnWeights: [1] }).columnWeights, [0.5, 0.5]);
});
test("inspector and opener stay together through automatic layout", () => {
  const opener = resource(0);
  const inspector = { ...resource(1), target: { kind: "plugin", pluginId: "bookmarks", panelId: "bookmarks", context: "workspace" }, presentation: "inspector", openerTabId: opener.id };
  const board = addPane(addPane(emptyBoard, opener), inspector);
  const next = applyLayoutPreset(board, "grid", inspector.id);
  const group = next.groups.find((group) => group.activeTabId === inspector.id);
  assert.deepEqual(group.tabIds, [opener.id, inspector.id]);
  assert.equal(groupInspector(next, group).opener, opener);
  const foreign = { ...next, panes: next.panes.map((pane) => pane.id === opener.id ? { ...pane, workspaceId: "other" } : pane) };
  assert.equal(groupInspector(foreign, group), null);
});
test("agent plugin panels require the owning agent ID", () => {
  const target = { kind: "plugin", pluginId: "test", panelId: "test", context: "agent" };
  assert.equal(boardSchema.safeParse(addPane(emptyBoard, { ...resource(0), target })).success, false);
  assert.equal(boardSchema.safeParse(addPane(emptyBoard, { ...resource(0), target: { ...target, agentId: "agent-0" } })).success, true);
});
