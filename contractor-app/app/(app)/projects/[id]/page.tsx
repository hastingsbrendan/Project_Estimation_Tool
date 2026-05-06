import Link from "next/link"
import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { calcEstimate, formatCurrency, lineItemTotal } from "@/lib/calc"
import { deleteProject } from "../actions"
import {
  addSection,
  addLineItem,
  deleteSection,
  deleteLineItem,
  renameSection,
  updateLineItem,
  updateProjectMeta,
} from "./actions"

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

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: { lineItems: { orderBy: { order: "asc" } } },
      },
    },
  })
  if (!project) notFound()

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

  return (
    <div className="space-y-6 pb-24">
      {/* Back link */}
      <div>
        <Link href="/projects" className="text-sm text-gray-500 hover:text-gray-900">
          ← All projects
        </Link>
      </div>

      {/* Project meta */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <form action={updateProjectMeta.bind(null, project.id)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Project name
            </label>
            <input
              name="name"
              defaultValue={project.name}
              className="w-full text-xl font-bold text-gray-900 border-b border-transparent hover:border-gray-200 focus:border-gray-900 focus:outline-none py-1 -mx-1 px-1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Client</label>
              <input
                name="clientName"
                defaultValue={project.clientName ?? ""}
                placeholder="Client name"
                className="w-full text-sm text-gray-900 border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Client email</label>
              <input
                name="clientEmail"
                type="email"
                defaultValue={project.clientEmail ?? ""}
                placeholder="email@example.com"
                className="w-full text-sm text-gray-900 border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
              <input
                name="address"
                defaultValue={project.address ?? ""}
                placeholder="Job site address"
                className="w-full text-sm text-gray-900 border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Markup %</label>
              <input
                name="markupPct"
                type="number"
                step="0.1"
                min="0"
                defaultValue={project.markupPct}
                className="w-full text-sm text-gray-900 border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Sales tax % (materials)
              </label>
              <input
                name="taxRate"
                type="number"
                step="0.01"
                min="0"
                defaultValue={project.taxRate}
                className="w-full text-sm text-gray-900 border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="submit"
              className="px-3 py-1.5 bg-gray-900 text-white rounded text-sm font-medium hover:bg-gray-800"
            >
              Save details
            </button>
            <DeleteProjectButton projectId={project.id} />
          </div>
        </form>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {project.sections.length === 0 ? (
          <p className="text-sm text-gray-500 italic px-1">
            Add a section below to start your estimate (e.g. &ldquo;Demo&rdquo;, &ldquo;Plumbing&rdquo;,
            &ldquo;Finish carpentry&rdquo;).
          </p>
        ) : (
          project.sections.map((section) => {
            const sectionTotal = section.lineItems.reduce(
              (sum, li) => sum + lineItemTotal(li),
              0,
            )
            return (
              <div
                key={section.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden"
              >
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <form
                    action={renameSection.bind(null, project.id, section.id)}
                    className="flex-1"
                  >
                    <input
                      name="name"
                      defaultValue={section.name}
                      className="w-full font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-gray-900 focus:outline-none"
                    />
                  </form>
                  <span className="text-sm font-medium text-gray-700 tabular-nums">
                    {formatCurrency(sectionTotal)}
                  </span>
                  <form action={deleteSection.bind(null, project.id, section.id)}>
                    <button
                      type="submit"
                      className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete section"
                    >
                      ✕
                    </button>
                  </form>
                </div>

                {/* Line items */}
                {section.lineItems.length > 0 && (
                  <div className="divide-y divide-gray-100">
                    {section.lineItems.map((item) => (
                      <LineItemRow
                        key={item.id}
                        projectId={project.id}
                        item={item}
                      />
                    ))}
                  </div>
                )}

                {/* Add line item form */}
                <form
                  action={addLineItem.bind(null, project.id, section.id)}
                  className="px-4 py-3 border-t border-gray-100 bg-gray-50/50"
                >
                  <div className="grid grid-cols-12 gap-2 items-end text-sm">
                    <div className="col-span-12 sm:col-span-5">
                      <label className="block text-xs text-gray-500 mb-0.5">Description</label>
                      <input
                        name="description"
                        required
                        placeholder="e.g. 2x4 stud, 8ft"
                        className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <label className="block text-xs text-gray-500 mb-0.5">Qty</label>
                      <input
                        name="quantity"
                        type="number"
                        step="0.01"
                        defaultValue="1"
                        className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <label className="block text-xs text-gray-500 mb-0.5">Unit</label>
                      <input
                        name="unit"
                        defaultValue="ea"
                        className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-0.5">Unit $</label>
                      <input
                        name="unitPrice"
                        type="number"
                        step="0.01"
                        defaultValue="0"
                        className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-0.5">Type</label>
                      <select
                        name="kind"
                        defaultValue="material"
                        className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      >
                        <option value="material">Material</option>
                        <option value="labor">Labor</option>
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-1">
                      <button
                        type="submit"
                        className="w-full px-2 py-1 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-800"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </form>
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
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            + Section
          </button>
        </form>
      </div>

      {/* Sticky totals */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-500">Materials</p>
            <p className="font-medium tabular-nums">{formatCurrency(totals.materialSubtotal)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Labor</p>
            <p className="font-medium tabular-nums">{formatCurrency(totals.laborSubtotal)}</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs text-gray-500">Markup ({project.markupPct}%)</p>
            <p className="font-medium tabular-nums">{formatCurrency(totals.markup)}</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs text-gray-500">Tax ({project.taxRate}%)</p>
            <p className="font-medium tabular-nums">{formatCurrency(totals.tax)}</p>
          </div>
          <div className="col-span-2 sm:col-span-1 text-right">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(totals.total)}</p>
          </div>
        </div>
      </div>
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
    <div className="px-4 py-2 hover:bg-gray-50 transition-colors">
      <form
        action={updateLineItem.bind(null, projectId, item.id)}
        className="grid grid-cols-12 gap-2 items-center text-sm"
      >
        <div className="col-span-12 sm:col-span-5">
          <input
            name="description"
            defaultValue={item.description}
            className="w-full border-b border-transparent hover:border-gray-200 focus:border-gray-900 focus:outline-none px-1 py-0.5 -mx-1"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <input
            name="quantity"
            type="number"
            step="0.01"
            defaultValue={item.quantity}
            className="w-full border-b border-transparent hover:border-gray-200 focus:border-gray-900 focus:outline-none px-1 py-0.5 -mx-1 tabular-nums"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <input
            name="unit"
            defaultValue={item.unit}
            className="w-full border-b border-transparent hover:border-gray-200 focus:border-gray-900 focus:outline-none px-1 py-0.5 -mx-1"
          />
        </div>
        <div className="col-span-3 sm:col-span-2">
          <input
            name="unitPrice"
            type="number"
            step="0.01"
            defaultValue={item.unitPrice}
            className="w-full border-b border-transparent hover:border-gray-200 focus:border-gray-900 focus:outline-none px-1 py-0.5 -mx-1 tabular-nums"
          />
        </div>
        <div className="col-span-3 sm:col-span-1">
          <select
            name="kind"
            defaultValue={item.kind}
            className="w-full border-b border-transparent hover:border-gray-200 focus:border-gray-900 focus:outline-none px-1 py-0.5 -mx-1 bg-transparent"
          >
            <option value="material">M</option>
            <option value="labor">L</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1 text-right text-gray-700 tabular-nums font-medium">
          {formatCurrency(total)}
        </div>
        <div className="col-span-12 sm:col-span-1 flex justify-end gap-2">
          <button
            type="submit"
            className="text-xs text-gray-400 hover:text-gray-900 transition-colors"
            title="Save"
          >
            Save
          </button>
        </div>
      </form>
      <form
        action={deleteLineItem.bind(null, projectId, item.id)}
        className="flex justify-end -mt-6 pointer-events-none"
      >
        <button
          type="submit"
          className="text-xs text-gray-300 hover:text-red-600 transition-colors pointer-events-auto"
          title="Delete"
        >
          ✕
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
        className="text-xs text-gray-400 hover:text-red-600 transition-colors"
      >
        Delete project
      </button>
    </form>
  )
}
