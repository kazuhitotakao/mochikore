import type { NextRequest } from "next/server";
import { forwardToLaravel } from "@/lib/api/forward";

type Context = RouteContext<"/api/[...path]">;

export async function GET(request: NextRequest, ctx: Context) {
  return forwardToLaravel(request, (await ctx.params).path);
}

export async function POST(request: NextRequest, ctx: Context) {
  return forwardToLaravel(request, (await ctx.params).path);
}

export async function PUT(request: NextRequest, ctx: Context) {
  return forwardToLaravel(request, (await ctx.params).path);
}

export async function PATCH(request: NextRequest, ctx: Context) {
  return forwardToLaravel(request, (await ctx.params).path);
}

export async function DELETE(request: NextRequest, ctx: Context) {
  return forwardToLaravel(request, (await ctx.params).path);
}
