"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { initializeAppTimeZoneAction } from "@/app/actions";

export function TimeZoneBootstrap() {
  const router = useRouter();

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) {
      return;
    }
    let active = true;
    void initializeAppTimeZoneAction(timeZone)
      .then((initialized) => {
        if (active && initialized) {
          router.refresh();
        }
      })
      .catch(() => {
        // A stored timezone can still be selected manually from Settings.
      });
    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
