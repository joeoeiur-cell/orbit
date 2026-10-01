import { expect, test } from "bun:test";
import { Daytona } from "@daytonaio/sdk";
import * as actions from "../convex/daytona";

// Convex exposes the original handler on registered functions at runtime for testing.
const invoke = (registered: unknown, ctx: unknown, args: Record<string, unknown>) => (registered as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

test("Daytona action guards reject invalid input before any cloud operation", async () => {
  await expect(invoke(actions.create, {} as never, { projectId: "project", consent: false })).rejects.toThrow("Confirm sandbox usage");
  await expect(invoke(actions.execute, {} as never, { id: "sandbox" as never, command: " " })).rejects.toThrow("Enter a command");
  await expect(invoke(actions.syncFiles, {} as never, { id: "sandbox" as never, files: [{ name: "../../secret", content: "bad" }] })).rejects.toThrow("escape");
  await expect(invoke(actions.readFile, {} as never, { id: "sandbox" as never, name: "/etc/passwd" })).rejects.toThrow("relative");
  await expect(invoke(actions.preview, {} as never, { id: "sandbox" as never, port: 80 })).rejects.toThrow("port");
  await expect(invoke(actions.configuration, { auth: { getUserIdentity: async () => null } } as never, {})).rejects.toThrow("Sign in");
});
test("installed Daytona SDK exposes the actual sandbox lifecycle used by the app", () => {
  expect(typeof Daytona.prototype.create).toBe("function");
  expect(typeof Daytona.prototype.get).toBe("function");
  expect(typeof Daytona.prototype.delete).toBe("function");
});
