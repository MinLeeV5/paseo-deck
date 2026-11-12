import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveNativeModules } from "../shared/bridge";
export async function readBridgeInfo() {
  const appDist =
    process.env.PASEO_DECK_APP_DIST ??
    "/Applications/Paseo.app/Contents/Resources/app-dist";
  const index = await readFile(join(appDist, "index.html"), "utf8");
  const scripts = index.match(
    /src="([^"]*\/_expo\/static\/js\/web\/index-[^"]+\.js)"/,
  );
  const jsDir = join(appDist, "_expo/static/js/web");
  const bundleName =
    scripts?.[1].split("/").pop() ??
    (await readdir(jsDir)).find((name) => /^index-.*\.js$/.test(name));
  if (!bundleName)
    throw new Error(
      "找不到本机 Paseo 的 Web 构建；请设置 PASEO_DECK_APP_DIST。",
    );
  const source = await readFile(join(jsDir, bundleName), "utf8");
  return { bundleName, moduleIds: resolveNativeModules(source) };
}
