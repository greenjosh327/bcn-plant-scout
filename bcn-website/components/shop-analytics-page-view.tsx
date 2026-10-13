"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackShopAnalyticsEvent } from "@/lib/analytics/shop-analytics";

export function ShopAnalyticsPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTracked = useRef("");

  useEffect(() => {
    if (pathname?.startsWith("/plant-scout-challenge") || pathname?.startsWith("/admin/challenge")) return;
    const search = searchParams.toString();
    const path = `${pathname}${search ? `?${search}` : ""}`;
    if (!pathname || lastTracked.current === path) return;

    lastTracked.current = path;
    trackShopAnalyticsEvent("page_view");
  }, [pathname, searchParams]);

  return null;
}
