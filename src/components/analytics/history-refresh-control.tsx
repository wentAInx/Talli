"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { HistoricalRefreshProgress } from "@/domain/historical-quote-types";

interface ApiResponse {
  ok?: boolean;
  error?: string;
  result?: HistoricalRefreshProgress;
}

async function post(url: string, body: unknown): Promise<ApiResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiResponse;
  if (!response.ok) throw new Error(payload.error ?? "请求失败。");
  return payload;
}

export function HistoryRefreshControl({
  fromDate,
  toDate,
  resumeRun,
}: {
  fromDate: string;
  toDate: string;
  resumeRun: HistoricalRefreshProgress | null;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState(resumeRun);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const advance = async (runId: string) => {
    const payload = await post(
      `/api/analytics/history/refresh/${encodeURIComponent(runId)}/step`,
      { maxUnits: 4 },
    );
    if (payload.result) setProgress(payload.result);
    return payload.result;
  };

  const start = async () => {
    setPending(true);
    setMessage("正在创建可恢复的历史刷新任务…");
    try {
      const created = await post("/api/analytics/history/refresh", {
        fromDate,
        toDate,
      });
      if (!created.result) throw new Error("刷新任务未创建。");
      setProgress(created.result);
      const next =
        created.result.nextAction === "done"
          ? created.result
          : await advance(created.result.runId);
      setMessage(
        next?.nextAction === "done"
          ? "历史数据刷新完成。"
          : "本步已完成，可继续剩余单元。",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "历史刷新失败。");
    } finally {
      setPending(false);
    }
  };

  const resume = async () => {
    if (!progress) return;
    setPending(true);
    setMessage("正在执行下一组刷新单元…");
    try {
      const next = await advance(progress.runId);
      setMessage(
        next?.nextAction === "done"
          ? "历史数据刷新完成。"
          : next?.nextAction === "restart"
            ? "映射已变化，请重新创建刷新任务。"
            : "本步已完成，任务状态已持久化。",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "继续刷新失败。");
    } finally {
      setPending(false);
    }
  };

  const cancel = async () => {
    if (!progress) return;
    setPending(true);
    try {
      const payload = await post(
        `/api/analytics/history/refresh/${encodeURIComponent(progress.runId)}/cancel`,
        {},
      );
      if (payload.result) setProgress(payload.result);
      setMessage("历史刷新任务已取消；已提交缓存保持不变。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "取消刷新失败。");
    } finally {
      setPending(false);
    }
  };

  const purge = async () => {
    if (
      !window.confirm(
        "清除可重建的 provider 历史缓存与刷新记录？手工历史价格会保留。",
      )
    ) {
      return;
    }
    setPending(true);
    try {
      await post("/api/analytics/history/cache/purge", {
        confirm: "purge-provider-history",
      });
      setProgress(null);
      setMessage("Provider 历史缓存已清除；手工历史价格已保留。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "缓存清理失败。");
    } finally {
      setPending(false);
    }
  };

  const resumable =
    progress &&
    progress.nextAction !== "done" &&
    progress.nextAction !== "restart";
  return (
    <div className="history-refresh-control">
      <div className="history-refresh-actions">
        <button
          className="primary-button"
          disabled={pending}
          onClick={() => void start()}
          type="button"
        >
          {pending ? "处理中…" : "刷新历史数据"}
        </button>
        {resumable ? (
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() => void resume()}
            type="button"
          >
            {progress.nextAction === "retry" ? "重试本步" : "继续刷新"}
          </button>
        ) : null}
        {resumable ? (
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() => void cancel()}
            type="button"
          >
            取消任务
          </button>
        ) : null}
        <button
          className="danger-button"
          disabled={pending}
          onClick={() => void purge()}
          type="button"
        >
          清除 provider 缓存
        </button>
      </div>
      {progress ? (
        <p className="analytics-progress">
          任务 {progress.status} · {progress.completedUnits}/
          {progress.totalUnits} 完成 · {progress.failedUnits} 失败
        </p>
      ) : null}
      <p aria-live="polite" className="analytics-muted" role="status">
        {message}
      </p>
    </div>
  );
}
