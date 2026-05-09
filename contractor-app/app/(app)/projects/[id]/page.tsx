import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { calcEstimate, formatCurrency, lineItemTotal } from "@/lib/calc"
import { roomMetrics } from "@/lib/room"
import { archiveProject, deleteProject, duplicateProject } from "../actions"
import {
  addSection,
  addLineItem,
  applyServicePresets,
  deleteSection,
  deleteLineItem,
  refreshPricesFromCatalog,
  renameSection,
  reorderLineItems,
  reorderSections,
  updateLineItem,
  updateProjectMeta,
} from "./actions"
import { addRoom, updateRoom, deleteRoom } from "./room-actions"
import { uploadPhoto, deletePhoto, updatePhotoCaption } from "./photo-actions"
import { AutoSaveForm } from "./auto-form"
import { AddLineItemForm } from "./catalog-picker"
import { CatalogEmptyBanner } from "./catalog-empty-banner"
import { loadDefaultCatalog } from "../../catalog/actions"
import { ProjectSubsSection } from "./project-subs-section"
import {
  addSubToProject,
  quickCreateSubAndAssign,
  updateProjectSubcontractor,
  removeProjectSubcontractor,
  rateSubOnProject,
  assignSubToService,
  unassignSubFromService,
  toggleServiceComplete,
} from "./sub-actions"
import { LineItemSubChips } from "./line-item-sub-chips"
import { addPayment as logSubPayment } from "../../subs/payment-actions"
import { ServicesPicker } from "./services-picker"
import { RefreshPricesButton } from "./refresh-prices-button"
import { PhotoGallery } from "./photo-gallery"
import { SortableList, DraggableRow } from "./sortable"

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
          include: {
            lineItems: {
              orderBy: { order: "asc" },
              include: {
                assignedSubs: {
                  include: {
                    subcontractor: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        rooms: { orderBy: { order: "asc" } },
        photos: { orderBy: { order: "asc" } },
        receipts: {
          orderBy: { purchasedAt: "desc" },
          include: { items: true },
        },
        subcontractors: {
          orderBy: { createdAt: "desc" },
          include: {
            subcontractor: {
              select: { id: true, name: true, contactName: true },
            },
          },
        },
        subcontractorPayments: {
          select: { amount: true, projectId: true, subcontractorId: true },
        },
        subcontractorRatings: {
          select: { subcontractorId: true },
        },
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
  const sectionIds = project.sections.map((s) => s.id)

  const catalogIsEmpty = catalog.length === 0

  // Subcontractors data
  const subAssignments = project.subcontractors.map((a) => {
    const paidToDate = project.subcontractorPayments
      .filter(
        (p) =>
          p.subcontractorId === a.subcontractorId && p.projectId === project.id,
      )
      .reduce((sum, p) => sum + p.amount, 0)
    const rated = project.subcontractorRatings.some(
      (r) => r.subcontractorId === a.subcontractorId,
    )
    return {
      id: a.id,
      scope: a.scope,
      agreedAmount: a.agreedAmount,
      hourlyRate: a.hourlyRate,
      status: a.status,
      notes: a.notes,
      startDate: a.startDate,
      endDate: a.endDate,
      paidToDate,
      rated,
      subcontractor: a.subcontractor,
    }
  })

  const availableSubs = await prisma.subcontractor.findMany({
    where: { userId: user.id, archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, contactName: true },
  })

  // Rating prompt is on once the project clearly wraps up.
  const canRate = ["accepted", "won", "done"].includes(project.status)

  return (
    <div className="space-y-6 pb-32">
      {/* Back link + page actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/projects" className="text-sm text-foreground-muted hover:text-foreground">
          ← All projects
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/projects/${project.id}/materials`}
            className="px-3 py-1.5 bg-surface border border-border rounded-md text-foreground-muted hover:bg-accent-soft hover:text-foreground hover:border-accent transition-colors"
          >
            📋 Material list
          </Link>
          <Link
            href={`/projects/${project.id}/proposal`}
            className="px-3 py-1.5 bg-accent text-white rounded-md font-medium hover:bg-accent-hover transition-colors"
          >
            📄 Proposal
          </Link>
        </div>
      </div>

      {catalogIsEmpty && <CatalogEmptyBanner loadAction={loadDefaultCatalog} />}

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
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-foreground-muted mb-1">
                Project notes
              </label>
              <textarea
                name="notes"
                defaultValue={project.notes ?? ""}
                rows={3}
                placeholder="Free-form jobsite notes — site access, key contacts, gotchas, scheduling notes…"
                className="w-full text-sm text-foreground border border-border rounded px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-accent resize-y"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border flex-wrap gap-2">
            <div className="flex items-center gap-3 text-xs">
              <form action={duplicateProject.bind(null, project.id)}>
                <button
                  type="submit"
                  className="text-foreground-muted hover:text-foreground transition-colors"
                  title="Create a copy of this project"
                >
                  ⎘ Duplicate
                </button>
              </form>
              <span className="text-foreground-soft">·</span>
              <form action={archiveProject.bind(null, project.id)}>
                <button
                  type="submit"
                  className="text-foreground-muted hover:text-foreground transition-colors"
                  title="Hide from main dashboard, keep data"
                >
                  📦 Archive
                </button>
              </form>
            </div>
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

        <form action={addRoom.bind(null, project.id)} className="flex gap-2 items-center">
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

      {/* Photos */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">Photos</h2>
          {project.photos.length > 0 && (
            <span className="text-xs text-foreground-soft">
              {project.photos.length} photo{project.photos.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <PhotoGallery
          photos={project.photos.map((p) => ({
            id: p.id,
            url: p.url,
            filename: p.filename,
            caption: p.caption,
            size: p.size,
            width: p.width,
            height: p.height,
          }))}
          uploadAction={uploadPhoto.bind(null, project.id)}
          deleteAction={deletePhoto.bind(null, project.id)}
          updateCaptionAction={updatePhotoCaption.bind(null, project.id)}
        />
      </section>

      {/* Subcontractors on this project */}
      <section>
        <ProjectSubsSection
          projectId={project.id}
          assignments={subAssignments}
          availableSubs={availableSubs}
          canRate={canRate}
          addAction={addSubToProject.bind(null, project.id)}
          quickCreateAction={quickCreateSubAndAssign.bind(null, project.id)}
          updateAction={updateProjectSubcontractor.bind(null, project.id)}
          removeAction={removeProjectSubcontractor.bind(null, project.id)}
          rateAction={rateSubOnProject.bind(null, project.id)}
          logPaymentAction={logSubPayment}
        />
      </section>

      {/* Receipts / actuals */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">Receipts &amp; actuals</h2>
          {project.receipts.length > 0 && (
            <span className="text-xs text-foreground-soft tabular-nums">
              {project.receipts.length} receipt{project.receipts.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {project.receipts.length === 0 ? (
          <p className="text-sm text-foreground-soft italic mb-3">
            No receipts attached yet.{" "}
            <Link href="/receipts" className="text-accent hover:underline">
              Upload from Receipts →
            </Link>
          </p>
        ) : (
          (() => {
            const actualsTotal = project.receipts.reduce(
              (sum, r) => sum + (r.total ?? 0),
              0,
            )
            const variance = actualsTotal - totals.materialSubtotal
            return (
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <ul className="divide-y divide-border">
                  {project.receipts.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/receipts/${r.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-muted transition-colors"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.imageUrl}
                          alt={r.filename}
                          className="w-10 h-10 object-cover rounded border border-border shrink-0"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground truncate">
                            {r.vendor ?? r.filename}
                          </p>
                          <p className="text-xs text-foreground-soft">
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
                            {r.items.length > 0 && ` · ${r.items.length} item${r.items.length === 1 ? "" : "s"}`}
                          </p>
                        </div>
                        <p className="text-sm font-medium tabular-nums text-foreground shrink-0">
                          {r.total != null ? formatCurrency(r.total) : "—"}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="px-4 py-2 bg-surface-muted border-t border-border grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-foreground-soft">Estimated materials</p>
                    <p className="font-medium tabular-nums text-foreground">
                      {formatCurrency(totals.materialSubtotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-foreground-soft">Receipts total</p>
                    <p className="font-medium tabular-nums text-foreground">
                      {formatCurrency(actualsTotal)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-foreground-soft">Variance</p>
                    <p
                      className={`font-medium tabular-nums ${
                        variance > 0 ? "text-danger" : variance < 0 ? "text-success" : "text-foreground"
                      }`}
                    >
                      {variance > 0 ? "+" : ""}
                      {formatCurrency(variance)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })()
        )}
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

        {project.sections.length === 0 ? (
          <p className="text-sm text-foreground-soft italic px-1 mb-3">
            Add a section below to start your estimate (e.g. &ldquo;Demo&rdquo;,
            &ldquo;Plumbing&rdquo;, &ldquo;Finish carpentry&rdquo;).
          </p>
        ) : (
          <SortableList
            ids={sectionIds}
            onReorder={reorderSections.bind(null, project.id)}
            className="space-y-4"
          >
            {project.sections.map((section) => {
              const sectionTotal = section.lineItems.reduce(
                (sum, li) => sum + lineItemTotal(li),
                0,
              )
              const services = section.lineItems.filter((li) => li.kind === "labor")
              const materials = section.lineItems.filter((li) => li.kind === "material")
              const servicesTotal = services.reduce(
                (sum, li) => sum + lineItemTotal(li),
                0,
              )
              const materialsTotal = materials.reduce(
                (sum, li) => sum + lineItemTotal(li),
                0,
              )
              return (
                <DraggableRow key={section.id} id={section.id} handlePosition="absolute">
                  <div className="bg-surface border border-border rounded-lg">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-muted rounded-t-lg">
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

                    {/* Services sub-table */}
                    <div className="border-b border-border">
                      <div className="flex items-baseline justify-between px-4 py-1.5 bg-surface-muted/40">
                        <span className="text-[10px] uppercase tracking-wider text-foreground-soft font-medium">
                          Services
                        </span>
                        {services.length > 0 && (
                          <span className="text-[10px] text-foreground-soft tabular-nums">
                            {formatCurrency(servicesTotal)}
                          </span>
                        )}
                      </div>
                      {services.length > 0 && (
                        <SortableList
                          ids={services.map((li) => li.id)}
                          onReorder={reorderLineItems.bind(null, project.id, section.id)}
                          className="divide-y divide-border"
                        >
                          {services.map((item) => (
                            <DraggableRow
                              key={item.id}
                              id={item.id}
                              handlePosition="leading"
                            >
                              <div>
                                <LineItemRow projectId={project.id} item={item} />
                                <LineItemSubChips
                                  projectId={project.id}
                                  lineItemId={item.id}
                                  completedAt={item.completedAt}
                                  assignments={item.assignedSubs.map((a) => ({
                                    subId: a.subcontractor.id,
                                    name: a.subcontractor.name,
                                  }))}
                                  availableSubs={availableSubs}
                                  assignAction={assignSubToService.bind(
                                    null,
                                    project.id,
                                  )}
                                  unassignAction={unassignSubFromService.bind(
                                    null,
                                    project.id,
                                  )}
                                  toggleCompleteAction={toggleServiceComplete.bind(
                                    null,
                                    project.id,
                                  )}
                                />
                              </div>
                            </DraggableRow>
                          ))}
                        </SortableList>
                      )}
                      <ServicesPicker
                        catalog={catalog}
                        addAction={addLineItem.bind(null, project.id, section.id)}
                        applyPresetsAction={applyServicePresets.bind(
                          null,
                          project.id,
                          section.id,
                        )}
                      />
                    </div>

                    {/* Materials sub-table */}
                    <div>
                      <div className="flex items-baseline justify-between px-4 py-1.5 bg-surface-muted/40">
                        <span className="text-[10px] uppercase tracking-wider text-foreground-soft font-medium">
                          Materials
                        </span>
                        {materials.length > 0 && (
                          <span className="text-[10px] text-foreground-soft tabular-nums">
                            {formatCurrency(materialsTotal)}
                          </span>
                        )}
                      </div>
                      {materials.length > 0 && (
                        <SortableList
                          ids={materials.map((li) => li.id)}
                          onReorder={reorderLineItems.bind(null, project.id, section.id)}
                          className="divide-y divide-border"
                        >
                          {materials.map((item) => (
                            <DraggableRow
                              key={item.id}
                              id={item.id}
                              handlePosition="leading"
                            >
                              <LineItemRow projectId={project.id} item={item} />
                            </DraggableRow>
                          ))}
                        </SortableList>
                      )}
                      <AddLineItemForm
                        action={addLineItem.bind(null, project.id, section.id)}
                        catalog={catalog}
                        lockKind="material"
                      />
                    </div>
                  </div>
                </DraggableRow>
              )
            })}
          </SortableList>
        )}

        {/* Add section */}
        <form
          action={addSection.bind(null, project.id)}
          className="flex gap-2 items-center mt-4"
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
      </section>

      {/* Sticky totals */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-10 shadow-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <div>
            <p className="text-xs text-foreground-soft">Materials</p>
            <p className="font-medium tabular-nums text-foreground">
              {formatCurrency(totals.materialSubtotal)}
            </p>
          </div>
          <div>
            <p className="text-xs text-foreground-soft">Labor</p>
            <p className="font-medium tabular-nums text-foreground">
              {formatCurrency(totals.laborSubtotal)}
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs text-foreground-soft">Markup ({project.markupPct}%)</p>
            <p className="font-medium tabular-nums text-foreground">
              {formatCurrency(totals.markup)}
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs text-foreground-soft">Tax ({project.taxRate}%)</p>
            <p className="font-medium tabular-nums text-foreground">{formatCurrency(totals.tax)}</p>
          </div>
          <div className="col-span-2 sm:col-span-1 text-right">
            <p className="text-xs text-foreground-soft">Total</p>
            <p className="text-lg font-bold tabular-nums text-accent">
              {formatCurrency(totals.total)}
            </p>
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
      <AutoSaveForm action={updateRoom.bind(null, projectId, room.id)} className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            name="name"
            defaultValue={room.name}
            className="flex-1 font-semibold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none py-0.5"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <LabeledInput name="lengthFt" label="Length (ft)" defaultValue={room.lengthFt ?? ""} />
          <LabeledInput name="widthFt" label="Width (ft)" defaultValue={room.widthFt ?? ""} />
          <LabeledInput name="heightFt" label="Height (ft)" defaultValue={room.heightFt} />
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
}) {
  const total = lineItemTotal(item)
  return (
    <div className="px-2 py-2 hover:bg-surface-muted transition-colors group">
      <div className="grid grid-cols-12 gap-2 items-center text-sm">
        <AutoSaveForm
          action={updateLineItem.bind(null, projectId, item.id)}
          className="col-span-11 grid grid-cols-12 gap-2 items-center"
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
              title="Service rolls up to Services sub-table; Material rolls up to Materials sub-table"
            >
              <option value="material">Material</option>
              <option value="labor">Service</option>
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
