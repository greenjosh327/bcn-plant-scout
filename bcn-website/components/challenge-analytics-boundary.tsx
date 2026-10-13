"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
// Contest forms and private admin review do not load site advertising/analytics scripts.
export function ChallengeAnalyticsBoundary({ children }: { children: ReactNode }) {
  const path = usePathname();
  return path.startsWith("/plant-scout-challenge") || path.startsWith("/admin/challenge") ? null : children;
}
