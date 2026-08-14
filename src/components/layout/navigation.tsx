"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "总览", mark: "总" },
  { href: "/transactions", label: "流水", mark: "流" },
  { href: "/reports", label: "报表", mark: "报" },
  { href: "/accounts", label: "账户", mark: "账" },
  { href: "/import", label: "导入", mark: "入" },
  { href: "/sync", label: "同步", mark: "同" },
  { href: "/settings", label: "设置", mark: "设" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Navigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={mobile ? "手机主导航" : "主导航"}
      className={mobile ? "mobile-nav" : "desktop-nav"}
    >
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="nav-item"
          aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
        >
          <span aria-hidden="true" className="nav-mark">
            {item.mark}
          </span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function MobileHeader() {
  const pathname = usePathname();
  const title =
    pathname === "/transactions/new"
      ? "记一笔"
      : /^\/transactions\/[^/]+$/.test(pathname)
        ? "编辑流水"
        : pathname.startsWith("/reports")
          ? "报表"
          : pathname.startsWith("/import")
            ? "文件导入"
            : pathname.startsWith("/sync")
              ? "外部同步"
              : pathname.startsWith("/settings")
                ? "设置"
                : pathname.startsWith("/accounts")
                  ? "账户"
                  : pathname.startsWith("/transactions")
                    ? "流水"
                    : "资产总览";
  return (
    <>
      <span>{title}</span>
      {pathname !== "/transactions/new" ? (
        <Link className="mobile-add" href="/transactions/new">
          + 记一笔
        </Link>
      ) : null}
    </>
  );
}
