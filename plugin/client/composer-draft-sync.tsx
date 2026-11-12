import {
  createElement,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import {
  ComposerDraftSync,
  type ComposerTextSource,
  type ComposerTextReplacement,
} from "../shared/composer-draft-sync";

export interface NativeComposerProps {
  textSource?: ComposerTextSource;
  textReplacement?: ComposerTextReplacement;
  onChangeText?: (text: string) => void;
  [key: string]: unknown;
}

type SyncedComposerProps = NativeComposerProps & {
  textSource: ComposerTextSource;
  textReplacement: ComposerTextReplacement;
  onChangeText(text: string): void;
};

export function syncNativeComposer(
  Composer: ComponentType<NativeComposerProps>,
): { Component: ComponentType<NativeComposerProps>; dispose(): void } {
  let active = true;
  const subscriptions = new Set<() => void>();
  function SyncedComposer({ props }: { props: SyncedComposerProps }) {
    const { textSource, onChangeText, textReplacement } = props;
    const subscribe = useCallback(
      (listener: () => void) => {
        if (!active) return () => {};
        const unsubscribe = textSource.subscribe(listener);
        subscriptions.add(unsubscribe);
        return () => {
          if (subscriptions.delete(unsubscribe)) unsubscribe();
        };
      },
      [textSource],
    );
    const text = useSyncExternalStore(
      subscribe,
      textSource.getSnapshot,
      textSource.getSnapshot,
    );
    const sync = useMemo(
      () => new ComposerDraftSync(textSource.getSnapshot(), textReplacement),
      [textSource],
    );
    const edit = useCallback(
      (value: string) => {
        sync.edit(value);
        onChangeText(value);
      },
      [sync, onChangeText],
    );
    return createElement(Composer, {
      ...props,
      onChangeText: edit,
      textReplacement: sync.read(text, textReplacement),
    });
  }

  function DraftSyncedComposer(props: NativeComposerProps) {
    // Older Paseo builds use a controlled text prop instead of a text source.
    if (
      !active ||
      !props.textSource ||
      typeof props.textSource.subscribe !== "function" ||
      typeof props.textSource.getSnapshot !== "function" ||
      !props.textReplacement ||
      typeof props.textReplacement.key !== "string" ||
      typeof props.onChangeText !== "function"
    )
      return createElement(Composer, props);
    return createElement(SyncedComposer, {
      props: props as SyncedComposerProps,
    });
  }

  return {
    Component: DraftSyncedComposer,
    dispose() {
      active = false;
      for (const unsubscribe of subscriptions) unsubscribe();
      subscriptions.clear();
    },
  };
}
