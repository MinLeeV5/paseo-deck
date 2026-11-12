import test from "node:test";
import assert from "node:assert/strict";
import { installForkTabNavigation } from "../plugin/client/fork-navigation.ts";

const source = { serverId: "host", agentId: "source-agent" };
const fork = {
  serverId: "host",
  workspaceId: "workspace",
  target: {
    kind: "draft",
    draftId: "fork-draft",
    setup: { provider: "codex", model: "test-model", modeId: "plan" },
  },
};
const readSource = (draftId) => (draftId === "fork-draft" ? source : undefined);

function navigation() {
  const native = [];
  const original = (request) => {
    native.push(request);
    return "native-result";
  };
  return { module: { navigateToWorkspace: original }, native, original };
}

test("forks open in Deck with the original draft identity and settings", (t) => {
  const { module, native } = navigation();
  const opened = [];
  t.after(
    installForkTabNavigation(module, readSource, (request) => {
      opened.push(request);
      return true;
    }),
  );

  module.navigateToWorkspace(fork);
  assert.equal(native.length, 0, "fork does not leave Deck");
  assert.equal(opened.length, 1);
  assert.equal(opened[0].sourceAgentId, source.agentId);
  assert.equal(opened[0].workspaceId, fork.workspaceId);
  assert.equal(
    opened[0].target,
    fork.target,
    "history attachments stay on the same draft",
  );
});

test("ordinary drafts, agent tabs, and workspace navigation retain native behavior", (t) => {
  const { module, native } = navigation();
  let routes = 0;
  t.after(
    installForkTabNavigation(module, readSource, () => {
      routes++;
      return true;
    }),
  );
  const requests = [
    { ...fork, target: { kind: "draft", draftId: "ordinary-draft" } },
    { ...fork, target: { kind: "agent", agentId: "agent" } },
    { serverId: "host", workspaceId: "workspace" },
    { ...fork, serverId: "another-host" },
  ];
  for (const request of requests)
    assert.equal(module.navigateToWorkspace(request), "native-result");
  assert.deepEqual(native, requests);
  assert.equal(routes, 0);
});

test("forks fall back when Deck is inactive or does not own the source", (t) => {
  const { module, native } = navigation();
  t.after(installForkTabNavigation(module, readSource, () => false));
  assert.equal(module.navigateToWorkspace(fork), "native-result");
  assert.deepEqual(native, [fork]);
});

test("retained Deck instances share one patch and release their routes independently", () => {
  const { module, original, native } = navigation();
  const opened = [];
  const removeFirst = installForkTabNavigation(module, readSource, () => {
    opened.push("first");
    return true;
  });
  const wrapped = module.navigateToWorkspace;
  const removeSecond = installForkTabNavigation(
    module,
    readSource,
    () => false,
  );
  assert.equal(module.navigateToWorkspace, wrapped);
  module.navigateToWorkspace(fork);
  assert.deepEqual(opened, ["first"]);
  removeFirst();
  module.navigateToWorkspace(fork);
  assert.deepEqual(native, [fork]);
  assert.equal(module.navigateToWorkspace, wrapped);
  removeSecond();
  removeSecond();
  assert.equal(module.navigateToWorkspace, original);
});

test("hot reload restores navigation without overwriting another plugin's change", () => {
  const { module, original } = navigation();
  const remove = installForkTabNavigation(module, readSource, () => true);
  remove();
  assert.equal(module.navigateToWorkspace, original);
  const removeReloaded = installForkTabNavigation(
    module,
    readSource,
    () => true,
  );
  const other = () => "another-plugin";
  module.navigateToWorkspace = other;
  removeReloaded();
  assert.equal(module.navigateToWorkspace, other);
});
