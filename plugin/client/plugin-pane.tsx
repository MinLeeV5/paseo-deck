import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useState,
} from "react";
import { Linking, Text, View } from "react-native";
import { usePaseo } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import type { NativeBridge } from "./native-types";
import type { SplitPluginContextValue } from "./workspace-types";

export const SplitPluginContext = createContext<
  (SplitPluginContextValue & { bridge: NativeBridge }) | null
>(null);
// Render inside WorkspacePaneContent so native dirty-file tracking, focus and
// retained activity still apply; only panel navigation is scoped to our group.
export function SplitPluginPanel() {
  const context = useContext(SplitPluginContext);
  if (!context) throw new Error("Plugin pane context is unavailable");
  const { bridge, pane, theme, compact, open } = context;
  const target = pane.target;
  if (target.kind !== "plugin") throw new Error("Expected a plugin panel");
  const plugin = bridge.useInstalledPlugin(pane.serverId, target.pluginId);
  const panel = plugin?.workspacePanels.find(
    (value) => value.id === target.panelId && value.context === target.context,
  );
  const native = bridge.usePaneContext();
  const [modified, setModified] = useState(false);
  bridge.usePublishPanelInstanceAttributes({ modified });
  const state = useMemo(
    () => bridge.createPluginClientStateSource(pane.serverId),
    [bridge, pane.serverId],
  );
  const paseo = usePaseo(),
    toast = useToast();
  const navigation = useMemo(
    () => ({
      openAgent: ({
        agentId,
        serverId,
      }: {
        agentId: string;
        serverId?: string;
      }) => {
        void (async () => {
          if (serverId && serverId !== pane.serverId)
            throw new Error("请先切换到目标主机。");
          const agent = paseo.agents.ref(agentId);
          await agent.refresh();
          const workspaceId = agent.current()?.workspaceId;
          if (!workspaceId) throw new Error("会话的 workspace 不可用。");
          open({ kind: "agent", agentId }, workspaceId);
        })().catch((error) =>
          toast.error(error instanceof Error ? error.message : String(error)),
        );
      },
      openWorkspace: ({
        workspaceId,
        serverId,
      }: {
        workspaceId: string;
        serverId?: string;
      }) => {
        if (serverId && serverId !== pane.serverId) {
          toast.error("请先切换到目标主机。");
          return;
        }
        open({ kind: "files" }, workspaceId);
      },
      openBrowser:
        bridge.getIsElectron?.() && bridge.createWorkspaceBrowser
          ? ({
              url,
              workspaceId,
              serverId,
            }: {
              url: string;
              workspaceId: string;
              serverId?: string;
            }) => {
              if (serverId && serverId !== pane.serverId) {
                toast.error("请先切换到目标主机。");
                return;
              }
              if (!/^https?:\/\//i.test(url)) {
                toast.error("仅支持 HTTP(S) 地址。");
                return;
              }
              const { browserId } = bridge.createWorkspaceBrowser!({
                initialUrl: url,
              });
              open({ kind: "browser", browserId }, workspaceId);
            }
          : ({ url }: { url: string }) => {
              if (/^https?:\/\//i.test(url)) void Linking.openURL(url);
            },
    }),
    [bridge, pane.serverId, paseo, toast, open],
  );
  const tab = useMemo(
    () => ({
      state: native.state,
      setState: native.setCurrentTabState,
      setModified,
    }),
    [native.state, native.setCurrentTabState],
  );
  if (!plugin || !panel)
    return (
      <View style={{ padding: 18 }}>
        <Text style={{ color: theme.colors.foregroundMuted }}>
          该插件已停用或面板不可用。
        </Text>
      </View>
    );
  const props = {
    context: target.context,
    workspaceId: pane.workspaceId,
    ...(target.context === "agent" ? { agentId: target.agentId } : {}),
    params: target.context === "agent" ? { agentId: target.agentId } : {},
    revision: 0,
    tab,
    theme,
    host: { id: pane.serverId, label: pane.serverId },
    layout: { compact, platform: "web" },
    navigation,
  };
  return (
    <bridge.PluginInstallationProvider plugin={plugin}>
      <bridge.PluginClientStateProvider source={state}>
        {createElement(panel.Component, props)}
      </bridge.PluginClientStateProvider>
    </bridge.PluginInstallationProvider>
  );
}
