"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface RestoreResult {
  exportedAt: string;
  target: "empty" | "seed-only";
  summary: {
    accounts: number;
    assets: number;
    books: number;
    categories: number;
    entries: number;
    events: number;
    settings: number;
    snapshots: number;
    tags: number;
  };
}

export function RestorePanel() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);

  async function requestRestore(mode: "preview" | "commit") {
    const form = formRef.current;
    if (!form) {
      return;
    }
    if (
      mode === "commit" &&
      !window.confirm(
        "确认恢复这份备份？目标中的空库或原始 seed 数据会被备份内容替换。",
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    setComplete(false);
    try {
      const data = new FormData(form);
      data.set("mode", mode);
      const response = await fetch("/api/data/restore", {
        method: "POST",
        body: data,
      });
      const body = (await response.json()) as {
        error?: string;
        result?: RestoreResult;
      };
      if (!response.ok || !body.result) {
        throw new Error(body.error ?? "恢复请求失败。");
      }
      setPreview(body.result);
      if (mode === "commit") {
        setComplete(true);
        router.refresh();
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "恢复请求失败。",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="restore-panel">
      <form
        ref={formRef}
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          void requestRestore("preview");
        }}
      >
        <label className="field">
          <span>JSON 备份文件</span>
          <input
            accept="application/json,.json"
            name="file"
            onChange={() => {
              setPreview(null);
              setComplete(false);
              setError(null);
            }}
            required
            type="file"
          />
          <small>V1 最大 50 MB。预览不会写入数据库。</small>
        </label>
        <button className="secondary-button" disabled={pending} type="submit">
          {pending ? "正在校验…" : "校验并预览"}
        </button>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {preview ? (
        <div className="restore-preview" aria-live="polite">
          <strong>备份校验通过</strong>
          <p>
            导出时间 {preview.exportedAt} · 目标 {preview.target}
          </p>
          <dl>
            <div>
              <dt>资产</dt>
              <dd>{preview.summary.assets}</dd>
            </div>
            <div>
              <dt>账户</dt>
              <dd>{preview.summary.accounts}</dd>
            </div>
            <div>
              <dt>事件 / 分录</dt>
              <dd>
                {preview.summary.events} / {preview.summary.entries}
              </dd>
            </div>
            <div>
              <dt>余额锚点</dt>
              <dd>{preview.summary.snapshots}</dd>
            </div>
          </dl>
          {complete ? (
            <p className="success-message" role="status">
              恢复完成，页面数据已刷新。
            </p>
          ) : (
            <button
              className="danger-button"
              disabled={pending}
              onClick={() => void requestRestore("commit")}
              type="button"
            >
              确认恢复
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
