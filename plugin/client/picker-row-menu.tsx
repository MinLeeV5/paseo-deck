import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { placeVerticalMenu } from "../shared/menu-placement";
import { IconButton } from "./compact-ui";
import {
  focusControl,
  onPickerMenuKeys,
  onPickerRowContextMenu,
  scheduleFrame,
} from "./web";

type Theme = PluginScreenProps["theme"];
type RowTrigger = Omit<PressableProps, "children"> & {
  "aria-pressed"?: boolean;
};
type Anchor = { x: number; y: number; width: number; height: number };

export const pickerRowActionSize = (compact: boolean) => (compact ? 38 : 28);

export type PickerRowAction = {
  label: string;
  icon: string;
  run(): void;
  disabled?: boolean;
  separator?: boolean;
  destructive?: boolean;
};

type MenuRequest = {
  id: string;
  title: string;
  showMenuTitle: boolean;
  actions: readonly PickerRowAction[];
  triggerID: string;
  anchor: Anchor;
};
export const PickerMenus = createContext<{
  menuID?: string;
  show(request: MenuRequest): void;
} | null>(null);

export function usePickerRowMenus(
  root: RefObject<View | null>,
  theme: Theme,
  compact: boolean,
) {
  const [menu, setMenu] = useState<
    (MenuRequest & { position: ReturnType<typeof placeVerticalMenu> }) | null
  >(null);
  const active = useRef(menu);
  active.current = menu;
  const rowHeight = compact ? 40 : 32;
  const close = useCallback((restore = true) => {
    const trigger = active.current?.triggerID;
    if (!trigger) return;
    setMenu(null);
    if (restore) focusControl(trigger);
  }, []);
  const show = useCallback(
    (request: MenuRequest) => {
      if (active.current?.id === request.id && request.anchor.width) {
        close();
        return;
      }
      root.current?.measureInWindow((x, y, width, height) => {
        const preferredWidth = 220;
        const preferredHeight =
          10 +
          (request.showMenuTitle ? 20 : 0) +
          request.actions.length * rowHeight +
          request.actions.filter((action) => action.separator).length * 7;
        const { anchor } = request;
        setMenu({
          ...request,
          position: placeVerticalMenu({
            triggerRect: {
              ...anchor,
              x: anchor.width
                ? anchor.x + anchor.width - preferredWidth
                : anchor.x,
              width: preferredWidth,
            },
            displayArea: { x, y, width, height },
            preferredHeight,
            gap: 4,
          }),
        });
      });
    },
    [root, rowHeight, close],
  );
  const testID = menu ? `split-picker-row-menu-${menu.id}` : "";
  const first = menu?.actions.findIndex((entry) => !entry.disabled) ?? -1;
  useEffect(() => {
    if (!testID) return;
    const restore = onPickerMenuKeys(testID, close);
    const cancel =
      first >= 0
        ? scheduleFrame(() => focusControl(`${testID}-entry-${first}`))
        : undefined;
    return () => {
      restore();
      cancel?.();
    };
  }, [testID, first, close]);
  const c = theme.colors;
  return {
    context: { menuID: menu?.id, show },
    close,
    popup: menu && (
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", inset: 0, zIndex: 100 }}
      >
        <Pressable
          aria-hidden
          tabIndex={-1}
          onPress={() => close()}
          style={{ position: "absolute", inset: 0 }}
        />
        <View
          testID={testID}
          role="menu"
          accessibilityLabel={`更多操作 · ${menu.title}`}
          style={{
            position: "absolute",
            top: menu.position.top,
            left: menu.position.left,
            width: menu.position.width,
            height: menu.position.height,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 8,
            backgroundColor: c.surface1,
            boxShadow: [
              { offsetX: 0, offsetY: 3, blurRadius: 14, color: c.border },
            ],
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="always"
            contentContainerStyle={{ padding: 4 }}
          >
            {menu.showMenuTitle && (
              <Text
                aria-hidden
                numberOfLines={1}
                style={{
                  color: c.foregroundMuted,
                  fontSize: 11,
                  lineHeight: 20,
                  paddingHorizontal: 7,
                }}
              >
                {menu.title}
              </Text>
            )}
            {menu.actions.map((action, index) => (
              <Fragment key={action.label}>
                {action.separator && (
                  <View
                    style={{
                      height: 1,
                      backgroundColor: c.border,
                      marginVertical: 3,
                    }}
                  />
                )}
                <Pressable
                  testID={`${testID}-entry-${index}`}
                  accessibilityRole="menuitem"
                  accessibilityLabel={action.label}
                  accessibilityState={{ disabled: action.disabled }}
                  disabled={action.disabled}
                  onPress={() => {
                    close(false);
                    action.run();
                  }}
                  style={({
                    hovered,
                    pressed,
                    focused,
                  }: {
                    hovered?: boolean;
                    pressed?: boolean;
                    focused?: boolean;
                  }) => ({
                    height: rowHeight,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingHorizontal: 7,
                    borderRadius: 5,
                    backgroundColor:
                      hovered || pressed || focused
                        ? c.surface2
                        : "transparent",
                    opacity: action.disabled ? 0.45 : 1,
                  })}
                >
                  <Icon
                    name={action.icon}
                    size={14}
                    color={
                      action.destructive ? c.statusDanger : c.foregroundMuted
                    }
                  />
                  <Text
                    style={{
                      color: action.destructive ? c.statusDanger : c.foreground,
                      fontSize: 13,
                    }}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              </Fragment>
            ))}
          </ScrollView>
        </View>
      </View>
    ),
  };
}

export function PickerRowMenu({
  theme,
  id,
  title,
  showMenuTitle = true,
  actions,
  trigger,
  compact,
  style,
  shortcuts,
  children,
}: {
  theme: Theme;
  id: string;
  title: string;
  showMenuTitle?: boolean;
  actions: readonly PickerRowAction[];
  trigger: RowTrigger;
  compact: boolean;
  style: StyleProp<ViewStyle>;
  shortcuts?: ReactNode;
  children: ReactNode;
}) {
  const controls = useContext(PickerMenus);
  const show = controls?.show;
  const anchor = useRef<View>(null);
  const latest = useRef({ title, actions, showMenuTitle });
  latest.current = { title, actions, showMenuTitle };
  const testID = `split-picker-item-${id}`;
  const moreID = `split-picker-more-${id}`;
  useEffect(() => {
    if (trigger.disabled || !show || !trigger.testID) return;
    return onPickerRowContextMenu(testID, (point) =>
      show({
        id,
        ...latest.current,
        triggerID: trigger.testID!,
        anchor: point,
      }),
    );
  }, [id, testID, trigger.testID, trigger.disabled, show]);
  return (
    <View testID={testID} style={style}>
      <Pressable {...trigger}>{children}</Pressable>
      <View
        testID="split-picker-row-actions"
        style={{ flexDirection: "row", flexShrink: 0 }}
      >
        {shortcuts}
        <IconButton
          theme={theme}
          label={`更多操作 · ${title}`}
          tooltip={showMenuTitle || "更多操作"}
          icon="Ellipsis"
          size={pickerRowActionSize(compact)}
          testID={moreID}
          anchorRef={anchor}
          expanded={controls?.menuID === id}
          disabled={Boolean(trigger.disabled)}
          onPress={() =>
            anchor.current?.measureInWindow((x, y, width, height) =>
              show?.({
                id,
                ...latest.current,
                triggerID: moreID,
                anchor: { x, y, width, height },
              }),
            )
          }
        />
      </View>
    </View>
  );
}
