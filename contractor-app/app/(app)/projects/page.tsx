import Link from "next/link"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { calcEstimate, formatCurrency } from "@/lib/calc"

export default async function ProjectsPage() {
  const session = await auth()
  const user = session?.user?.email
    ? await prisma.user.findUnique({ where: { email: session.user.email } })
    : null

  const projects = user
    ? await prisma.project.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        include: {
          sections: { include: { lineItems: true } },
        },
      })
    : []

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Projects</h1>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <span>+</span> New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-2xl mb-4">
            <span className="text-3xl">📋</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No projects yet</h2>
          <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
            Create your first project to start building an estimate.
          </p>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <span>+</span> New Project
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden bg-white">
          {projects.map((project) => {
            const lineItems = project.sections.flatMap((s) =>
              s.lineItems.map((li) => ({
                quantity: li.quantity,
                unitPrice: li.unitPrice,
                kind: li.kind as "material" | "labor",
              })),
            )
            const total = calcEstimate({
              lineItems,
              markupPct: project.markupPct,
              taxRate: project.taxRate,
            }).total
            const itemCount = lineItems.length

            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{project.name}</p>
                    <p className="text-sm text-gray-500 truncate">
                      {project.clientName ?? "No client"}
                      {itemCount > 0 && ` · ${itemCount} item${itemCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(total)}</p>
                    <p className="text-xs text-gray-500 capitalize">{project.status}</p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
