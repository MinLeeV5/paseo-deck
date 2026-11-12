import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const resources =
  process.env.PASEO_DECK_APP_RESOURCES ??
  "/Applications/Paseo.app/Contents/Resources";
const executable =
  process.env.PASEO_DECK_NODE ??
  resolve(
    resources,
    "../Frameworks/Paseo Helper.app/Contents/MacOS/Paseo Helper",
  );
const compile = `
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const server = join(process.argv[1], "app.asar/node_modules/@getpaseo/server");
const { version } = JSON.parse(readFileSync(join(server, "package.json"), "utf8"));
const { compileDirectoryPlugin } = await import(pathToFileURL(
  join(server, "dist/server/server/plugins/compiler-build.js"),
).href);
const { clientBundle, serverBundle } = await compileDirectoryPlugin(process.argv[2], version);
console.log(JSON.stringify({
  clientBytes: Buffer.byteLength(clientBundle ?? ""),
  serverBytes: Buffer.byteLength(serverBundle ?? ""),
}));
`;

test("Paseo builds a clean plugin install without development dependencies", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "paseo-deck-install-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(fileURLToPath(new URL("../plugin", import.meta.url)), directory, {
    recursive: true,
    filter: (source) => basename(source) !== "node_modules",
  });
  await assert.rejects(access(join(directory, "node_modules")), {
    code: "ENOENT",
  });

  const { stdout } = await run(
    executable,
    ["--input-type=module", "-e", compile, resources, directory],
    {
      cwd: directory,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      timeout: 30_000,
    },
  );
  const result = JSON.parse(stdout);
  assert.ok(result.clientBytes > 0, "client entry compiles");
  assert.ok(result.serverBytes > 0, "server entry compiles");
});
