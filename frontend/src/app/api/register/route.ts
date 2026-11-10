import type { NextRequest } from "next/server";
import { issueToken } from "@/lib/api/auth";

export async function POST(request: NextRequest) {
  return issueToken(request, "/register");
}
