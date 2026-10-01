import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { SANDBOX_LIFETIME_MS } from "../lib/sandbox";

export const current = query({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const rows = await ctx.db.query("cloudSandboxes").withIndex("by_user", q => q.eq("userId", userId)).order("desc").collect();
    const row = rows.find(r => r.projectId === projectId);
    if (!row) return null;
    return { id: row._id, status: row.status, expiresAt: row.expiresAt, workDir: row.workDir || "", expired: row.expiresAt <= Date.now() };
  },
});
export const reserve = internalMutation({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to Orbit to use the cloud sandbox.");
    if (!projectId || projectId.length > 150) throw new Error("Invalid project.");
    const rows = await ctx.db.query("cloudSandboxes").withIndex("by_user", q => q.eq("userId", userId)).collect();
    if (rows.some(r => ["creating", "running", "deleting"].includes(r.status) && r.expiresAt > Date.now())) throw new Error("You already have an active sandbox. Delete it or wait for its five-minute expiry.");
    const now = Date.now();
    return ctx.db.insert("cloudSandboxes", { userId, projectId, status: "creating", createdAt: now, expiresAt: now + SANDBOX_LIFETIME_MS });
  },
});
export const owned = internalQuery({
  args: { id: v.id("cloudSandboxes") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    const row = await ctx.db.get(id);
    if (!userId || !row || row.userId !== userId) throw new Error("Sandbox not found.");
    return row;
  },
});
export const finishCreate = internalMutation({
  args: { id: v.id("cloudSandboxes"), sandboxId: v.string(), workDir: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.status !== "creating") throw new Error("Sandbox creation was cancelled.");
    await ctx.db.patch(args.id, { sandboxId: args.sandboxId, workDir: args.workDir, status: "running" });
  },
});
export const setStatus = internalMutation({
  args: { id: v.id("cloudSandboxes"), status: v.union(v.literal("deleting"), v.literal("deleted"), v.literal("error")) },
  handler: async (ctx, { id, status }) => { await ctx.db.patch(id, { status, operationUntil: undefined }); },
});
export const beginDelete = internalMutation({
  args: { id: v.id("cloudSandboxes") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    const row = await ctx.db.get(id);
    if (!userId || !row || row.userId !== userId || !row.sandboxId) throw new Error("Sandbox not found.");
    if (row.status === "creating" || row.status === "deleted") throw new Error("Sandbox is not available for deletion.");
    if ((row.operationUntil || 0) > Date.now()) throw new Error("Wait for the current sandbox operation to finish.");
    await ctx.db.patch(id, { status: "deleting", operationUntil: Date.now() + 60000 });
    return row.sandboxId;
  },
});
export const lock = internalMutation({
  args: { id: v.id("cloudSandboxes") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== "running" || row.expiresAt <= Date.now()) throw new Error("Sandbox expired. Start a new one.");
    if ((row.operationUntil || 0) > Date.now()) throw new Error("Another sandbox operation is running.");
    await ctx.db.patch(id, { operationUntil: Date.now() + 60000 });
  },
});
export const unlock = internalMutation({
  args: { id: v.id("cloudSandboxes") },
  handler: async (ctx, { id }) => { await ctx.db.patch(id, { operationUntil: undefined }); },
});
