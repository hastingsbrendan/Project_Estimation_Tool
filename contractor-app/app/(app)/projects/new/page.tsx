import Link from "next/link"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { createProject, createFromTemplate } from "../actions"

export default async function NewProjectPage() {
  const session = await auth()
  const user = session?.user?.email
    ? await prisma.user.findUnique({ where: { email: session.user.email } })
    : null
  const templates = user
    ? await prisma.project.findMany({
        where: { userId: user.id, isTemplate: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          sections: { select: { _count: { select: { lineItems: true } } } },
        },
      })
    : []

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <Link href="/projects" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to projects
        </Link>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-1">New Project</h1>
      <p className="text-sm text-gray-500 mb-6">Start a new estimate. You can edit anything later.</p>

      {templates.length > 0 && (
        <div className="mb-6 bg-accent-soft/40 border border-accent rounded-lg p-4">
          <p className="text-sm font-medium text-foreground mb-2">
            ⚡ Start from a template
          </p>
          <ul className="space-y-1.5">
            {templates.map((t) => {
              const itemCount = t.sections.reduce(
                (sum, s) => sum + s._count.lineItems,
                0,
              )
              return (
                <li key={t.id}>
                  <form action={createFromTemplate.bind(null, t.id)}>
                    <button
                      type="submit"
                      className="w-full text-left px-3 py-2 bg-surface border border-border rounded-md text-sm hover:border-accent transition-colors flex items-center justify-between gap-2"
                    >
                      <span className="text-foreground truncate">{t.name}</span>
                      <span className="text-xs text-foreground-soft tabular-nums shrink-0">
                        {t.sections.length} section{t.sections.length === 1 ? "" : "s"} ·{" "}
                        {itemCount} item{itemCount === 1 ? "" : "s"} →
                      </span>
                    </button>
                  </form>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-foreground-soft mt-2">
            Sections, line items, and rooms are copied; you fill in the client below
            or on the project page.
          </p>
        </div>
      )}

      <form action={createProject} className="space-y-4 bg-white border border-gray-200 rounded-lg p-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Project name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. Smith kitchen remodel"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="clientName" className="block text-sm font-medium text-gray-700 mb-1">
            Client name
          </label>
          <input
            id="clientName"
            name="clientName"
            type="text"
            placeholder="e.g. Jane Smith"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="clientEmail" className="block text-sm font-medium text-gray-700 mb-1">
            Client email
          </label>
          <input
            id="clientEmail"
            name="clientEmail"
            type="email"
            placeholder="jane@example.com"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
            Job site address
          </label>
          <input
            id="address"
            name="address"
            type="text"
            placeholder="123 Main St, Anytown, USA"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/projects"
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            Create project
          </button>
        </div>
      </form>
    </div>
  )
}
