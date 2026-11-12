import type { NextRequest } from "next/server";
import { deleteAccount, fetchMe } from "@/lib/api/auth";

export async function GET(request: NextRequest) {
  return fetchMe(request);
}

export async function DELETE(request: NextRequest) {
  return deleteAccount(request);
}
