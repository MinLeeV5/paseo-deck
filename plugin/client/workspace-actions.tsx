import {
  Component,
  createElement,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Pressable, Text, View } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { Pane, Target } from "../shared/model";
import type { NativeBridge } from "./native-types";
import type {
  ButtonBehavior,
  ButtonItem,
  PluginButton,
  PluginIcon,
} from "./workspace-types";
import type { Directory } from "./directory";
import { IconButton } from "./compact-ui";
import { describeControl } from "./web";
import type { PaneMenuAction } from "./resource-picker";

export const WorkspaceActions = memo(function WorkspaceActions(props: {
  bridge: NativeBridge;
  pane?: Pane;
  directory?: Directory;
  theme: PluginScreenProps["theme"];
  host: PluginScreenProps["host"];
  compact: boolean;
  wide: boolean;
  maximized: boolean;
  groupId: string;
  menuActions: PaneMenuAction[];
  onFocus(tabId: string): void;
  beforeAction(tabId: string): Promise<void>;
  onOpen(tabId: string, target: Target): void;
  onMenu(groupId: string, anchor: View | null): void;
  onMaximize(groupId: string): void;
}) {
  return (
    <QueryClientProvider client={props.bridge.queryClient}>
      <Actions
        {...props}
        key={`${props.groupId}:${props.pane?.id ?? "empty"}`}
      />
    </QueryClientProvider>
  );
});
function Actions({
  bridge,
  pane,
  directory,
  theme,
  host,
  compact,
  wide,
  maximized,
  groupId,
  menuActions,
  onFocus,
  beforeAction,
  onOpen,
  onMaximize,
}: Parameters<typeof WorkspaceActions>[0]) {
  const entries = useSyncExternalStore(
    bridge.pluginButtonStore.subscribe,
    bridge.pluginButtonStore.getSnapshot,
    bridge.pluginButtonStore.getSnapshot,
  );
  const workspace = directory?.workspaces.find(
    (value) => value.id === pane?.workspaceId,
  );
  const buttons = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.placement === "header" &&
          entry.installation.serverId === host.id &&
          entry.context.workspaceId === pane?.workspaceId &&
          entry.button.visible,
      ),
    [entries, host.id, pane?.workspaceId],
  );
  const pinned = wide ? buttons.slice(0, 3) : [];
  const overflow = wide ? buttons.slice(3) : buttons;
  const terminalIds = useMemo(
    () =>
      (directory?.terminals ?? [])
        .filter((terminal) => terminal.workspaceId === pane?.workspaceId)
        .map((terminal) => terminal.id),
    [directory?.terminals, pane?.workspaceId],
  );
  const scriptProps = useMemo(
    () =>
      workspace && pane
        ? {
            serverId: pane.serverId,
            workspaceId: pane.workspaceId,
            scripts: workspace.scripts,
            liveTerminalIds: terminalIds,
            hideLabels: true,
            onScriptTerminalStarted: (terminalId: string) =>
              onOpen(pane.id, { kind: "terminal", terminalId }),
            onViewTerminal: (terminalId: string) =>
              onOpen(pane.id, { kind: "terminal", terminalId }),
            ...(bridge.getIsElectron?.() && bridge.createWorkspaceBrowser
              ? {
                  onOpenUrlInBrowserTab: (url: string) => {
                    const { browserId } = bridge.createWorkspaceBrowser!({
                      initialUrl: url,
                    });
                    onOpen(pane.id, { kind: "browser", browserId });
                  },
                }
              : {}),
          }
        : null,
    [workspace, pane, terminalIds, bridge, onOpen],
  );
  const activeFile = useMemo(
    () =>
      pane?.target.kind === "file"
        ? {
            path: pane.target.path,
            lineStart: pane.target.lineStart,
            lineEnd: pane.target.lineEnd,
          }
        : null,
    [pane?.target],
  );
  return (
    <View
      onPointerDown={() => pane && onFocus(pane.id)}
      style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
    >
      {scriptProps && (
        <ActionBoundary theme={theme}>
          <bridge.WorkspaceScriptsButton {...scriptProps} />
        </ActionBoundary>
      )}
      {workspace && pane && (
        <ActionBoundary theme={theme}>
          <bridge.WorkspaceOpenInEditorButton
            serverId={pane.serverId}
            cwd={workspace.workspaceDirectory ?? workspace.projectRootPath}
            projectId={workspace.projectId}
            activeFile={activeFile}
            hideLabels
          />
        </ActionBoundary>
      )}
      {pane &&
        pinned.map((entry) => (
          <ExtensionButton
            key={entry.key}
            entry={entry}
            bridge={bridge}
            theme={theme}
            host={host}
            compact={compact}
            groupId={groupId}
            before={() => beforeAction(pane.id)}
          />
        ))}
      <IconButton
        label={maximized ? "还原分屏" : "放大分屏"}
        icon={maximized ? "Minimize2" : "Maximize2"}
        theme={theme}
        size={compact ? 30 : 24}
        onPress={() => onMaximize(groupId)}
      />
      <MoreActions
        entries={buttons}
        bridge={bridge}
        theme={theme}
        host={host}
        compact={compact}
        groupId={groupId}
        before={() => (pane ? beforeAction(pane.id) : Promise.resolve())}
        actions={menuActions}
      />
    </View>
  );
}
class ActionBoundary extends Component<
  { theme: PluginScreenProps["theme"]; children?: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidCatch(error: Error) {
    console.error("[Split workspace action]", error);
  }
  render() {
    return this.state.error ? (
      <Text
        accessibilityLabel={this.state.error}
        style={{ color: this.props.theme.colors.statusDanger, padding: 4 }}
      >
        !
      </Text>
    ) : (
      this.props.children
    );
  }
}
function ExtensionEnvironment({
  entry,
  bridge,
  children,
}: {
  entry: PluginButton;
  bridge: NativeBridge;
  children?: ReactNode;
}) {
  const toast = useToast();
  const state = useMemo(
    () => bridge.createPluginClientStateSource(entry.installation.serverId),
    [bridge, entry.installation.serverId],
  );
  const environment = useMemo(
    () => ({ installation: entry.installation, toast, state }),
    [entry.installation, toast, state],
  );
  return (
    <bridge.PluginEnvironmentProvider environment={environment}>
      {children}
    </bridge.PluginEnvironmentProvider>
  );
}
function Glyph({
  bridge,
  icon,
  color,
  props,
}: {
  bridge: NativeBridge;
  icon?: PluginIcon;
  color: string;
  props?: Record<string, unknown>;
}) {
  return icon ? (
    <View pointerEvents="none" accessible={false}>
      {createElement(bridge.pluginIconComponent(icon), {
        ...props,
        size: 14,
        color,
      })}
    </View>
  ) : (
    <Icon name="Puzzle" size={14} color={color} />
  );
}
function extensionProps(
  entry: PluginButton,
  theme: PluginScreenProps["theme"],
  host: PluginScreenProps["host"],
  compact: boolean,
) {
  return {
    ...entry.context,
    theme,
    host,
    layout: { compact, platform: "web" },
  };
}
function Trigger({
  bridge,
  title,
  icon,
  theme,
  compact,
  testID,
}: {
  bridge: NativeBridge;
  title: string;
  icon: ReactNode;
  theme: PluginScreenProps["theme"];
  compact: boolean;
  testID: string;
}) {
  useEffect(() => describeControl(testID, title), [testID, title]);
  return (
    <bridge.MenuTrigger
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({
        hovered,
        pressed,
        open,
      }: {
        hovered?: boolean;
        pressed?: boolean;
        open?: boolean;
      }) => ({
        width: compact ? 30 : 24,
        height: compact ? 30 : 24,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 3,
        backgroundColor:
          hovered || pressed || open ? theme.colors.surface2 : "transparent",
      })}
    >
      {icon}
    </bridge.MenuTrigger>
  );
}
function ExtensionButton({
  entry,
  bridge,
  theme,
  host,
  compact,
  groupId,
  before,
}: {
  entry: PluginButton;
  bridge: NativeBridge;
  theme: PluginScreenProps["theme"];
  host: PluginScreenProps["host"];
  compact: boolean;
  groupId: string;
  before(): Promise<void>;
}) {
  return (
    <ActionBoundary key={`${entry.key}:${entry.button.title}`} theme={theme}>
      <ExtensionEnvironment entry={entry} bridge={bridge}>
        <ExtensionControl
          entry={entry}
          bridge={bridge}
          theme={theme}
          host={host}
          compact={compact}
          groupId={groupId}
          before={before}
        />
      </ExtensionEnvironment>
    </ActionBoundary>
  );
}
function ExtensionControl({
  entry,
  bridge,
  theme,
  host,
  compact,
  groupId,
  before,
}: Parameters<typeof ExtensionButton>[0]) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const behavior = entry.button.behavior;
  const testID = `split-extension-${groupId}-${entry.key}`;
  useEffect(() => {
    setOpen(false);
  }, [behavior]);
  useEffect(
    () => describeControl(testID, entry.button.title),
    [testID, entry.button.title],
  );
  const run = async (path: string[] = []) => {
    try {
      await before();
      await bridge.pluginButtonStore.run(entry.key, path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };
  const glyph = (
    <Glyph
      bridge={bridge}
      props={extensionProps(entry, theme, host, compact)}
      icon={entry.button.icon}
      color={theme.colors.foregroundMuted}
    />
  );
  if (behavior.kind === "action")
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={entry.button.title}
        disabled={entry.pending || entry.button.disabled}
        onPress={() => void run()}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }) => ({
          width: compact ? 30 : 24,
          height: compact ? 30 : 24,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 3,
          opacity: entry.pending || entry.button.disabled ? 0.4 : 1,
          backgroundColor:
            hovered || pressed ? theme.colors.surface2 : "transparent",
        })}
      >
        {glyph}
      </Pressable>
    );
  const rootId = `extension/${groupId}/${entry.key}`;
  return (
    <bridge.MenuRoot open={open} onOpenChange={setOpen} compactMode="sheet">
      <Trigger
        bridge={bridge}
        title={entry.button.title}
        icon={glyph}
        theme={theme}
        compact={compact}
        testID={testID}
      />
      <bridge.MenuSurface
        sheetTitle={entry.button.title}
        align="end"
        minWidth={240}
        maxWidth={380}
        maxHeight={440}
        scrollable
        pages={pagesFor(
          behavior,
          rootId,
          entry,
          bridge,
          theme,
          host,
          compact,
          run,
          () => setOpen(false),
        )}
      >
        <ExtensionBody
          entry={entry}
          behavior={behavior}
          path={[]}
          pageId={rootId}
          bridge={bridge}
          theme={theme}
          host={host}
          compact={compact}
          run={run}
          close={() => setOpen(false)}
        />
      </bridge.MenuSurface>
    </bridge.MenuRoot>
  );
}
function ExtensionBody({
  entry,
  behavior,
  path,
  pageId,
  bridge,
  theme,
  host,
  compact,
  run,
  close,
}: {
  entry: PluginButton;
  behavior: ButtonBehavior;
  path: string[];
  pageId: string;
  bridge: NativeBridge;
  theme: PluginScreenProps["theme"];
  host: PluginScreenProps["host"];
  compact: boolean;
  run(path: string[]): Promise<void>;
  close(): void;
}) {
  return (
    <ActionBoundary theme={theme}>
      <ExtensionEnvironment entry={entry} bridge={bridge}>
        {behavior.kind === "popover" ? (
          <View style={{ padding: 12 }}>
            <behavior.Content
              {...extensionProps(entry, theme, host, compact)}
              close={close}
            />
          </View>
        ) : behavior.kind === "menu" ? (
          <>
            {behavior.items
              .filter(
                (item) => item.kind === "separator" || item.visible !== false,
              )
              .map((item) =>
                item.kind === "separator" ? (
                  <bridge.MenuSeparator key={item.id} />
                ) : item.behavior.kind === "action" ? (
                  <bridge.MenuItem
                    key={item.id}
                    leading={
                      <Glyph
                        props={extensionProps(entry, theme, host, compact)}
                        bridge={bridge}
                        icon={item.icon}
                        color={theme.colors.foregroundMuted}
                      />
                    }
                    disabled={
                      entry.pending || entry.button.disabled || item.disabled
                    }
                    onSelect={() => void run([...path, item.id])}
                  >
                    {item.title}
                  </bridge.MenuItem>
                ) : (
                  <bridge.MenuSubTrigger
                    key={item.id}
                    id={`${pageId}/${item.id}`}
                    leading={
                      <Glyph
                        props={extensionProps(entry, theme, host, compact)}
                        bridge={bridge}
                        icon={item.icon}
                        color={theme.colors.foregroundMuted}
                      />
                    }
                    disabled={
                      entry.pending || entry.button.disabled || item.disabled
                    }
                  >
                    {item.title}
                  </bridge.MenuSubTrigger>
                ),
              )}
          </>
        ) : null}
      </ExtensionEnvironment>
    </ActionBoundary>
  );
}
function pagesFor(
  behavior: ButtonBehavior,
  id: string,
  entry: PluginButton,
  bridge: NativeBridge,
  theme: PluginScreenProps["theme"],
  host: PluginScreenProps["host"],
  compact: boolean,
  run: (path: string[]) => Promise<void>,
  close: () => void,
  path: string[] = [],
): { id: string; title: string; content: ReactNode }[] {
  if (behavior.kind !== "menu") return [];
  return behavior.items.flatMap((item: ButtonItem) => {
    if (
      item.kind === "separator" ||
      item.visible === false ||
      item.behavior.kind === "action"
    )
      return [];
    const nextId = `${id}/${item.id}`,
      nextPath = [...path, item.id];
    return [
      {
        id: nextId,
        title: item.title,
        content: (
          <ExtensionBody
            entry={entry}
            behavior={item.behavior}
            path={nextPath}
            pageId={nextId}
            bridge={bridge}
            theme={theme}
            host={host}
            compact={compact}
            run={run}
            close={close}
          />
        ),
      },
      ...pagesFor(
        item.behavior,
        nextId,
        entry,
        bridge,
        theme,
        host,
        compact,
        run,
        close,
        nextPath,
      ),
    ];
  });
}
function MoreActions({
  entries,
  bridge,
  theme,
  host,
  compact,
  groupId,
  before,
  actions,
}: {
  entries: PluginButton[];
  bridge: NativeBridge;
  theme: PluginScreenProps["theme"];
  host: PluginScreenProps["host"];
  compact: boolean;
  groupId: string;
  before(): Promise<void>;
  actions: PaneMenuAction[];
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const run = (entry: PluginButton) => async (path: string[]) => {
    try {
      await before();
      await bridge.pluginButtonStore.run(entry.key, path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };
  const actionRows = (items: PaneMenuAction[]) =>
    items.map((action) => (
      <bridge.MenuItem
        key={action.label}
        accessibilityLabel={action.label}
        aria-checked={action.selected}
        disabled={action.disabled}
        leading={
          <Icon
            name={action.icon}
            size={14}
            color={
              action.destructive
                ? theme.colors.statusDanger
                : theme.colors.foregroundMuted
            }
          />
        }
        trailing={
          action.selected ? (
            <Icon name="Check" size={14} color={theme.colors.foregroundMuted} />
          ) : undefined
        }
        onSelect={() => {
          setOpen(false);
          action.run();
        }}
      >
        {action.label}
      </bridge.MenuItem>
    ));
  const pluginRows = entries.map((entry) => (
    <ExtensionEnvironment key={entry.key} entry={entry} bridge={bridge}>
      {entry.button.behavior.kind === "action" ? (
        <bridge.MenuItem
          disabled={entry.pending || entry.button.disabled}
          leading={
            <Glyph
              bridge={bridge}
              props={extensionProps(entry, theme, host, compact)}
              icon={entry.button.icon}
              color={theme.colors.foregroundMuted}
            />
          }
          onSelect={() => void run(entry)([])}
        >
          {entry.button.title}
        </bridge.MenuItem>
      ) : (
        <bridge.MenuSubTrigger
          id={`overflow/${groupId}/${entry.key}`}
          disabled={entry.pending || entry.button.disabled}
          leading={
            <Glyph
              bridge={bridge}
              props={extensionProps(entry, theme, host, compact)}
              icon={entry.button.icon}
              color={theme.colors.foregroundMuted}
            />
          }
        >
          {entry.button.title}
        </bridge.MenuSubTrigger>
      )}
    </ExtensionEnvironment>
  ));
  const categories = [
    {
      label: "移动",
      icon: "MoveHorizontal",
      id: `category/${groupId}/move`,
      content: actionRows(
        actions.filter((action) => action.category === "移动"),
      ),
      enabled: actions.some((action) => action.category === "移动"),
    },
    {
      label: "排版",
      icon: "LayoutGrid",
      id: `category/${groupId}/layout`,
      content: actionRows(
        actions.filter((action) => action.category === "排版"),
      ),
      enabled: true,
    },
    {
      label: "插件",
      icon: "Puzzle",
      id: `category/${groupId}/plugins`,
      content: pluginRows,
      enabled: entries.length > 0,
    },
    {
      label: "其它",
      icon: "MoreHorizontal",
      id: `category/${groupId}/other`,
      content: actionRows(
        actions.filter(
          (action) => action.category === "其它" || !action.category,
        ),
      ),
      enabled: actions.some(
        (action) => action.category === "其它" || !action.category,
      ),
    },
  ];
  const pages = [
    ...categories.map(({ id, label: title, content }) => ({
      id,
      title,
      content,
    })),
    ...entries.flatMap((entry) => {
      if (entry.button.behavior.kind === "action") return [];
      const pageId = `overflow/${groupId}/${entry.key}`;
      return [
        {
          id: pageId,
          title: entry.button.title,
          content: (
            <ExtensionBody
              entry={entry}
              behavior={entry.button.behavior}
              path={[]}
              pageId={pageId}
              bridge={bridge}
              theme={theme}
              host={host}
              compact={compact}
              run={run(entry)}
              close={() => setOpen(false)}
            />
          ),
        },
        ...pagesFor(
          entry.button.behavior,
          pageId,
          entry,
          bridge,
          theme,
          host,
          compact,
          run(entry),
          () => setOpen(false),
        ),
      ];
    }),
  ];
  return (
    <bridge.MenuRoot open={open} onOpenChange={setOpen} compactMode="sheet">
      <Trigger
        bridge={bridge}
        title="分屏操作"
        icon={
          <Icon
            name="Ellipsis"
            size={14}
            color={theme.colors.foregroundMuted}
          />
        }
        theme={theme}
        compact={compact}
        testID={`split-menu-${groupId}`}
      />
      <bridge.MenuSurface
        sheetTitle="更多操作"
        align="end"
        minWidth={200}
        maxWidth={380}
        maxHeight={440}
        scrollable
        pages={pages}
      >
        {categories.map((category) => (
          <bridge.MenuSubTrigger
            key={category.id}
            id={category.id}
            disabled={!category.enabled}
            leading={
              <Icon
                name={category.icon}
                size={14}
                color={theme.colors.foregroundMuted}
              />
            }
          >
            {category.label}
          </bridge.MenuSubTrigger>
        ))}
        <bridge.MenuSeparator />
        {actionRows(actions.filter((action) => action.category === "关闭"))}
      </bridge.MenuSurface>
    </bridge.MenuRoot>
  );
}
