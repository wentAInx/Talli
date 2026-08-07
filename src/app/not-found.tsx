import Link from "next/link";

export default function NotFound() {
  return (
    <section className="empty-state">
      <span className="empty-mark" aria-hidden="true">
        404
      </span>
      <h1>没有找到这个页面</h1>
      <p>记录可能已删除，或链接已经失效。</p>
      <Link className="primary-button" href="/">
        返回资产总览
      </Link>
    </section>
  );
}
