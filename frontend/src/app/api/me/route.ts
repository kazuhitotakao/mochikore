import type { NextRequest } from "next/server";
import { deleteAccount, fetchMe } from "@/lib/api/auth";
import { forwardToLaravel } from "@/lib/api/forward";

export async function GET(request: NextRequest) {
  return fetchMe(request);
}

export async function DELETE(request: NextRequest) {
  return deleteAccount(request);
}

// API-55・D-119：表示名の変更はトークンを書き換えないので、共通の窓口と同じ手順（Origin確認・許可リスト）で送る
export async function PATCH(request: NextRequest) {
  return forwardToLaravel(request, ["me"]);
}
