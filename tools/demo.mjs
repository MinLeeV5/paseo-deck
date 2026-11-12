import http from "node:http";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, extname, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { WebSocket, WebSocketServer } from "ws";
import { fileURLToPath } from "node:url";

// A temporary, authenticated loopback harness for the unmodified packaged Web UI.
// The existing local credential stays in this process and is never sent to the browser.
const root = fileURLToPath(new URL("..", import.meta.url));
const cli = process.env.PASEO_SPLIT_CLI ?? "paseo";
const cliArgs = ["daemon", "status", "--json"];
if (process.env.PASEO_SPLIT_HOME)
  cliArgs.push("--home", process.env.PASEO_SPLIT_HOME);
const status = JSON.parse(execFileSync(cli, cliArgs, { encoding: "utf8" }));
const credential = (
  await readFile(join(status.home, "local-credential"), "utf8")
).trim();
const port = Number(process.env.PASEO_SPLIT_DEMO_PORT ?? 4178);
const origin = `http://localhost:${port}`;
const appDist =
  process.env.PASEO_SPLIT_APP_DIST ??
  "/Applications/Paseo.app/Contents/Resources/app-dist";
const secret = randomBytes(24).toString("base64url");
const cookie = `paseo_split_demo_${port}=${secret}`;
const destination = `/h/${encodeURIComponent(status.serverId)}/plugin/workspace-split-demo/surface/main`;
const index = await readFile(join(appDist, "index.html"), "utf8");
const bootstrap = `<script>globalThis.__PASEO_INITIAL_DAEMON_CONNECTION__=${JSON.stringify({ listen: `localhost:${port}`, useTls: false })};</script>`;
const mime = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};
const authorized = (request) =>
  request.headers.cookie?.split("; ").includes(cookie);
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, origin);
    if (url.pathname === `/demo/${secret}`) {
      response.writeHead(302, {
        "Set-Cookie": `${cookie}; HttpOnly; SameSite=Strict; Path=/`,
        Location: destination,
        "Cache-Control": "no-store",
      });
      response.end();
      return;
    }
    if (!authorized(request)) {
      response.writeHead(403);
      response.end(
        "Open the current demo session URL printed in the terminal.",
      );
      return;
    }
    if (request.headers.origin && request.headers.origin !== origin) {
      response.writeHead(403);
      response.end();
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const path = resolve(appDist, `.${pathname}`);
    if (!path.startsWith(resolve(appDist) + sep) && path !== resolve(appDist)) {
      response.writeHead(403);
      response.end();
      return;
    }
    const isFile = await stat(path)
      .then((info) => info.isFile())
      .catch(() => false);
    if (isFile) {
      response.writeHead(200, {
        "Content-Type": mime[extname(path)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      response.end(await readFile(path));
    } else if (!extname(path)) {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(index.replace("<head>", `<head>${bootstrap}`));
    } else {
      response.writeHead(404);
      response.end();
    }
  } catch {
    response.writeHead(500);
    response.end("Demo asset error");
  }
});
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  if (
    !authorized(request) ||
    request.headers.origin !== origin ||
    new URL(request.url, origin).pathname !== "/ws"
  ) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (client) => {
    const headers = {};
    const endpoint =
      process.env.PASEO_SPLIT_UPSTREAM ??
      `ws://${status.listen ?? "127.0.0.1:6767"}/ws`;
    const upstream = new WebSocket(endpoint, { headers });
    const queued = [];
    client.on("message", (data, binary) => {
      // Apply the existing daemon credential only to its hello handshake.
      if (!binary && credential) {
        try {
          const message = JSON.parse(data.toString());
          const hello =
            message.type === "hello"
              ? message
              : message.payload?.type === "hello"
                ? message.payload
                : null;
          if (hello) {
            hello.auth = { kind: "localCredential", token: credential };
            data = JSON.stringify(message);
          }
        } catch {
          /* Binary and non-JSON terminal frames pass through unchanged. */
        }
      }
      if (upstream.readyState === WebSocket.OPEN)
        upstream.send(data, { binary });
      else queued.push([data, binary]);
    });
    upstream.on("open", () => {
      for (const [data, binary] of queued.splice(0))
        upstream.send(data, { binary });
    });
    upstream.on("message", (data, binary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary });
    });
    upstream.on("error", (error) => {
      console.error("Demo upstream:", error.message);
      client.close(1011, "Daemon connection failed");
    });
    client.on("error", () => upstream.close());
    upstream.on("close", (code, reason) => {
      if (code >= 4000)
        console.error("Demo daemon rejected:", code, reason.toString());
      client.close();
    });
    client.on("close", () => upstream.close());
  });
});
server.listen(port, "127.0.0.1", async () => {
  const url = `${origin}/demo/${secret}`;
  await mkdir(join(root, ".demo"), { recursive: true });
  await writeFile(
    join(
      root,
      port === 4178 ? ".demo/session.json" : `.demo/session-${port}.json`,
    ),
    JSON.stringify({ url, port, pid: process.pid, serverId: status.serverId }),
    { mode: 0o600 },
  );
  console.log(`Paseo split demo: ${url}`);
  console.log(
    "Serving the installed Paseo Web UI read-only. Ctrl+C stops this harness.",
  );
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const client of wss.clients) client.terminate();
    server.close(() => process.exit(0));
  });
