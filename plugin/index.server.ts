import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readBridgeInfo } from "./server/bridge";
import { bridgeInfoRpc } from "./shared/bridge";

export default function contribute(server: PluginServerContext) {
  server.handle(bridgeInfoRpc, readBridgeInfo);
  return () => {};
}
