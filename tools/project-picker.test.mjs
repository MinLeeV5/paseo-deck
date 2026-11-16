import test from "node:test";
import assert from "node:assert/strict";
import { sortPickerProjects } from "../plugin/client/project-picker.ts";

const projects = ["first", "second", "third", "empty"].map((projectId) => ({
  projectId,
}));
const workspace = (projectId, activityAt, extra = {}) => ({
  projectId,
  activityAt,
  ...extra,
});
const ids = (workspaces) =>
  sortPickerProjects(projects, workspaces).map((p) => p.projectId);

test("projects use their most recent workspace activity across all workspaces", () => {
  const entries = [
    workspace("first", "2026-11-14T08:00:00Z"),
    workspace("second", "2026-11-16T08:00:00Z"),
    workspace("third", "2026-11-15T08:00:00Z"),
    workspace("first", "2026-11-16T09:00:00Z"),
  ];
  assert.deepEqual(ids(entries), ["first", "second", "third", "empty"]);
  entries[1] = { ...entries[1], activityAt: "2026-11-16T10:00:00Z" };
  assert.deepEqual(ids(entries), ["second", "first", "third", "empty"]);
});

test("new and older workspaces retain a useful order with missing activity", () => {
  assert.deepEqual(
    ids([
      workspace("first", null, { createdAt: "2026-11-15T08:00:00Z" }),
      workspace("second", null, {
        lastUserMessageAt: "2026-11-16T08:00:00Z",
      }),
      workspace("third", "invalid", { createdAt: "2026-11-16T09:00:00Z" }),
    ]),
    ["third", "second", "first", "empty"],
  );
});

test("hidden and archiving workspaces do not promote a project", () => {
  assert.deepEqual(
    ids([
      workspace("first", "2026-11-17T08:00:00Z", { internal: true }),
      workspace("first", "2026-11-17T08:00:00Z", { background: true }),
      workspace("first", "2026-11-17T08:00:00Z", {
        archivingAt: "2026-11-17T09:00:00Z",
      }),
      workspace("second", "2026-11-16T08:00:00Z"),
    ]),
    ["second", "first", "third", "empty"],
  );
});

test("equal instants and absent activity preserve order without mutating projects", () => {
  assert.deepEqual(
    ids([
      workspace("first", "2026-11-16T16:00:00+08:00"),
      workspace("second", "2026-11-16T08:00:00Z"),
    ]),
    ["first", "second", "third", "empty"],
  );
  assert.deepEqual(ids([]), ["first", "second", "third", "empty"]);
  assert.deepEqual(
    projects.map((p) => p.projectId),
    ["first", "second", "third", "empty"],
  );
});
