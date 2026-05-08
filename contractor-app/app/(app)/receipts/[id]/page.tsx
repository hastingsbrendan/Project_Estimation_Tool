import Link from "next/link"
import { notFound } from "next/navigation"

// Claude vision parse can take 10–25s; the default 10s Vercel function
// timeout was killing the upload before we decoupled it. The auto-parse
// trigger calls `reparseReceipt` from this page, so the action inherits
// this duration. 60s is the Hobby-plan ceiling.
export const maxDuration = 60

import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { formatCurrency } from "@/lib/calc"
import { AutoSaveForm } from "../../projects/[id]/auto-form"
import {
  addReceiptItem,
  assignReceiptToProject,
  deleteReceipt,
  deleteReceiptItem,
  reparseReceipt,
  updateReceipt,
  updateReceiptItem,
} from "../actions"
import { ReparseButton } from "./reparse-button"
import { AutoParseTrigger } from "./auto-parse-trigger"

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  parsed: "bg-green-50 text-green-700",
  manual: "bg-blue-50 text-blue-700",
  error: "bg-red-50 text-red-700",
}

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.email) notFound()
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) notFound()

  const [receipt, projects] = await Promise.all([
    prisma.receipt.findFirst({
      where: { id, userId: user.id },
      include: {
        items: { orderBy: { order: "asc" } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.project.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
    }),
  ])
  if (!receipt) notFound()

  const itemsTotal = receipt.items.reduce(
    (sum, i) => sum + (i.lineTotal != null ? i.lineTotal : i.quantity * i.unitPrice),
    0,
  )

  const isPdf =
    receipt.filename.toLowerCase().endsWith(".pdf") ||
    receipt.imagePathname?.toLowerCase().endsWith(".pdf")
  const shouldAutoParse =
    receipt.parseStatus === "pending" && receipt.items.length === 0

  return (
    <div className="space-y-6">
      <div>
        <Link href="/receipts" className="text-sm text-foreground-muted hover:text-foreground">
          ← All receipts
        </Link>
        <div className="flex items-baseline justify-between flex-wrap gap-3 mt-2">
          <h1 className="text-xl font-bold text-foreground">
            {receipt.vendor ?? receipt.filename}
          </h1>
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider ${
              STATUS_BADGE[receipt.parseStatus] ?? STATUS_BADGE.pending
            }`}
          >
            {receipt.parseStatus}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            {isPdf ? (
              <object
                data={receipt.imageUrl}
                type="application/pdf"
                className="w-full h-[420px] bg-surface-muted"
              >
                <div className="p-6 text-center text-sm text-foreground-soft">
                  PDF preview unavailable in this browser.{" "}
                  <a
                    href={receipt.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    Open the PDF →
                  </a>
                </div>
              </object>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={receipt.imageUrl}
                alt={receipt.filename}
                className="w-full h-auto"
              />
            )}
          </div>
          <div className="mt-3 space-y-1.5">
            <a
              href={receipt.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-foreground-muted hover:text-foreground block"
            >
              {isPdf ? "Open PDF →" : "Open full-size image →"}
            </a>
            <ReparseButton receiptId={receipt.id} action={reparseReceipt} />
          </div>
        </div>

        <div className="md:col-span-2 space-y-4">
          <AutoParseTrigger
            receiptId={receipt.id}
            shouldRun={shouldAutoParse}
            action={reparseReceipt}
          />
          {receipt.parseError && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
              <strong>Parse note:</strong> {receipt.parseError}
            </div>
          )}

          <div className="bg-surface border border-border rounded-lg p-5">
            <AutoSaveForm
              action={updateReceipt.bind(null, receipt.id)}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Vendor
                </label>
                <input
                  name="vendor"
                  defaultValue={receipt.vendor ?? ""}
                  placeholder="e.g. The Home Depot"
                  className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Purchased
                </label>
                <input
                  name="purchasedAt"
                  type="date"
                  defaultValue={receipt.purchasedAt ? receipt.purchasedAt.toISOString().slice(0, 10) : ""}
                  className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:col-span-1">
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Subtotal
                  </label>
                  <input
                    name="subtotal"
                    type="number"
                    step="0.01"
                    defaultValue={receipt.subtotal ?? ""}
                    className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Tax
                  </label>
                  <input
                    name="tax"
                    type="number"
                    step="0.01"
                    defaultValue={receipt.tax ?? ""}
                    className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-1">
                    Total
                  </label>
                  <input
                    name="total"
                    type="number"
                    step="0.01"
                    defaultValue={receipt.total ?? ""}
                    className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent tabular-nums"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-foreground-muted mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  defaultValue={receipt.notes ?? ""}
                  rows={2}
                  className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent resize-y"
                />
              </div>
            </AutoSaveForm>
          </div>

          {/* Project assignment */}
          <div className="bg-surface border border-border rounded-lg p-5">
            <p className="text-xs font-medium text-foreground-muted mb-2">Assign to project</p>
            <form action={assignReceiptToProject.bind(null, receipt.id)} className="flex items-center gap-2">
              <select
                name="projectId"
                defaultValue={receipt.projectId ?? ""}
                className="flex-1 text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">— Unassigned —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-3 py-1.5 bg-surface border border-border rounded text-foreground text-sm font-medium hover:bg-accent-soft hover:border-accent"
              >
                Save
              </button>
            </form>
            {receipt.project && (
              <p className="text-xs text-foreground-soft mt-2">
                Currently linked to{" "}
                <Link
                  href={`/projects/${receipt.project.id}`}
                  className="text-accent hover:underline"
                >
                  {receipt.project.name}
                </Link>
              </p>
            )}
          </div>

          {/* Line items */}
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-surface-muted border-b border-border flex items-baseline justify-between">
              <p className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
                Items ({receipt.items.length})
              </p>
              <p className="text-xs text-foreground-soft tabular-nums">
                Items total: {formatCurrency(itemsTotal)}
                {receipt.total != null && Math.abs(itemsTotal - receipt.total) > 0.01 && (
                  <span className="text-warning ml-2">
                    (header total {formatCurrency(receipt.total)})
                  </span>
                )}
              </p>
            </div>

            {receipt.items.length === 0 ? (
              <p className="text-sm text-foreground-soft italic px-4 py-6 text-center">
                No items yet. Add them below or click &ldquo;Re-parse&rdquo; to try AI parsing again.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {receipt.items.map((item) => (
                  <div key={item.id} className="px-4 py-2 hover:bg-surface-muted/50 transition-colors group">
                    <div className="grid grid-cols-12 gap-2 items-center text-sm">
                      <AutoSaveForm
                        action={updateReceiptItem.bind(null, receipt.id, item.id)}
                        className="col-span-12 sm:col-span-11 grid grid-cols-11 gap-2 items-center"
                      >
                        <div className="col-span-12 sm:col-span-5">
                          <input
                            name="description"
                            defaultValue={item.description}
                            className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 text-foreground"
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-1">
                          <input
                            name="quantity"
                            type="number"
                            step="0.01"
                            defaultValue={item.quantity}
                            className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 tabular-nums text-foreground"
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-1">
                          <input
                            name="unit"
                            defaultValue={item.unit}
                            className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 text-foreground"
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-2">
                          <input
                            name="unitPrice"
                            type="number"
                            step="0.01"
                            defaultValue={item.unitPrice}
                            className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 tabular-nums text-foreground"
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-2">
                          <input
                            name="lineTotal"
                            type="number"
                            step="0.01"
                            defaultValue={item.lineTotal ?? ""}
                            placeholder={(item.quantity * item.unitPrice).toFixed(2)}
                            className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 tabular-nums text-foreground text-right"
                          />
                        </div>
                      </AutoSaveForm>
                      <div className="col-span-12 sm:col-span-1 flex justify-end">
                        <form
                          action={deleteReceiptItem.bind(null, receipt.id, item.id)}
                        >
                          <button
                            type="submit"
                            className="text-xs text-foreground-soft opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                            title="Delete item"
                          >
                            ✕
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add line item */}
            <form
              action={addReceiptItem.bind(null, receipt.id)}
              className="px-4 py-3 border-t border-border bg-surface-muted/50"
            >
              <div className="grid grid-cols-12 gap-2 items-end text-sm">
                <div className="col-span-12 sm:col-span-5">
                  <label className="block text-xs text-foreground-muted mb-0.5">Description</label>
                  <input
                    name="description"
                    required
                    placeholder="e.g. 2x4 stud, 8ft"
                    className="w-full border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <label className="block text-xs text-foreground-muted mb-0.5">Qty</label>
                  <input
                    name="quantity"
                    type="number"
                    step="0.01"
                    defaultValue="1"
                    className="w-full border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <label className="block text-xs text-foreground-muted mb-0.5">Unit</label>
                  <input
                    name="unit"
                    defaultValue="ea"
                    className="w-full border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <label className="block text-xs text-foreground-muted mb-0.5">Unit $</label>
                  <input
                    name="unitPrice"
                    type="number"
                    step="0.01"
                    defaultValue="0"
                    className="w-full border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <label className="block text-xs text-foreground-muted mb-0.5">Line total</label>
                  <input
                    name="lineTotal"
                    type="number"
                    step="0.01"
                    placeholder="auto"
                    className="w-full border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div className="col-span-12 sm:col-span-1">
                  <button
                    type="submit"
                    className="w-full px-2 py-1 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover"
                  >
                    Add
                  </button>
                </div>
              </div>
            </form>
          </div>

          <form action={deleteReceipt.bind(null, receipt.id)} className="flex justify-end">
            <button
              type="submit"
              onClick={(e) => {
                if (!confirm("Delete this receipt? This cannot be undone.")) {
                  e.preventDefault()
                }
              }}
              className="text-xs text-foreground-soft hover:text-danger transition-colors"
            >
              Delete receipt
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
