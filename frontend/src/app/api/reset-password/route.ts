import type { NextRequest } from "next/server";
import { resetPassword } from "@/lib/api/auth";

export async function POST(request: NextRequest) {
  return resetPassword(request);
}
