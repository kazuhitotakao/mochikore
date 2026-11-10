// D-72：確認メールのリンク（/verify-email?id=…&hash=…&expires=…&signature=…）に載る値
export type VerificationLink = {
  id: string;
  hash: string;
  expires: string;
  signature: string;
};

/**
 * SC-04 のクエリから、確認メールのリンクの値を取り出す。そろっていなければ null。
 * 値の正しさは Laravel が確かめるので、ここでは文字列であることだけを見る。
 */
export function readVerificationLink(
  searchParams: Record<string, string | string[] | undefined>,
): VerificationLink | null {
  const { id, hash, expires, signature } = searchParams;
  if (
    typeof id !== "string" ||
    typeof hash !== "string" ||
    typeof expires !== "string" ||
    typeof signature !== "string"
  ) {
    return null;
  }

  return { id, hash, expires, signature };
}

/**
 * Laravel が署名を確かめる API-23 のパス。署名した順（expires → signature）でクエリを並べる。
 */
export function verificationApiPath(link: VerificationLink): string {
  const query = new URLSearchParams({
    expires: link.expires,
    signature: link.signature,
  });

  return `/email/verify/${encodeURIComponent(link.id)}/${encodeURIComponent(link.hash)}?${query}`;
}
