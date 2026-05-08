import Link from "next/link"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { formatCurrency } from "@/lib/calc"
import { uploadReceipt } from "./actions"
import { UploadReceiptButton } from "./upload-receipt-button"

// Receipt uploads can take 5-15s on a slow phone connection (Blob put +
// DB row creation). Server actions inherit maxDuration from the page they
// run from, so set 60 here.
export const maxDuration = 60

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  parsed: "bg-green-50 text-green-700",
  manual: "bg-blue-50 text-blue-700",
  error: "bg-red-50 text-red-700",
}

export default async function ReceiptsPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) redirect("/login")

  const [receipts, projects] = await Promise.all([
    prisma.receipt.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { project: { select: { name: true } } },
    }),
    prisma.project.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Receipts</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Snap receipts as you check out. Claude vision parses each one into line
            items; assign to a project to track actual spend vs. estimate.
          </p>
        </div>
        <UploadReceiptButton
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          uploadAction={uploadReceipt}
        />
      </div>

      {receipts.length === 0 ? (
        <div className="bg-surface border border-dashed border-border rounded-lg p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-accent-soft rounded-2xl mb-4">
            <span className="text-3xl">🧾</span>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">No receipts yet</h2>
          <p className="text-sm text-foreground-muted max-w-md mx-auto mb-6">
            Upload a photo of a Home Depot, Lowe&apos;s, or any other receipt. The
            AI parser will extract line items so you can track actuals against your
            project estimate.
          </p>
          <UploadReceiptButton
            primary
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            uploadAction={uploadReceipt}
          />
        </div>
      ) : (
        <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
          {receipts.map((r) => (
            <li key={r.id}>
              <Link
                href={`/receipts/${r.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.imageUrl}
                  alt={r.filename}
                  className="w-12 h-12 object-cover rounded border border-border shrink-0"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-foreground truncate">
                      {r.vendor ?? r.filename}
                    </p>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        STATUS_BADGE[r.parseStatus] ?? STATUS_BADGE.pending
                      }`}
                    >
                      {r.parseStatus}
                    </span>
                  </div>
                  <p className="text-sm text-foreground-muted truncate">
                    {r.purchasedAt
                      ? r.purchasedAt.toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : r.createdAt.toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                    {r.project ? ` · ${r.project.name}` : " · Unassigned"}
                  </p>
                </div>
                <div className="ml-2 text-right shrink-0">
                  <p className="font-semibold text-foreground tabular-nums">
                    {r.total != null ? formatCurrency(r.total) : "—"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
