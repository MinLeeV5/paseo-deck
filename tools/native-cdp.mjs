// Isolated Electron acceptance: the regular browser harness cannot attach to
// Electron's browser target. Use its exposed page CDP endpoint for this test.
import { WebSocket } from "ws";
import { writeFile } from "node:fs/promises";

export async function nativePage(port = 9230) {
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  const target = targets.find(
    (t) => t.type === "page" && t.url.startsWith("paseo://app"),
  );
  if (!target) throw new Error("Isolated Paseo renderer not found");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  let sequence = 0;
  const dialogs = [];
  const pending = new Map();
  socket.on("message", (data) => {
    const event = JSON.parse(data.toString());
    if (event.method === "Page.javascriptDialogOpening")
      dialogs.push(event.params);
    if (!event.id) return;
    const call = pending.get(event.id);
    if (!call) return;
    pending.delete(event.id);
    clearTimeout(call.timer);
    if (event.error) call.reject(new Error(JSON.stringify(event.error)));
    else call.resolve(event.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send("Page.enable");
  // Match a foreground window even when the OS occludes this isolated test app.
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails)
      throw new Error(response.exceptionDetails.text);
    return response.result.value;
  };
  const nodes = async (name, role = "button") =>
    (await send("Accessibility.getFullAXTree")).nodes.filter(
      (n) =>
        !n.ignored &&
        n.role?.value === role &&
        (name === undefined || n.name?.value === name),
    );
  const box = async (node) => {
    await send("DOM.scrollIntoViewIfNeeded", {
      backendNodeId: node.backendDOMNodeId,
    });
    const q = (
      await send("DOM.getBoxModel", { backendNodeId: node.backendDOMNodeId })
    ).model.content;
    return {
      x: (q[0] + q[2] + q[4] + q[6]) / 4,
      y: (q[1] + q[3] + q[5] + q[7]) / 4,
    };
  };
  const clickNode = async (node) => {
    const point = await box(node);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...point,
      button: "left",
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...point,
      button: "left",
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 180));
  };
  const click = async (name, role = "button", index = 0) => {
    const list = await nodes(name, role);
    if (!list[index]) throw new Error(`Control not found: ${name}`);
    await clickNode(list[index]);
  };
  const wait = async (predicate) => {
    for (let i = 0; i < 40; i++) {
      if (await predicate()) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error("UI did not reach expected state");
  };
  const key = async (key, code, modifiers = 0) => {
    const special = {
      Enter: 13,
      Escape: 27,
      Tab: 9,
      Backspace: 8,
      ArrowLeft: 37,
      ArrowUp: 38,
      ArrowRight: 39,
      ArrowDown: 40,
    };
    const windowsVirtualKeyCode =
      special[key] ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code,
      modifiers,
      windowsVirtualKeyCode,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      modifiers: 0,
      windowsVirtualKeyCode,
    });
  };
  const type = async (name, text, index = 0, clear = false) => {
    const list = await nodes(name, "textbox");
    if (!list[index]) throw new Error(`Textbox not found: ${name}`);
    await clickNode(list[index]);
    await send("DOM.focus", { backendNodeId: list[index].backendDOMNodeId });
    await new Promise((r) => setTimeout(r, 30));
    if (clear) {
      await send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "a",
        code: "KeyA",
        modifiers: 4,
        commands: ["selectAll"],
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "a",
        code: "KeyA",
      });
    }
    await send("Input.insertText", { text });
  };
  const screenshot = async (path) => {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(path, Buffer.from(shot.data, "base64"));
  };
  return {
    send,
    evaluate,
    nodes,
    box,
    clickNode,
    click,
    wait,
    key,
    type,
    screenshot,
    dialogs,
    close: () => socket.close(),
  };
}
