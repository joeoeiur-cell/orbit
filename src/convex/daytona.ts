"use node";
import { Daytona } from "@daytonaio/sdk";
import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_TRANSFER_BYTES, sandboxPath, validateTransfers } from "../lib/sandbox";

function client() {
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) throw new Error("Add DAYTONA_API_KEY in the project’s Keys tab to enable cloud sandboxes.");
  return new Daytona({ apiKey, apiUrl: process.env.DAYTONA_SERVER_URL || undefined, requestTimeoutMs: 20000, useDeprecatedPolling: true });
}
export const configuration = action({
  args: {},
  handler: async (ctx) => {
    if (!await ctx.auth.getUserIdentity()) throw new Error("Sign in to Orbit first.");
    return { configured: Boolean(process.env.DAYTONA_API_KEY) };
  },
});
export const create = action({
  args: { projectId: v.string(), consent: v.boolean() },
  handler: async (ctx, { projectId, consent }): Promise<void> => {
    if (!consent) throw new Error("Confirm sandbox usage before starting.");
    const daytona = client();
    const id = await ctx.runMutation(internal.sandboxes.reserve, { projectId });
    let sandbox: Awaited<ReturnType<Daytona["create"]>> | undefined;
    try {
      sandbox = await daytona.create({ language: "typescript", ephemeral: true, autoStopInterval: 5, autoDeleteInterval: 0, ttlMinutes: 5, public: false, networkBlockAll: true, labels: { app: "orbit" } }, { timeout: 45 });
      const base = await sandbox.getWorkDir();
      if (!base || !base.startsWith("/")) throw new Error("No sandbox working directory.");
      const workDir = `${base.replace(/\/$/, "")}/orbit`;
      await sandbox.fs.createFolder(workDir, "755");
      await ctx.runMutation(internal.sandboxes.finishCreate, { id, sandboxId: sandbox.id, workDir });
    } catch {
      if (sandbox) { try { await daytona.delete(sandbox, 20); } catch { /* Provider-enforced TTL remains the cleanup backstop. */ } }
      await ctx.runMutation(internal.sandboxes.setStatus, { id, status: "error" });
      throw new Error("Daytona could not start the sandbox. Check your key, trial balance, region limits, and Daytona dashboard. No automatic retry was made.");
    }
  },
});
async function withSandbox<T>(ctx: ActionCtx, id: Id<"cloudSandboxes">, fn: (sandbox: Awaited<ReturnType<Daytona["get"]>>, workDir: string) => Promise<T>): Promise<T> {
  const row = await ctx.runQuery(internal.sandboxes.owned, { id });
  if (!row.sandboxId || !row.workDir) throw new Error("Sandbox is not ready.");
  await ctx.runMutation(internal.sandboxes.lock, { id });
  try { return await fn(await client().get(row.sandboxId), row.workDir); }
  catch { throw new Error("Sandbox operation failed. It may have expired or Daytona may be unavailable. Check your command and refresh the status."); }
  finally { await ctx.runMutation(internal.sandboxes.unlock, { id }); }
}
export const execute = action({
  args: { id: v.id("cloudSandboxes"), command: v.string() },
  handler: async (ctx, { id, command }): Promise<{ output: string; exitCode: number }> => {
    if (!command.trim() || command.length > 4000) throw new Error("Enter a command under 4,000 characters.");
    return withSandbox(ctx, id, async (sandbox, workDir) => {
      const result = await sandbox.process.executeCommand(command, workDir, undefined, 25);
      return { output: (result.result || result.artifacts?.stdout || "").slice(0, 60000), exitCode: result.exitCode ?? -1 };
    });
  },
});
export const syncFiles = action({
  args: { id: v.id("cloudSandboxes"), files: v.array(v.object({ name: v.string(), content: v.string() })) },
  handler: async (ctx, { id, files }): Promise<{ count: number }> => {
    const valid = validateTransfers(files);
    return withSandbox(ctx, id, async (sandbox, workDir) => {
      const folders = [...new Set(valid.filter(f => f.name.includes("/")).map(f => `${workDir}/${f.name.slice(0, f.name.lastIndexOf("/"))}`))];
      for (const folder of folders) await sandbox.fs.createFolder(folder, "755");
      await sandbox.fs.uploadFiles(valid.map(f => ({ source: Buffer.from(f.content), destination: `${workDir}/${f.name}` })), 25);
      return { count: valid.length };
    });
  },
});
export const readFile = action({
  args: { id: v.id("cloudSandboxes"), name: v.string() },
  handler: async (ctx, { id, name }): Promise<{ name: string; content: string }> => {
    const path = sandboxPath(name);
    return withSandbox(ctx, id, async (sandbox, workDir) => {
      const remote = `${workDir}/${path}`;
      const details = await sandbox.fs.getFileDetails(remote);
      if (details.size > MAX_TRANSFER_BYTES) throw new Error("File is larger than 500 KB.");
      const data = await sandbox.fs.downloadFile(remote, 20);
      if (data.byteLength > MAX_TRANSFER_BYTES || data.includes(0)) throw new Error("Only text files under 500 KB can be imported.");
      return { name: path, content: data.toString("utf8") };
    });
  },
});
export const preview = action({
  args: { id: v.id("cloudSandboxes"), port: v.number() },
  handler: async (ctx, { id, port }): Promise<{ url: string }> => {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Use a port between 1024 and 65535.");
    return withSandbox(ctx, id, async (sandbox) => {
      const result = await sandbox.getSignedPreviewUrl(port, 60);
      return { url: result.url };
    });
  },
});
export const remove = action({
  args: { id: v.id("cloudSandboxes") },
  handler: async (ctx, { id }): Promise<void> => {
    const daytona = client();
    const sandboxId = await ctx.runMutation(internal.sandboxes.beginDelete, { id });
    try { await daytona.delete(await daytona.get(sandboxId), 25, true); }
    catch {
      // Do not label a failed deletion as complete; retain it for another manual attempt.
      await ctx.runMutation(internal.sandboxes.unlock, { id });
      throw new Error("Could not confirm deletion. Retry or delete it in Daytona’s dashboard. Its five-minute TTL still applies.");
    }
    await ctx.runMutation(internal.sandboxes.setStatus, { id, status: "deleted" });
  },
});
