import { expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { getFunctionName, type FunctionReference } from "convex/server";
import { validateDaytonaKey } from "./sandbox";
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
const fakeKey = "dtn_orbit_test_only_not_a_real_key";
const personalFingerprint = `personal:${createHash("sha256").update(fakeKey).digest("hex")}`;

test("Daytona keys are validated and unauthenticated users cannot supply credentials", async () => {
  expect(validateDaytonaKey(` ${fakeKey} `)).toBe(fakeKey);
  for (const key of ["", "bad", "dtn_short", `${fakeKey}\nsecret`, `dtn_${"a".repeat(501)}`]) expect(() => validateDaytonaKey(key)).toThrow("valid Daytona");
  await expect(invoke(actions.create, { auth: { getUserIdentity: async () => null } }, { projectId: "project", consent: true, apiKey: fakeKey })).rejects.toThrow("Sign in");
});

test("creating with a personal key stores only a fingerprint and no plaintext credential", async () => {
  const writes: Record<string, unknown>[] = [];
  const cloudCreate = spyOn(Daytona.prototype, "create").mockResolvedValue({
    id: "provider-id", getWorkDir: async () => "/home/test", fs: { createFolder: async () => {} },
  } as never);
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "owner" }) },
    runMutation: async (ref: FunctionReference<"mutation">, args: Record<string, unknown>) => {
      writes.push(args); if (getFunctionName(ref) === "sandboxes:reserve") return "sandbox-row";
    },
  };
  try {
    await invoke(actions.create, ctx, { projectId: "project", consent: true, apiKey: fakeKey });
    expect(cloudCreate).toHaveBeenCalledTimes(1);
    expect(writes[0]).toEqual({ projectId: "project", credentialFingerprint: personalFingerprint });
    expect(JSON.stringify(writes)).not.toContain(fakeKey);
    expect(cloudCreate.mock.calls[0][0]).toMatchObject({ ttlMinutes: 5, ephemeral: true, networkBlockAll: true });
  } finally { cloudCreate.mockRestore(); }
});

test("sandbox ownership and original credential are checked before locks or provider calls", async () => {
  const cloudGet = spyOn(Daytona.prototype, "get");
  let writes = 0;
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: "owner" }) },
    runQuery: async () => ({ sandboxId: "provider-id", workDir: "/home/test", credentialFingerprint: personalFingerprint }),
    runMutation: async () => { writes++; },
  };
  try {
    await expect(invoke(actions.execute, ctx, { id: "row", command: "pwd", apiKey: "dtn_a_different_test_key" })).rejects.toThrow("same Daytona key");
    await expect(invoke(actions.remove, ctx, { id: "row", apiKey: "dtn_a_different_test_key" })).rejects.toThrow("same Daytona key");
    await expect(invoke(actions.execute, { ...ctx, runQuery: async () => { throw new Error("Sandbox not found."); } }, { id: "someone-elses-row", command: "pwd", apiKey: fakeKey })).rejects.toThrow("Sandbox not found");
    // Legacy project-created sandboxes cannot be accessed with a personal key either.
    await expect(invoke(actions.execute, { ...ctx, runQuery: async () => ({ sandboxId: "provider-id", workDir: "/home/test" }) }, { id: "row", command: "pwd", apiKey: fakeKey })).rejects.toThrow("same Daytona key");
    expect(writes).toBe(0); expect(cloudGet).not.toHaveBeenCalled();
  } finally { cloudGet.mockRestore(); }
});

test("provider errors do not return a supplied secret", async () => {
  const cloudCreate = spyOn(Daytona.prototype, "create").mockRejectedValue(new Error(`rejected ${fakeKey}`));
  try {
    const ctx = { auth: { getUserIdentity: async () => ({ subject: "owner" }) }, runMutation: async () => "row" };
    try { await invoke(actions.create, ctx, { projectId: "project", consent: true, apiKey: fakeKey }); throw new Error("Expected rejection"); }
    catch (e) { expect((e as Error).message).toContain("could not start"); expect((e as Error).message).not.toContain(fakeKey); }
  } finally { cloudCreate.mockRestore(); }
});

test("installed Daytona SDK exposes the actual sandbox lifecycle used by the app", () => {
  expect(typeof Daytona.prototype.create).toBe("function");
  expect(typeof Daytona.prototype.get).toBe("function");
  expect(typeof Daytona.prototype.delete).toBe("function");
});
