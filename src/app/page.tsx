const principles = [
  "原生资产数量独立记账",
  "金额使用 bigint 与 SQLite TEXT",
  "不接入行情、汇率或统一估值",
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <p className="text-sm font-semibold tracking-[0.2em] text-slate-500 uppercase">
          Asset Ledger · V1
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          多资产个人账本
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          当前工程先完成精确金额、账本不变量、SQLite
          持久化与幂等初始化；产品界面将在下一阶段接入同一服务边界。
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-3">
          {principles.map((principle) => (
            <li
              key={principle}
              className="rounded-2xl bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700"
            >
              {principle}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
