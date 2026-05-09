import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { formatCurrency } from "@/lib/calc"
import { isPiiKeyConfigured } from "@/lib/crypto/secret-box"

const THRESHOLD = 600

const ALLOWED_YEARS: number[] = (() => {
  const current = new Date().getFullYear()
  // Show last 3 years + current year so contractors can re-issue corrections.
  return [current - 3, current - 2, current - 1, current]
})()

export default async function ThousandNinetyNinePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const params = await searchParams
  const year = parseYear(params.year)

  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user) redirect("/login")

  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1))

  // All subs with payments in the year. We compute eligibility per row.
  const subs = await prisma.subcontractor.findMany({
    where: {
      userId: user.id,
      payments: { some: { paidAt: { gte: yearStart, lt: yearEnd } } },
    },
    include: {
      payments: {
        where: { paidAt: { gte: yearStart, lt: yearEnd } },
        select: { amount: true, projectId: true },
      },
    },
    orderBy: { name: "asc" },
  })

  type Row = {
    id: string
    name: string
    isCorporation: boolean
    taxIdLast4: string | null
    hasTaxId: boolean
    total: number
    projects: number
    status: "ready" | "missing-tax-id" | "below-threshold" | "exempt-corp"
  }

  const rows: Row[] = subs.map((s) => {
    const total = s.payments.reduce((sum, p) => sum + p.amount, 0)
    const projects = new Set(s.payments.map((p) => p.projectId).filter(Boolean))
      .size
    let status: Row["status"]
    if (s.isCorporation) status = "exempt-corp"
    else if (total < THRESHOLD) status = "below-threshold"
    else if (!s.taxIdEncrypted) status = "missing-tax-id"
    else status = "ready"
    return {
      id: s.id,
      name: s.name,
      isCorporation: s.isCorporation,
      taxIdLast4: s.taxIdLast4,
      hasTaxId: !!s.taxIdEncrypted,
      total: Math.round(total * 100) / 100,
      projects,
      status,
    }
  })

  const piiConfigured = isPiiKeyConfigured()
  const eligible = rows.filter((r) => r.status === "ready")
  const missingTaxId = rows.filter((r) => r.status === "missing-tax-id")

  return (
    <div className="space-y-6">
      <div>
        <Link href="/subs" className="text-sm text-foreground-muted hover:text-foreground">
          ← All subs
        </Link>
        <h1 className="text-xl font-bold text-foreground mt-2">
          1099-NEC generation
        </h1>
        <p className="text-sm text-foreground-muted mt-1">
          For each sub paid <strong>${THRESHOLD}+</strong> in a tax year and not
          marked as a corporation, generate the recipient&rsquo;s 1099-NEC PDF
          (Copies B / C / 2). Copy A files separately through IRS FIRE.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 space-y-2">
        <p>
          <strong>This app does NOT file Copy A with the IRS.</strong> The
          official Copy A goes via{" "}
          <a
            href="https://fire.irs.gov/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium"
          >
            IRS FIRE
          </a>
          ,{" "}
          <a
            href="https://www.track1099.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium"
          >
            Track1099
          </a>
          , or{" "}
          <a
            href="https://www.tax1099.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium"
          >
            Tax1099.com
          </a>
          . The IRS requires Copy A to be printed on red drop-out ink; consumer
          printers can&rsquo;t reproduce it correctly.
        </p>
        <p>
          The PDFs you download here are <strong>recipient + payer + state
          copies only</strong>. Hand the recipient copy to your sub before Jan 31.
        </p>
      </div>

      {!piiConfigured && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-900">
          <p>
            <strong>SUBCONTRACTOR_PII_KEY is not set.</strong> Tax ID encryption
            is disabled, so 1099 generation is blocked. Generate a key with{" "}
            <code className="bg-white px-1 py-0.5 rounded text-[11px] font-mono">
              node -e
              &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;base64&apos;))&quot;
            </code>{" "}
            and set it in Vercel env vars.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-foreground-soft">Tax year:</span>
        {ALLOWED_YEARS.map((y) => (
          <Link
            key={y}
            href={`/subs/1099?year=${y}`}
            className={`px-3 py-1.5 rounded-md text-sm ${
              y === year
                ? "bg-accent text-white"
                : "bg-surface border border-border text-foreground-muted hover:bg-accent-soft"
            }`}
          >
            {y}
          </Link>
        ))}
      </div>

      {/* Summary band */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <SummaryStat label="Subs with activity" value={rows.length} />
        <SummaryStat label="Eligible to file" value={eligible.length} highlight />
        <SummaryStat label="Missing tax ID" value={missingTaxId.length} warn />
        <SummaryStat
          label="Total paid (eligible)"
          value={formatCurrency(
            eligible.reduce((sum, r) => sum + r.total, 0),
          )}
        />
      </div>

      {rows.length === 0 ? (
        <div className="bg-surface border border-dashed border-border rounded-lg p-8 text-center text-sm text-foreground-soft">
          No payments logged in {year} yet.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-foreground-soft uppercase tracking-wider bg-surface-muted">
                <th className="text-left px-3 py-2">Sub</th>
                <th className="text-left px-3 py-2">Tax ID</th>
                <th className="text-right px-3 py-2">Total paid</th>
                <th className="text-right px-3 py-2">Projects</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-muted/40">
                  <td className="px-3 py-2">
                    <Link
                      href={`/subs/${r.id}`}
                      className="text-foreground hover:text-accent font-medium"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground-muted">
                    {r.hasTaxId ? `••••• ${r.taxIdLast4 ?? "????"}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(r.total)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.projects}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.status === "ready" && piiConfigured ? (
                      <a
                        href={`/api/pdf/1099/${r.id}/${year}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 bg-accent text-white rounded hover:bg-accent-hover"
                      >
                        Generate B/C/2
                      </a>
                    ) : r.status === "missing-tax-id" ? (
                      <Link
                        href={`/subs/${r.id}`}
                        className="text-xs text-accent hover:underline"
                      >
                        Add tax ID →
                      </Link>
                    ) : (
                      <span className="text-xs text-foreground-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function parseYear(raw: string | undefined): number {
  const current = new Date().getFullYear()
  if (!raw) {
    // Default: previous year if it's January (still filing last year), else current.
    return new Date().getMonth() < 2 ? current - 1 : current
  }
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return current
  if (n < ALLOWED_YEARS[0]) return ALLOWED_YEARS[0]
  if (n > ALLOWED_YEARS[ALLOWED_YEARS.length - 1]) {
    return ALLOWED_YEARS[ALLOWED_YEARS.length - 1]
  }
  return n
}

function SummaryStat({
  label,
  value,
  highlight,
  warn,
}: {
  label: string
  value: string | number
  highlight?: boolean
  warn?: boolean
}) {
  return (
    <div
      className={`bg-surface border rounded-lg p-3 ${
        highlight
          ? "border-accent"
          : warn
            ? "border-amber-300 bg-amber-50"
            : "border-border"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-foreground-soft">
        {label}
      </p>
      <p className="text-lg font-semibold text-foreground tabular-nums mt-0.5">
        {value}
      </p>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ready: {
      label: "Ready",
      cls: "bg-green-50 border-green-200 text-green-900",
    },
    "missing-tax-id": {
      label: "Tax ID missing",
      cls: "bg-red-50 border-red-200 text-red-900",
    },
    "below-threshold": {
      label: "Below $600",
      cls: "bg-surface-muted border-border text-foreground-soft",
    },
    "exempt-corp": {
      label: "Exempt (corp)",
      cls: "bg-surface-muted border-border text-foreground-soft",
    },
  }
  const v = map[status] ?? map.ready
  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${v.cls}`}
    >
      {v.label}
    </span>
  )
}
