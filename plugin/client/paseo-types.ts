import type { PluginClientContext } from "@getpaseo/plugin/client";

// Git installs have no development dependencies. Derive SDK data types from the
// host-provided plugin API so even erased imports stay resolvable during builds.
type PaseoApi = PluginClientContext["paseo"];

export type PaseoWorkspace = Awaited<
  ReturnType<PaseoApi["workspaces"]["list"]>
>["entries"][number];
export type PaseoProject = Awaited<
  ReturnType<PaseoApi["projects"]["list"]>
>["projects"][number];
export type PaseoAgent = Awaited<
  ReturnType<PaseoApi["agents"]["list"]>
>["entries"][number]["agent"];
export type PaseoTerminal = Awaited<
  ReturnType<PaseoApi["terminals"]["list"]>
>["entries"][number];
