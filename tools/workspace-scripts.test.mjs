import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "../plugin/node_modules/typescript/lib/typescript.js";

const source = await readFile(
  new URL("../plugin/client/official-menus.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const jsx = (type, props) => ({ type, props });
const module = { exports: {} };
vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`)(
  (id) => {
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (id === "react") return {};
    if (id === "react-native") return { View: "view", Text: "text" };
    if (id === "@getpaseo/plugin/client/ui") return { Icon: "icon" };
    if (id === "./compact-ui") return { IconButton: "icon-button" };
    throw new Error(`Unexpected import: ${id}`);
  },
  module,
  module.exports,
);
const { ScriptButton, ScriptMenu } = module.exports;

function harness(lifecycle = "idle") {
  const calls = [];
  const client = { host: "script-host" };
  const script = {
    scriptName: "dev",
    lifecycle,
    terminalId: lifecycle === "running" ? "terminal" : null,
    exitCode: null,
  };
  const props = {
    serverId: "script-host",
    workspaceId: "workspace",
    scripts: [script],
    liveTerminalIds: ["terminal"],
    hideLabels: true,
    onScriptTerminalStarted: (id) => calls.push(["started", id]),
    onViewTerminal: (id) => calls.push(["view", id]),
  };
  let actions;
  const bridge = {
    useHostRuntimeClient(id) {
      assert.equal(id, props.serverId);
      return client;
    },
    useWorkspaceScriptActions(input) {
      assert.equal(
        input.client,
        client,
        "actions need the selected host client",
      );
      assert.equal(input.workspaceId, props.workspaceId);
      assert.equal(input.scripts, props.scripts);
      actions = {
        start: (name) => {
          calls.push(["start", name]);
          input.onScriptTerminalStarted("terminal");
        },
        stop: (name) => calls.push(["stop", name]),
        restart: (name) => calls.push(["restart", name]),
        resolveLinks: () => ({ selected: null, targets: [] }),
        isStartPending: false,
        isStopPending: false,
      };
      return actions;
    },
    WorkspaceScriptsButton(input) {
      // The native menu first consumes actions when it opens its script rows.
      assert.equal(input.actions, actions);
      for (const script of input.scripts) input.actions.resolveLinks(script);
      input.actions.start("dev");
    },
    MenuItem: "menu-item",
  };
  const theme = { colors: { foregroundMuted: "gray" } };
  return { props, bridge, theme, calls };
}

function descendants(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(descendants);
  return [node, ...descendants(node.props?.children)];
}

test("the native script button opens with actions bound to its host and opens the started terminal", () => {
  const { props, bridge, calls } = harness();
  const button = ScriptButton({ ...props, bridge });
  assert.equal(button.type, bridge.WorkspaceScriptsButton);
  assert.equal(button.props.hideLabels, true);
  button.type(button.props);
  assert.deepEqual(calls, [
    ["start", "dev"],
    ["started", "terminal"],
  ]);
});

test("the More menu starts scripts using the selected host client", () => {
  const { props, bridge, theme, calls } = harness();
  const menu = ScriptMenu({ ...props, bridge, theme });
  const row = descendants(menu).find((node) => node.type === "menu-item");
  row.props.onSelect();
  assert.deepEqual(calls, [
    ["start", "dev"],
    ["started", "terminal"],
  ]);
});

test("running scripts in More can be viewed, stopped, and restarted", () => {
  const { props, bridge, theme, calls } = harness("running");
  const nodes = descendants(ScriptMenu({ ...props, bridge, theme }));
  nodes.find((node) => node.type === "menu-item").props.onSelect();
  nodes.find((node) => node.props?.label === "停止 dev").props.onPress();
  nodes.find((node) => node.props?.label === "重启 dev").props.onPress();
  assert.deepEqual(calls, [
    ["view", "terminal"],
    ["stop", "dev"],
    ["restart", "dev"],
  ]);
});
