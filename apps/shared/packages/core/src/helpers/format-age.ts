/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export const formatCompactAge = (
  isoDate: string | null | undefined,
  now = Date.now(),
): string => {
  if (!isoDate) return "";
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";

  const elapsedMs = Math.max(0, now - parsed.getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (elapsedMs >= year) return `${Math.floor(elapsedMs / year)}y`;
  if (elapsedMs >= month) return `${Math.floor(elapsedMs / month)}m`;
  if (elapsedMs >= day) return `${Math.floor(elapsedMs / day)}d`;
  if (elapsedMs >= hour) return `${Math.floor(elapsedMs / hour)}h`;
  return `${Math.max(1, Math.floor(elapsedMs / minute))}m`;
};
