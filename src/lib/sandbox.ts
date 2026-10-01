export const SANDBOX_LIFETIME_MS = 5 * 60 * 1000;
export const MAX_TRANSFER_BYTES = 500000;
export function sandboxPath(name: string): string {
  if (!name || name.length > 200 || name.startsWith("/") || name.includes("\\") || /[\x00-\x1f]/.test(name)) throw new Error("Use a relative project file path.");
  const parts = name.replace(/^\.\//, "").split("/");
  if (parts.some(p => !p || p === "." || p === "..")) throw new Error("File paths cannot escape the project folder.");
  return parts.join("/");
}
export function validateTransfers(files: { name: string; content: string }[]) {
  if (!files.length || files.length > 40) throw new Error("Sync between 1 and 40 text files at a time.");
  let bytes = 0;
  const names = new Set<string>();
  for (const file of files) {
    const name = sandboxPath(file.name);
    if (names.has(name)) throw new Error("Duplicate file paths are not allowed.");
    names.add(name);
    bytes += new TextEncoder().encode(file.content).byteLength;
  }
  if (bytes > MAX_TRANSFER_BYTES) throw new Error("Files must total less than 500 KB per sync.");
  return files.map(f => ({ ...f, name: sandboxPath(f.name) }));
}
