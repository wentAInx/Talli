import Link from "next/link";

import { MobileHeader, Navigation } from "./navigation";
import { TimeZoneBootstrap } from "./time-zone-bootstrap";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <TimeZoneBootstrap />
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Talli 首页">
          <span className="brand-seal" aria-hidden="true">
            T
          </span>
          <span>
            <strong>Talli</strong>
            <small>原生资产账本</small>
          </span>
        </Link>
        <Navigation />
        <p className="sidebar-note">
          原生数量独立记账
          <br />
          可选估值 · 明确来源
        </p>
      </aside>

      <div className="workspace">
        <header className="mobile-header">
          <MobileHeader />
        </header>
        <main id="main-content" className="main-content">
          {children}
        </main>
      </div>

      <Link className="global-add" href="/transactions/new">
        <span aria-hidden="true">＋</span> 记一笔
      </Link>
      <Navigation mobile />
    </div>
  );
}
