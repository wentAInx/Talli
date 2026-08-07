import Link from "next/link";

import { createAccountAction } from "@/app/actions";
import { AccountForm } from "@/components/forms/account-form";
import { LedgerReadService } from "@/services";

import { withDatabase } from "../../server-runtime";

export const dynamic = "force-dynamic";

export default async function NewAccountPage() {
  const reference = await withDatabase((context) =>
    new LedgerReadService(context).getReferenceData(new Date().toISOString()),
  );
  return (
    <div className="narrow-page page-stack">
      <header className="page-heading">
        <div>
          <Link className="back-link" href="/accounts">
            ← 返回账户
          </Link>
          <h1>添加账户</h1>
          <p>选择原生资产后，金额会严格按该资产精度保存。</p>
        </div>
      </header>
      <section className="form-card">
        <AccountForm action={createAccountAction} assets={reference.assets} />
      </section>
    </div>
  );
}
