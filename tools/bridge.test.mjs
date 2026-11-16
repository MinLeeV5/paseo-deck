import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  nativeExports,
  readNativeExport,
  resolveNativeModules,
} from "../plugin/shared/bridge.ts";

function bundle(overlayExport) {
  const names = nativeExports
    .filter((name) => name !== "hasActiveWebOverlay")
    .map((name) => (name === "useTranslation" ? "getI18n" : name));
  names.push("queryClient", "pluginButtonStore");
  if (overlayExport) names.push(overlayExport);
  return names
    .map(
      (name, index) =>
        `\n__d(function(g,r,i,a,m,e,d){Object.defineProperty(e,"${name}",{enumerable:true,get:function(){return value}});},${index + 1},[]);`,
    )
    .join("");
}

for (const name of ["hasActiveWebOverlay", "hasActiveOverlay"]) {
  test(`Deck loads the ${name} contract and observes overlay state`, () => {
    const source = bundle(name);
    const ids = resolveNativeModules(source);
    const overlayId = ids.hasActiveWebOverlay;
    assert.ok(Number.isInteger(overlayId));
    let active = false;
    const module = { [name]: () => active };
    const blocked = readNativeExport(module, "hasActiveWebOverlay");
    assert.equal(blocked(), false);
    active = true;
    assert.equal(blocked(), true, "an open overlay blocks Deck shortcuts");
    active = false;
    assert.equal(blocked(), false, "closing it restores Deck shortcuts");
    assert.equal(
      ids.Composer,
      undefined,
      "optional capabilities may be absent",
    );
  });
}

test("an unknown overlay contract still prevents unsafe shortcut registration", () => {
  assert.throws(
    () => resolveNativeModules(bundle()),
    /hasActiveWebOverlay.*hasActiveOverlay/,
  );
  assert.equal(readNativeExport({}, "hasActiveWebOverlay"), undefined);
});

test("Deck resolves its full bridge against the installed Paseo bundle", async () => {
  const base =
    process.env.PASEO_DECK_APP_DIST ??
    "/Applications/Paseo.app/Contents/Resources/app-dist";
  const html = await readFile(`${base}/index.html`, "utf8");
  const path = html.match(
    /src="([^"]*\/_expo\/static\/js\/web\/index-[^"]+\.js)"/,
  )[1];
  const ids = resolveNativeModules(await readFile(`${base}${path}`, "utf8"));
  for (const name of [...nativeExports, "queryClient", "pluginButtonStore"])
    assert.ok(Number.isInteger(ids[name]), `${name} is available`);
});
