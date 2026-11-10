import type { NextRequest } from "next/server";
import { revokeToken } from "@/lib/api/auth";

export async function POST(request: NextRequest) {
  return revokeToken(request);
}
