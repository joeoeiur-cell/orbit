import { expect, test } from "bun:test";
import { extractPythonRequest, localRunnerDocument, validateLocalResult } from "./localRuntime";

test("local execution only accepts the explicit, single Python request format", () => {
  expect(extractPythonRequest("```python\nprint('example')\n```")).toBeUndefined();
  expect(extractPythonRequest("```orbit-python\nprint(2 + 2)\n```")).toBe("print(2 + 2)");
  expect(() => extractPythonRequest("```orbit-python\na\n```\n```orbit-python\nb\n```")).toThrow("multiple");
  expect(() => extractPythonRequest(`\`\`\`orbit-python\n${"a".repeat(20001)}\n\`\`\``)).toThrow("limits");
});
test("execution output and returned files are validated as untrusted data", () => {
  expect(validateLocalResult({ output: "ok", files: [{ name: "./hello.txt", content: "hello" }] }).files).toEqual([{ name: "hello.txt", content: "hello" }]);
  expect(validateLocalResult({ output: "", files: [] }).files).toEqual([]);
  for (const result of [null, { output: 3, files: [] }, { output: "x".repeat(20001), files: [] }, { output: "", error: "x".repeat(4001), files: [] }, { output: "", files: [null] }, { output: "", files: [{ name: "../cookie.txt", content: "x" }] }, { output: "", files: [{ name: "x", content: "a" }, { name: "./x", content: "b" }] }, { output: "", files: [{ name: "x", content: "x".repeat(500001) }] }]) expect(() => validateLocalResult(result)).toThrow();
});
test("runner policy denies network and checks the parent/channel before sending to its worker", () => {
  const document = localRunnerDocument("test-channel");
  expect(document).toContain("connect-src 'none'");
  expect(document).toContain("default-src 'none'");
  expect(document).toContain("worker-src blob:");
  expect(document).toContain("e.source===parent");
  expect(document).toContain("e.data?.channel===channel");
  expect(document).not.toContain("allow-same-origin");
  expect(document).not.toContain("https://cdn.");
});
