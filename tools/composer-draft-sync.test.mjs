import test from "node:test";
import assert from "node:assert/strict";
import { ComposerDraftSync } from "../plugin/shared/composer-draft-sync.ts";

const initial = (text = "", key = "agent:host:one:0") => ({
  kind: "initial",
  key,
  text,
});

test("Deck and workspace editors receive each other's draft changes", () => {
  const native = initial();
  const deck = new ComposerDraftSync("", native);
  const workspace = new ComposerDraftSync("", native);
  deck.edit("Deck 中的草稿\n第二行");
  assert.equal(deck.read("Deck 中的草稿\n第二行", native), native);
  const fromDeck = workspace.read("Deck 中的草稿\n第二行", native);
  assert.equal(fromDeck.text, "Deck 中的草稿\n第二行");
  assert.notEqual(fromDeck.key, native.key);
  workspace.edit("Workspace 中继续编辑");
  assert.equal(workspace.read("Workspace 中继续编辑", native), fromDeck);
  assert.equal(
    deck.read("Workspace 中继续编辑", native).text,
    "Workspace 中继续编辑",
  );
});

test("delayed typing publication and unrelated renders preserve local selection", () => {
  const native = initial("start");
  const sync = new ComposerDraftSync("start", native);
  sync.edit("start 中文输入");
  assert.equal(sync.read("start", native), native);
  sync.edit("start 中文输入继续");
  assert.equal(sync.read("start", native), native);
  assert.equal(sync.read("start 中文输入继续", native), native);
});

test("clearing a draft also clears a previously populated retained editor", () => {
  const native = initial("unsent");
  const sync = new ComposerDraftSync("unsent", native);
  const cleared = sync.read("", native);
  assert.equal(cleared.text, "");
  assert.equal(cleared.kind, "replace");
  assert.notEqual(cleared.key, native.key);
  assert.equal(sync.read("", native), cleared);
});

test("an earlier publication cannot overwrite text entered before it renders", () => {
  const native = initial("start");
  const sync = new ComposerDraftSync("start", native);
  sync.edit("start a");
  sync.edit("start ab");
  assert.equal(sync.read("start a", native), native);
  assert.equal(sync.read("start ab", native), native);
  assert.equal(sync.read("external change", native).text, "external change");
});

test("a later external edit can return to text previously typed locally", () => {
  const native = initial();
  const sync = new ComposerDraftSync("", native);
  sync.edit("A");
  sync.edit("B");
  assert.equal(sync.read("B", native), native);
  assert.equal(sync.read("A", native).text, "A");
});

test("native hydration and explicit replacements retain their original meaning", () => {
  const native = initial();
  const sync = new ComposerDraftSync("", native);
  const hydrated = {
    kind: "hydrated",
    key: "agent:host:one:1",
    text: "restored",
  };
  assert.equal(sync.read("restored", hydrated), hydrated);
  const rewind = { kind: "replace", key: "agent:host:one:2", text: "rewound" };
  assert.equal(sync.read("rewound", rewind), rewind);
});

test("repeated external edits get fresh keys even when they return to old text", () => {
  const native = initial("A");
  const sync = new ComposerDraftSync("A", native);
  const b = sync.read("B", native);
  const a = sync.read("A", native);
  assert.equal(a.text, "A");
  assert.notEqual(a.key, b.key);
  assert.notEqual(a.key, native.key);
  assert.equal(sync.read("A", native), a);
});

test("separate draft sources keep Agent and host identities independent", () => {
  const first = initial("one", "agent:host-a:one:0");
  const second = initial("two", "agent:host-b:one:0");
  const a = new ComposerDraftSync("one", first);
  const b = new ComposerDraftSync("two", second);
  a.edit("only host a");
  a.read("only host a", first);
  assert.equal(b.read("two", second), second);
});
