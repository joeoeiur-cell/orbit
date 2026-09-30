import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return ctx.db.query("greetings").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").collect();
  },
});

export const create = mutation({
  args: { recipient: v.string(), message: v.string(), theme: v.union(v.literal("sunshine"), v.literal("coral"), v.literal("mint")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Please sign in first.");
    const recipient = args.recipient.trim();
    const message = args.message.trim();
    if (!recipient || recipient.length > 60 || !message || message.length > 500) throw new Error("Add a name and a message (up to 500 characters).");
    return ctx.db.insert("greetings", { userId, recipient, message, theme: args.theme });
  },
});

export const remove = mutation({
  args: { id: v.id("greetings") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    const greeting = await ctx.db.get(id);
    if (!userId || !greeting || greeting.userId !== userId) throw new Error("Greeting not found.");
    await ctx.db.delete(id);
  },
});
