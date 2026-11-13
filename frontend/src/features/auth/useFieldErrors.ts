"use client";

import { useState } from "react";
import { focusFirstError, type FieldErrors } from "./validation";

/**
 * C-04：項目ごとのエラー表示。表示したら最初のエラーの欄へカーソルを移し、
 * 直した欄だけ表示を消す。
 */
export function useFieldErrors<K extends string>(
  fields: readonly K[],
  idPrefix = "",
) {
  const [errors, setErrors] = useState<FieldErrors<K>>({});

  function show(next: FieldErrors<K>) {
    setErrors(next);
    focusFirstError(next, fields, idPrefix);
  }

  function clear(field: K) {
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function hasAny(next: FieldErrors<K>): boolean {
    return fields.some((field) => next[field]);
  }

  return { errors, show, clear, reset: () => setErrors({}), hasAny };
}
