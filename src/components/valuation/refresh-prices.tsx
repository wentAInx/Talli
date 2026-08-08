"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface RefreshResponse {
  refreshed?: string[];
  skipped?: string[];
  failed?: Array<{ provider: string; code: string }>;
}

export function RefreshPrices({ autoRefresh }: { autoRefresh: boolean }) {
  const router = useRouter();
  const autoStarted = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(
    async (force: boolean) => {
      setPending(true);
      setMessage(force ? "正在刷新价格…" : "正在后台刷新价格…");
      try {
        const response = await fetch("/api/prices/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        const payload = (await response.json()) as RefreshResponse;
        if (!response.ok) {
          setMessage("价格刷新请求失败，原生账本仍可正常使用。");
          return;
        }
        if (payload.failed && payload.failed.length > 0) {
          setMessage(
            `部分价格源失败：${payload.failed.map((item) => item.provider).join("、")}。旧缓存不会被删除。`,
          );
        } else if (payload.refreshed && payload.refreshed.length > 0) {
          setMessage("价格已刷新。");
        } else {
          setMessage("刚刚已请求，请稍后再刷新。");
        }
        router.refresh();
      } catch {
        setMessage("价格刷新请求失败，原生账本仍可正常使用。");
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (!autoRefresh || autoStarted.current) return;
    autoStarted.current = true;
    void refresh(false);
  }, [autoRefresh, refresh]);

  return (
    <div className="price-refresh-control">
      <button
        className="secondary-button"
        disabled={pending}
        onClick={() => void refresh(true)}
        type="button"
      >
        {pending ? "正在刷新…" : "刷新价格"}
      </button>
      <span aria-live="polite" role="status">
        {message}
      </span>
    </div>
  );
}
