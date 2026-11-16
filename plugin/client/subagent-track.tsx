import {
  createContext,
  createElement,
  useContext,
  useMemo,
  type ComponentType,
} from "react";
import {
  scopeSubagentTrack,
  type SubagentNavigation,
  type SubagentTrackProps,
} from "./subagent-navigation";

export const SplitSubagentNavigation = createContext<SubagentNavigation | null>(
  null,
);

export function scopeNativeSubagentTrack(
  Track: ComponentType<SubagentTrackProps>,
): ComponentType<SubagentTrackProps> {
  return function ScopedSubagentTrack(props: SubagentTrackProps) {
    const navigation = useContext(SplitSubagentNavigation);
    const scoped = useMemo(
      () => scopeSubagentTrack(props, navigation),
      [props, navigation],
    );
    return createElement(Track, scoped);
  };
}
