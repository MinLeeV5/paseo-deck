export function workspaceFilePath(input: string) {
  const path = input.trim().replace(/\\/g, "/");
  const components = path.split("/");
  if (
    /^[a-z]:/i.test(path) ||
    /[\x00-\x1f]/.test(path) ||
    components.some((entry) => !entry || entry === "." || entry === "..")
  )
    throw new Error("请输入相对于 workspace 的文件路径，例如 docs/notes.md。");
  const name = components.pop()!;
  return { path, parentPath: components.join("/") || ".", name };
}
