import test from "node:test";
import assert from "node:assert/strict";
import {
  groupPickerAgents,
  pickerAgentActivity,
  sameAgentDirectoryEntry,
} from "../plugin/client/agent-picker.ts";

const agent = (id, extra = {}) => ({
  id,
  workspaceId: "workspace",
  title: id,
  cwd: "/project",
  status: "idle",
  updatedAt: "2026-11-16T08:00:00Z",
  lastUserMessageAt: null,
  pendingPermissions: [],
  ...extra,
});

test("pending input, unread and running agents precede background work and recent sessions", () => {
  const entries = [
    agent("recent"),
    agent("background", { backgroundWork: { count: 2 } }),
    agent("running", { status: "running" }),
    agent("unread"),
    agent("waiting", { attentionReason: "permission" }),
  ];
  const groups = groupPickerAgents(entries, { unread: "attention" });
  assert.deepEqual(
    groups.map((g) => [g.key, g.agents.map((a) => a.id)]),
    [
      ["needs_input", ["waiting"]],
      ["attention", ["unread"]],
      ["running", ["running"]],
      ["background", ["background"]],
      ["recent", ["recent"]],
    ],
  );
});

test("an unread running agent appears once and keeps its background count", () => {
  const entry = agent("unread-running", {
    status: "running",
    backgroundWork: { count: 3 },
  });
  const groups = groupPickerAgents([entry], { [entry.id]: "attention" });
  assert.equal(groups.flatMap((g) => g.agents).length, 1);
  assert.equal(
    groups.find((g) => g.key === "attention").agents[0].id,
    entry.id,
  );
  assert.deepEqual(pickerAgentActivity(entry, "attention"), {
    group: "attention",
    badge: "未读",
    status: "attention",
    backgroundCount: 3,
    running: true,
  });
});

test("daemon finished flags do not resurrect locally read agents as unread", () => {
  const entry = agent("read", {
    requiresAttention: true,
    attentionReason: "finished",
  });
  assert.equal(pickerAgentActivity(entry).group, "recent");
  assert.equal(groupPickerAgents([entry], {}, "attention")[0].agents.length, 0);
});

test("status filters never include unrelated high-priority groups", () => {
  const entries = [
    agent("waiting", { pendingPermissions: [{ id: "permission" }] }),
    agent("unread"),
    agent("running", { status: "running" }),
  ];
  assert.deepEqual(
    groupPickerAgents(entries, { unread: "attention" }, "running").flatMap(
      (g) => g.agents.map((a) => a.id),
    ),
    ["running"],
  );
  assert.equal(
    pickerAgentActivity(agent("failed", { status: "error" })).group,
    "needs_input",
  );
});

test("activity groups sort by their latest relevant activity with a stable tie-break", () => {
  const entries = [
    agent("b"),
    agent("a"),
    agent("newest", { attentionTimestamp: "2026-11-16T09:00:00Z" }),
  ];
  assert.deepEqual(
    groupPickerAgents(entries, {})
      .at(-1)
      .agents.map((a) => a.id),
    ["newest", "a", "b"],
  );
});

test("Deck numbers order Agents within each activity group and leave unplaced Agents last", () => {
  const entries = [
    agent("unplaced-new", { updatedAt: "2026-11-16T12:00:00Z" }),
    agent("deck-three", { updatedAt: "2026-11-16T11:00:00Z" }),
    agent("deck-one-old"),
    agent("waiting", { attentionReason: "permission" }),
    agent("deck-two", { updatedAt: "2026-11-16T10:00:00Z" }),
    agent("running", { status: "running" }),
    agent("deck-one-new", { updatedAt: "2026-11-16T09:00:00Z" }),
    agent("unplaced-old", { updatedAt: "2026-11-16T07:00:00Z" }),
  ];
  const decks = new Map([
    ["waiting", 3],
    ["running", 1],
    ["deck-three", 3],
    ["deck-two", 2],
    ["deck-one-old", 1],
    ["deck-one-new", 1],
  ]);
  assert.deepEqual(
    groupPickerAgents(entries, {}, "all", decks)
      .filter((g) => g.agents.length)
      .map((g) => [g.key, g.agents.map((a) => a.id)]),
    [
      ["needs_input", ["waiting"]],
      ["running", ["running"]],
      [
        "recent",
        [
          "deck-one-new",
          "deck-one-old",
          "deck-two",
          "deck-three",
          "unplaced-new",
          "unplaced-old",
        ],
      ],
    ],
  );
});

test("Deck moves and removals update ordering while status filters retain their scope", () => {
  const entries = [
    agent("left", { status: "running" }),
    agent("right", { status: "running" }),
    agent("waiting", { attentionReason: "permission" }),
  ];
  const order = (decks) =>
    groupPickerAgents(entries, {}, "running", new Map(decks)).flatMap((g) =>
      g.agents.map((a) => a.id),
    );
  assert.deepEqual(
    order([
      ["left", 3],
      ["right", 1],
      ["waiting", 1],
    ]),
    ["right", "left"],
  );
  assert.deepEqual(
    order([
      ["left", 1],
      ["right", 2],
    ]),
    ["left", "right"],
  );
  assert.deepEqual(order([["right", 2]]), ["right", "left"]);
});

test("archived and hidden background agents do not leak into the picker", () => {
  const entries = [
    agent("archived", { archivedAt: "2026-11-16" }),
    agent("helper", { background: true, backgroundWork: { count: 1 } }),
    agent("orphan", { workspaceId: null }),
    agent("visible"),
  ];
  assert.deepEqual(
    groupPickerAgents(entries, {}).flatMap((g) => g.agents.map((a) => a.id)),
    ["visible"],
  );
});

test("older hosts without background summaries retain ordinary status behavior", () => {
  assert.equal(pickerAgentActivity(agent("old")).backgroundCount, 0);
  assert.equal(
    pickerAgentActivity(agent("old-running", { status: "running" })).group,
    "running",
  );
  assert.equal(
    pickerAgentActivity(
      agent("idle-background", { backgroundWork: { count: 2 } }),
    ).running,
    false,
  );
});

test("directory updates publish background and attention changes without rebuilding for streamed tokens", () => {
  const previous = agent("live");
  assert.equal(
    sameAgentDirectoryEntry(previous, {
      ...previous,
      updatedAt: "2026-11-16T09:00:00Z",
    }),
    true,
  );
  assert.equal(
    sameAgentDirectoryEntry(previous, {
      ...previous,
      backgroundWork: { count: 1 },
    }),
    false,
  );
  assert.equal(
    sameAgentDirectoryEntry(previous, {
      ...previous,
      attentionReason: "permission",
    }),
    false,
  );
  assert.equal(
    sameAgentDirectoryEntry(previous, {
      ...previous,
      pendingPermissions: [{ id: "permission" }],
    }),
    false,
  );
  assert.equal(
    sameAgentDirectoryEntry(previous, {
      ...previous,
      lastUserMessageAt: "2026-11-16T09:00:00Z",
    }),
    false,
  );
});
