import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { formatCurrency } from "@/lib/calc"
import { StatusBadge } from "@/components/ui/status-badge"
import { AutoSaveForm } from "../../projects/[id]/auto-form"
import {
  addReceiptItem,
  applyCatalogUpdates,
  assignReceiptToProject,
  deleteReceipt,
  deleteReceiptItem,
  previewCatalogUpdates,
  reparseReceipt,
  updateReceipt,
  updateReceiptItem,
} from "../actions"
import { ReparseButton } from "./reparse-button"
import { AutoParseTrigger } from "./auto-parse-trigger"
import { CatalogUpdateReview } from "./catalog-update-review"
import { ConfirmSubmitButton } from "../../confirm-submit-button"
import { logError } from "@/lib/log"

// Claude vision parse can take 10–25s; the default 10s Vercel function
// timeout was killing the upload before we decoupled it. The auto-parse
// trigger calls `reparseReceipt` from this page, so the action inherits
// this duration. 60s is the Hobby-plan ceiling.
export const maxDuration = 60

async function loadReceiptDetail(id: string) {
  const session = await auth()
  if (!session?.user?.email) return { found: false } as const
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return { found: false } as const

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
  if (!receipt) return { found: false } as const
  return { found: true as const, receipt, projects }
}

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let detail: Awaited<ReturnType<typeof loadReceiptDetail>>
  try {
    detail = await loadReceiptDetail(id)
  } catch (e) {
    // Re-throw so error.tsx renders, but make sure the actual error is in
    // the Vercel logs first — Next's production wrapper hides the inner
    // message from the client and from the digest hash, which is why every
    // server-component error looks identical (digest 3062837146).
    logError("/receipts/[id]", e, { receiptId: id })
    throw e
  }
  if (!detail.found) notFound()
  const { receipt, projects } = detail

  const itemsTotal = receipt.items.reduce(
    (sum, i) => sum + (i.lineTotal != null ? i.lineTotal : i.quantity * i.unitPrice),
    0,
  )

  const isPdf =
    receipt.filename.toLowerCase().endsWith(".pdf") ||
    receipt.imagePathname?.toLowerCase().endsWith(".pdf")
  const shouldAutoParse =
    receipt.parseStatus === "pending" && receipt.items.length === 0

  // For catalog receipts, prefetch the fuzzy-match preview so the review
  // panel renders synchronously. Falls back to an empty preview if parsing
  // hasn't completed yet — the review component handles the empty case.
  const catalogPreview = receipt.forCatalog
    ? receipt.items.length > 0
      ? await previewCatalogUpdates(receipt.id).catch((e) => {
          logError("/receipts/[id]/preview", e, { receiptId: receipt.id })
          return null
        })
      : null
    : null

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
          <div className="flex items-center gap-2">
            {receipt.forCatalog && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider bg-accent-soft text-foreground border border-accent/30">
                Catalog
              </span>
            )}
            <StatusBadge status={receipt.parseStatus} className="uppercase tracking-wider" />
          </div>
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

          {receipt.forCatalog && catalogPreview && (
            <CatalogUpdateReview
              preview={catalogPreview}
              alreadyReviewed={!!receipt.catalogReviewedAt}
              applyAction={applyCatalogUpdates.bind(null, receipt.id)}
            />
          )}
          {receipt.forCatalog && !catalogPreview && receipt.items.length === 0 && (
            <div className="bg-surface border border-border rounded-lg p-5 text-sm text-foreground-soft italic">
              Waiting for AI to parse this receipt before showing catalog
              updates… If this stays here for more than 30 seconds, click
              &ldquo;Re-parse with AI&rdquo; on the left.
            </div>
          )}

          {!receipt.forCatalog && (
          <>
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
                            className="text-xs text-foreground-soft opacity-0 group-hover:opacity-100 hover:text-danger transition-all [@media(hover:none)]:opacity-50"
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
          </>
          )}

          <form action={deleteReceipt.bind(null, receipt.id)} className="flex justify-end">
            <ConfirmSubmitButton
              confirmText="Delete this receipt? This cannot be undone."
              className="text-xs text-foreground-soft hover:text-danger transition-colors"
            >
              Delete receipt
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>
    </div>
  )
}
