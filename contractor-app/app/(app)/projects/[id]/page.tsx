import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { calcEstimate, formatCurrency, lineItemTotal } from "@/lib/calc"
import { roomMetrics } from "@/lib/room"
import { deleteProject } from "../actions"
import {
  addSection,
  addLineItem,
  deleteSection,
  deleteLineItem,
  moveSection,
  moveLineItem,
  refreshPricesFromCatalog,
  renameSection,
  updateLineItem,
  updateProjectMeta,
} from "./actions"
import { addRoom, updateRoom, deleteRoom } from "./room-actions"
import { AutoSaveForm } from "./auto-form"
import { AddLineItemForm } from "./catalog-picker"
import { RefreshPricesButton } from "./refresh-prices-button"

const STATUSES = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-700" },
  { value: "sent", label: "Sent", color: "bg-blue-50 text-blue-700" },
  { value: "accepted", label: "Accepted", color: "bg-green-50 text-green-700" },
  { value: "won", label: "Won", color: "bg-green-100 text-green-800" },
  { value: "rejected", label: "Rejected", color: "bg-red-50 text-red-700" },
  { value: "lost", label: "Lost", color: "bg-red-100 text-red-800" },
] as const

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.email) notFound()

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) notFound()

  const [project, catalog] = await Promise.all([
    prisma.project.findFirst({
      where: { id, userId: user.id },
      include: {
        sections: {
          orderBy: { order: "asc" },
          include: { lineItems: { orderBy: { order: "asc" } } },
        },
        rooms: { orderBy: { order: "asc" } },
      },
    }),
    prisma.catalogItem.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { description: "asc" },
      select: {
        id: true,
        trade: true,
        description: true,
        unit: true,
        unitPrice: true,
        kind: true,
      },
    }),
  ])
  if (!project) notFound()

  // Number of line items linked to a catalog entry where the catalog price
  // has drifted — drives the visibility/count of the "Refresh prices" button.
  const allLineItemsRaw = project.sections.flatMap((s) => s.lineItems)
  const linkedLineItems = allLineItemsRaw.filter((li) => li.catalogItemId)
  const catalogById = new Map(catalog.map((c) => [c.id, c]))
  const refreshableCount = linkedLineItems.filter((li) => {
    const c = catalogById.get(li.catalogItemId!)
    return c && (c.unitPrice !== li.unitPrice || c.unit !== li.unit || c.kind !== li.kind)
  }).length

  const allLineItems = project.sections.flatMap((s) =>
    s.lineItems.map((li) => ({
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      kind: li.kind as "material" | "labor",
    })),
  )
  const totals = calcEstimate({
    lineItems: allLineItems,
    markupPct: project.markupPct,
    taxRate: project.taxRate,
  })

  const currentStatus = STATUSES.find((s) => s.value === project.status) ?? STATUSES[0]

  return (
    <div className="space-y-6 pb-32">
      {/* Back link */}
      <div>
        <Link href="/projects" className="text-sm text-foreground-muted hover:text-foreground">
          ← All projects
        </Link>
      </div>

      {/* Project meta */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <AutoSaveForm action={updateProjectMeta.bind(null, project.id)} className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-foreground-soft uppercase tracking-wider mb-1">
                Project name
              </label>
              <input
                name="name"
                defaultValue={project.name}
                className="w-full text-xl font-bold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none py-1 -mx-1 px-1"
              />
            </div>
            <div className="shrink-0">
              <label className="block text-xs font-medium text-foreground-soft uppercase tracking-wider mb-1 text-right">
                Status
              </label>
              <select
                name="status"
                defaultValue={project.status}
                className={`text-xs font-medium rounded-full px-3 py-1.5 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${currentStatus.color}`}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">Client</label>
              <input
                name="clientName"
                defaultValue={project.clientName ?? ""}
                placeholder="Client name"
                className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">Client email</label>
              <input
                name="clientEmail"
                type="email"
                defaultValue={project.clientEmail ?? ""}
                placeholder="email@example.com"
                className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-foreground-muted mb-1">Address</label>
              <input
                name="address"
                defaultValue={project.address ?? ""}
                placeholder="Job site address"
                className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">Markup %</label>
              <input
                name="markupPct"
                type="number"
                step="0.1"
                min="0"
                defaultValue={project.markupPct}
                className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">
                Sales tax % (materials)
              </label>
              <input
                name="taxRate"
                type="number"
                step="0.01"
                min="0"
                defaultValue={project.taxRate}
                className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-2">
            <DeleteProjectButton projectId={project.id} />
          </div>
        </AutoSaveForm>
      </div>

      {/* Rooms */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">Rooms &amp; measurements</h2>
          {project.rooms.length > 0 && (
            <span className="text-xs text-foreground-soft">
              {project.rooms.length} room{project.rooms.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {project.rooms.length === 0 ? (
          <p className="text-sm text-foreground-soft italic mb-3">
            Add rooms below to capture measurements as you walk the jobsite.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            {project.rooms.map((room) => (
              <RoomCard key={room.id} projectId={project.id} room={room} />
            ))}
          </div>
        )}

        <form
          action={addRoom.bind(null, project.id)}
          className="flex gap-2 items-center"
        >
          <input
            name="name"
            placeholder="Room name (e.g. Kitchen, Master bath)"
            className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-surface border border-border text-foreground rounded-lg text-sm font-medium hover:bg-accent-soft hover:border-accent"
          >
            + Room
          </button>
        </form>
      </section>

      {/* Sections */}
      <section>
        <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-foreground">Estimate</h2>
          <RefreshPricesButton
            refreshableCount={refreshableCount}
            totalLinked={linkedLineItems.length}
            action={refreshPricesFromCatalog.bind(null, project.id)}
          />
        </div>

        <div className="space-y-4">
          {project.sections.length === 0 ? (
            <p className="text-sm text-foreground-soft italic px-1">
              Add a section below to start your estimate (e.g. &ldquo;Demo&rdquo;, &ldquo;Plumbing&rdquo;,
              &ldquo;Finish carpentry&rdquo;).
            </p>
          ) : (
            project.sections.map((section, sectionIdx) => {
              const sectionTotal = section.lineItems.reduce(
                (sum, li) => sum + lineItemTotal(li),
                0,
              )
              const isFirst = sectionIdx === 0
              const isLast = sectionIdx === project.sections.length - 1
              return (
                <div
                  key={section.id}
                  className="bg-surface border border-border rounded-lg"
                >
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-muted rounded-t-lg">
                    <ReorderButtons
                      moveAction={moveSection.bind(null, project.id, section.id)}
                      isFirst={isFirst}
                      isLast={isLast}
                    />
                    <AutoSaveForm
                      action={renameSection.bind(null, project.id, section.id)}
                      className="flex-1"
                    >
                      <input
                        name="name"
                        defaultValue={section.name}
                        className="w-full font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none"
                      />
                    </AutoSaveForm>
                    <span className="text-sm font-medium text-foreground tabular-nums">
                      {formatCurrency(sectionTotal)}
                    </span>
                    <form action={deleteSection.bind(null, project.id, section.id)}>
                      <button
                        type="submit"
                        className="text-xs text-foreground-soft hover:text-danger transition-colors"
                        title="Delete section"
                      >
                        ✕
                      </button>
                    </form>
                  </div>

                  {section.lineItems.length > 0 && (
                    <div className="divide-y divide-border">
                      {section.lineItems.map((item, itemIdx) => (
                        <LineItemRow
                          key={item.id}
                          projectId={project.id}
                          item={item}
                          isFirst={itemIdx === 0}
                          isLast={itemIdx === section.lineItems.length - 1}
                        />
                      ))}
                    </div>
                  )}

                  <AddLineItemForm
                    action={addLineItem.bind(null, project.id, section.id)}
                    catalog={catalog}
                  />
                </div>
              )
            })
          )}

          {/* Add section */}
          <form
            action={addSection.bind(null, project.id)}
            className="flex gap-2 items-center"
          >
            <input
              name="name"
              placeholder="Section name (e.g. Demo, Plumbing)"
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-surface border border-border text-foreground rounded-lg text-sm font-medium hover:bg-accent-soft hover:border-accent"
            >
              + Section
            </button>
          </form>
        </div>
      </section>

      {/* Sticky totals */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-10 shadow-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <div>
            <p className="text-xs text-foreground-soft">Materials</p>
            <p className="font-medium tabular-nums text-foreground">{formatCurrency(totals.materialSubtotal)}</p>
          </div>
          <div>
            <p className="text-xs text-foreground-soft">Labor</p>
            <p className="font-medium tabular-nums text-foreground">{formatCurrency(totals.laborSubtotal)}</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs text-foreground-soft">Markup ({project.markupPct}%)</p>
            <p className="font-medium tabular-nums text-foreground">{formatCurrency(totals.markup)}</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs text-foreground-soft">Tax ({project.taxRate}%)</p>
            <p className="font-medium tabular-nums text-foreground">{formatCurrency(totals.tax)}</p>
          </div>
          <div className="col-span-2 sm:col-span-1 text-right">
            <p className="text-xs text-foreground-soft">Total</p>
            <p className="text-lg font-bold tabular-nums text-accent">{formatCurrency(totals.total)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoomCard({
  projectId,
  room,
}: {
  projectId: string
  room: {
    id: string
    name: string
    lengthFt: number | null
    widthFt: number | null
    heightFt: number
    notes: string | null
  }
}) {
  const metrics = roomMetrics(room)
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <AutoSaveForm
        action={updateRoom.bind(null, projectId, room.id)}
        className="space-y-3"
      >
        <div className="flex items-center gap-2">
          <input
            name="name"
            defaultValue={room.name}
            className="flex-1 font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none py-0.5"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <LabeledInput
            name="lengthFt"
            label="Length (ft)"
            defaultValue={room.lengthFt ?? ""}
          />
          <LabeledInput
            name="widthFt"
            label="Width (ft)"
            defaultValue={room.widthFt ?? ""}
          />
          <LabeledInput
            name="heightFt"
            label="Height (ft)"
            defaultValue={room.heightFt}
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium text-foreground-soft uppercase tracking-wider mb-1">
            Notes
          </label>
          <textarea
            name="notes"
            defaultValue={room.notes ?? ""}
            rows={2}
            placeholder="e.g. 10ft east wall has 3x4 window; tile floor in good shape"
            className="w-full text-xs text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
        </div>

        {(metrics.floorAreaSqft || metrics.perimeterFt) && (
          <dl className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-xs">
            <div>
              <dt className="text-foreground-soft">Floor</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {metrics.floorAreaSqft ? `${metrics.floorAreaSqft} sqft` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-foreground-soft">Perimeter</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {metrics.perimeterFt ? `${metrics.perimeterFt} lf` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-foreground-soft">Walls</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {metrics.wallAreaSqft ? `${metrics.wallAreaSqft} sqft` : "—"}
              </dd>
            </div>
          </dl>
        )}
      </AutoSaveForm>
      <form
        action={deleteRoom.bind(null, projectId, room.id)}
        className="mt-2 pt-2 border-t border-border flex justify-end"
      >
        <button
          type="submit"
          className="text-[11px] text-foreground-soft hover:text-danger transition-colors"
        >
          Remove room
        </button>
      </form>
    </div>
  )
}

function LabeledInput({
  name,
  label,
  defaultValue,
}: {
  name: string
  label: string
  defaultValue: string | number
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-foreground-soft uppercase tracking-wider mb-0.5">
        {label}
      </label>
      <input
        name={name}
        type="number"
        step="0.1"
        min="0"
        defaultValue={defaultValue}
        className="w-full text-sm text-foreground border border-border rounded px-2 py-1 bg-surface focus:outline-none focus:ring-1 focus:ring-accent tabular-nums"
      />
    </div>
  )
}

function LineItemRow({
  projectId,
  item,
  isFirst,
  isLast,
}: {
  projectId: string
  item: {
    id: string
    description: string
    quantity: number
    unit: string
    unitPrice: number
    kind: string
  }
  isFirst: boolean
  isLast: boolean
}) {
  const total = lineItemTotal(item)
  return (
    <div className="px-4 py-2 hover:bg-surface-muted transition-colors group">
      <div className="grid grid-cols-12 gap-2 items-center text-sm">
        <div className="col-span-1 flex items-center">
          <ReorderButtons
            moveAction={moveLineItem.bind(null, projectId, item.id)}
            isFirst={isFirst}
            isLast={isLast}
          />
        </div>
        <AutoSaveForm
          action={updateLineItem.bind(null, projectId, item.id)}
          className="col-span-10 grid grid-cols-12 gap-2 items-center"
        >
          <div className="col-span-12 sm:col-span-5">
            <input
              name="description"
              defaultValue={item.description}
              className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 text-foreground"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <input
              name="quantity"
              type="number"
              step="0.01"
              defaultValue={item.quantity}
              className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 tabular-nums text-foreground"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
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
          <div className="col-span-3 sm:col-span-1">
            <select
              name="kind"
              defaultValue={item.kind}
              className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none px-1 py-0.5 -mx-1 text-foreground"
            >
              <option value="material">M</option>
              <option value="labor">L</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-2 text-right text-foreground tabular-nums font-medium">
            {formatCurrency(total)}
          </div>
        </AutoSaveForm>
        <div className="col-span-1 flex justify-end">
          <form action={deleteLineItem.bind(null, projectId, item.id)}>
            <button
              type="submit"
              className="text-xs text-foreground-soft opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
              title="Delete line item"
            >
              ✕
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function ReorderButtons({
  moveAction,
  isFirst,
  isLast,
}: {
  moveAction: (direction: "up" | "down") => Promise<void>
  isFirst: boolean
  isLast: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <form action={moveAction.bind(null, "up")}>
        <button
          type="submit"
          disabled={isFirst}
          className="block text-xs text-foreground-soft hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed leading-none"
          title="Move up"
        >
          ▲
        </button>
      </form>
      <form action={moveAction.bind(null, "down")}>
        <button
          type="submit"
          disabled={isLast}
          className="block text-xs text-foreground-soft hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed leading-none"
          title="Move down"
        >
          ▼
        </button>
      </form>
    </div>
  )
}

function DeleteProjectButton({ projectId }: { projectId: string }) {
  return (
    <form action={deleteProject.bind(null, projectId)}>
      <button
        type="submit"
        className="text-xs text-foreground-soft hover:text-danger transition-colors"
      >
        Delete project
      </button>
    </form>
  )
}
