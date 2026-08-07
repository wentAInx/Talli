"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="empty-state" role="alert">
      <span className="empty-mark" aria-hidden="true">
        !
      </span>
      <h1>页面暂时无法加载</h1>
      <p>数据库没有被自动重置。请重试；若问题持续，请先下载或保留数据文件。</p>
      <button className="primary-button" onClick={reset} type="button">
        重试
      </button>
    </section>
  );
}
