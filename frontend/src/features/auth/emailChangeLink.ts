import {
  readVerificationLink,
  type VerificationLink,
} from "./verificationLink";

const LINK_FIELDS = ["id", "hash", "expires", "signature"] as const;

export function readEmailChangeLink(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();
  for (const field of LINK_FIELDS) {
    const value = searchParams[field];
    if (typeof value === "string") query.append(field, value);
    else if (Array.isArray(value))
      for (const item of value) query.append(field, item);
  }
  const suffix = query.toString();

  return {
    link: readVerificationLink(searchParams),
    hasLink: LINK_FIELDS.some((field) => searchParams[field] !== undefined),
    currentPath: `/account/email${suffix ? `?${suffix}` : ""}`,
  };
}

export function emailChangeApiPath(link: VerificationLink): string {
  // D-72：Laravelが署名した順番を保ち、本文ではなくクエリで渡す
  const query = new URLSearchParams({
    expires: link.expires,
    hash: link.hash,
    id: link.id,
    signature: link.signature,
  });
  return `/me/email-change/confirm?${query}`;
}
