import type { NextRequest } from "next/server";
import { fetchMe } from "@/lib/api/auth";

export async function GET(request: NextRequest) {
  return fetchMe(request);
}
