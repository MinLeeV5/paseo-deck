export interface ComposerTextSource {
  getSnapshot(): string;
  subscribe(listener: () => void): () => void;
}

export interface ComposerTextReplacement {
  kind: "initial" | "hydrated" | "replace";
  key: string;
  text: string;
}

// Native composers publish typing after paint, and only update their editor
// when a replacement key changes. Another view of the same draft needs a new
// replacement; an echo of this editor's typing must leave its selection alone.
export class ComposerDraftSync {
  private observedText: string;
  private editorText: string;
  private nativeKey: string;
  private replacement: ComposerTextReplacement;
  private revision = 0;
  private editRevision = 0;
  private pendingEdits = new Map<string, number>();

  constructor(text: string, replacement: ComposerTextReplacement) {
    this.observedText = this.editorText = text;
    this.nativeKey = replacement.key;
    this.replacement = replacement;
  }

  edit(text: string): void {
    this.editorText = text;
    this.pendingEdits.set(text, ++this.editRevision);
  }

  read(text: string, native: ComposerTextReplacement): ComposerTextReplacement {
    if (native.key !== this.nativeKey) {
      this.nativeKey = native.key;
      this.editorText = native.text;
      this.replacement = native;
      this.pendingEdits.clear();
    }
    if (text !== this.observedText) {
      this.observedText = text;
      const echoedRevision = this.pendingEdits.get(text);
      if (echoedRevision !== undefined) {
        for (const [value, revision] of this.pendingEdits)
          if (revision <= echoedRevision) this.pendingEdits.delete(value);
        return this.replacement;
      }
      this.pendingEdits.clear();
      if (text !== this.editorText) {
        this.editorText = text;
        this.replacement = {
          kind: "replace",
          key: `${native.key}:deck-sync:${++this.revision}`,
          text,
        };
      }
    }
    return this.replacement;
  }
}
