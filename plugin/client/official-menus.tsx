import { useState } from "react";
import { Linking, Text, View } from "react-native";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { PaseoWorkspace } from "@getpaseo/client";
import type { NativeBridge } from "./native-types";
import { IconButton } from "./compact-ui";

export type ScriptMenuProps = {
  serverId: string;
  workspaceId: string;
  scripts: PaseoWorkspace["scripts"];
  liveTerminalIds: string[];
  onScriptTerminalStarted(id: string): void;
  onViewTerminal(id: string): void;
  onOpenUrlInBrowserTab?(url: string): void;
};
export type EditorMenuProps = {
  serverId: string;
  cwd: string;
  projectId: string | null;
  activeFile: { path: string; lineStart?: number; lineEnd?: number } | null;
};
type MenuProps = { bridge: NativeBridge; theme: PluginScreenProps["theme"] };

// The actions and target planning come from the same hooks as the official
// header controls. Only the menu rows differ, to share one flyout hierarchy.
export function ScriptMenu({
  bridge,
  theme,
  ...props
}: ScriptMenuProps & MenuProps) {
  const actions = bridge.useWorkspaceScriptActions(props);
  const openUrl = (url: string) => {
    if (props.onOpenUrlInBrowserTab) props.onOpenUrlInBrowserTab(url);
    else if (/^https?:\/\//i.test(url)) void Linking.openURL(url);
  };
  return (
    <>
      {props.scripts.map((script) => {
        const running = script.lifecycle === "running";
        const terminal =
          script.terminalId && props.liveTerminalIds.includes(script.terminalId)
            ? script.terminalId
            : null;
        const links = actions.resolveLinks(script);
        return (
          <View key={script.scriptName}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingRight: 6,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <bridge.MenuItem
                  testID={`split-script-${props.workspaceId}-${script.scriptName}`}
                  disabled={running ? !terminal : actions.isStartPending}
                  closeOnSelect={!running}
                  leading={
                    <Icon
                      name={running ? "LoaderCircle" : "SquareTerminal"}
                      size={14}
                      color={theme.colors.foregroundMuted}
                    />
                  }
                  description={
                    !running && script.exitCode !== null
                      ? `exit ${script.exitCode}`
                      : undefined
                  }
                  onSelect={() =>
                    running && terminal
                      ? props.onViewTerminal(terminal)
                      : actions.start(script.scriptName)
                  }
                >
                  {script.scriptName}
                </bridge.MenuItem>
              </View>
              {running && terminal && (
                <IconButton
                  label={`查看 ${script.scriptName} 终端`}
                  icon="SquareTerminal"
                  size={24}
                  theme={theme}
                  onPress={() => props.onViewTerminal(terminal)}
                />
              )}
              {running && (
                <IconButton
                  label={`重启 ${script.scriptName}`}
                  icon="RotateCw"
                  size={24}
                  theme={theme}
                  disabled={actions.isStopPending}
                  onPress={() => actions.restart(script.scriptName)}
                />
              )}
              <IconButton
                label={`${running ? "停止" : "运行"} ${script.scriptName}`}
                icon={running ? "Square" : "Play"}
                size={24}
                theme={theme}
                disabled={
                  running ? actions.isStopPending : actions.isStartPending
                }
                onPress={() =>
                  running
                    ? actions.stop(script.scriptName)
                    : actions.start(script.scriptName)
                }
              />
            </View>
            {links.targets.map((link) => (
              <bridge.MenuItem
                key={link.kind}
                leading={
                  <Icon
                    name="ExternalLink"
                    size={14}
                    color={theme.colors.foregroundMuted}
                  />
                }
                onSelect={() => {
                  actions.selectRoute(link.kind);
                  openUrl(link.url);
                }}
              >
                {`打开 ${script.scriptName} · ${link.label}`}
              </bridge.MenuItem>
            ))}
            {links.selected && (
              <bridge.MenuItem
                leading={
                  <Icon
                    name="Copy"
                    size={14}
                    color={theme.colors.foregroundMuted}
                  />
                }
                onSelect={() => actions.copyUrl(links.selected!)}
              >
                {`复制 ${script.scriptName} 地址`}
              </bridge.MenuItem>
            )}
          </View>
        );
      })}
    </>
  );
}

export function ExternalOpenMenu({
  bridge,
  theme,
  ...props
}: EditorMenuProps & MenuProps) {
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const connected = bridge.useHostRuntimeIsConnected(props.serverId);
  const local = bridge.useIsLocalDaemon(props.serverId);
  const preferred = bridge.usePreferredEditor({
    serverId: props.serverId,
    projectId: props.projectId,
  });
  const desktop = bridge.useDesktopOpenTargets({
    isLocalExecution: local,
    workspacePath: props.cwd,
  });
  const cwd = connected ? props.cwd : "";
  const checkout = bridge.useCheckoutStatusQuery({
    serverId: props.serverId,
    cwd,
  });
  const forge = bridge.useCheckoutPrStatusQuery({
    serverId: props.serverId,
    cwd,
  });
  const targets = bridge.planWorkspaceOpenTargets({
    workspaceDirectory: props.cwd,
    activeFile: props.activeFile,
    desktopTargets: desktop.targets,
    canUseDesktopBridge: desktop.isAvailable,
    isLocalExecution: local,
    checkoutStatus: checkout.status,
    forge: forge.resolvedForge,
  });
  const preferredId = bridge.resolvePreferredEditorId(
    targets.map((target) => target.id),
    preferred.preferredEditorId,
  );
  const open = async (target: (typeof targets)[number]) => {
    setPending(target.id);
    try {
      if (target.source === "desktop")
        await bridge.openDesktopTarget(target.openInput);
      else await bridge.openExternalUrl(target.url);
      await preferred.updatePreferredEditor(target.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(null);
    }
  };
  return (
    <>
      {targets.map((target) => (
        <bridge.MenuItem
          key={target.id}
          testID={`split-external-${target.id}`}
          disabled={pending !== null}
          selected={target.id === preferredId}
          leading={
            target.source === "desktop" ? (
              <bridge.EditorTargetIcon
                icon={target.icon}
                size={16}
                color={theme.colors.foregroundMuted}
              />
            ) : (
              <Icon
                name="ExternalLink"
                size={14}
                color={theme.colors.foregroundMuted}
              />
            )
          }
          onSelect={() => void open(target)}
        >
          {`在 ${target.label} 中打开${props.activeFile ? ` ${props.activeFile.path.split("/").pop()}` : " workspace"}`}
        </bridge.MenuItem>
      ))}
      {targets.length === 0 && (
        <Text
          style={{
            padding: 12,
            fontSize: 13,
            color: theme.colors.foregroundMuted,
          }}
        >
          当前环境没有可用的外部打开方式。
        </Text>
      )}
    </>
  );
}
