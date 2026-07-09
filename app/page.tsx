import { isConfigured } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { NotConfigured } from "@/components/NotConfigured";

const ROADMAP = [
  "Sign In — a front-door login gate",
  "Customer Master — list customers, add / edit one",
  "GL Master — the ledger accounts list",
  "Sales Invoice — List (search + filter by status)",
  "Sales Invoice — View (read-only detail)",
  "Sales Invoice — Punch / Edit (create an invoice)",
  "Sales Invoice — Print Preview (printable page)",
  "Receipt Entry — record money and knock off invoices",
  "Upload Report — bulk import from a CSV",
  "Reminder Template — the chaser email you send",
  "Auto Email Shoot — chase every overdue customer",
  "Customer Statement — a running ledger for one customer",
  "AR Ageing — outstanding split into age buckets",
  "Cashflow Projection — expected collections, week by week",
  "Dashboard — the at-a-glance overview tiles",
];

export default function HomePage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Welcome — let's build the AR Manager"
        subtitle="Nothing here is pre-built. You build every screen, one at a time."
      />

      {!isConfigured && (
        <div className="mb-6">
          <NotConfigured />
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05)]">
        <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
          How this works
        </h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>The database and all its data already exist in Supabase.</li>
          <li>Build one screen at a time, starting from the roadmap below.</li>
          <li>When a screen works, keep going to the next one.</li>
          <li>Read <code className="rounded bg-slate-100 px-1">README.md</code> for setup and the kickoff prompt.</li>
        </ol>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_18px_rgba(15,23,42,0.05)]">
        <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
          The screens to build
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          The spine <span className="font-medium text-slate-700">Sign In → Customer Master → Invoice List → Invoice View → Receipt Entry</span> demos best.
        </p>
        <ol className="mt-4 grid list-decimal gap-x-8 gap-y-2 pl-5 text-sm leading-6 text-slate-700 sm:grid-cols-2">
          {ROADMAP.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Ready? Tell Claude Code: <span className="font-medium text-slate-700">&ldquo;build the Sign In screen.&rdquo;</span>
      </p>
    </div>
  );
}
