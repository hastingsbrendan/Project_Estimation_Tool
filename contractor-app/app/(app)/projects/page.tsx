import Link from "next/link"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { calcEstimate, formatCurrency } from "@/lib/calc"

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-50 text-blue-700",
  accepted: "bg-green-50 text-green-700",
  won: "bg-green-100 text-green-800",
  rejected: "bg-red-50 text-red-700",
  lost: "bg-red-100 text-red-800",
}

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
        <h1 className="text-xl font-bold text-foreground">Projects</h1>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          <span>+</span> New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 px-4 bg-surface border border-border rounded-lg">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-soft rounded-2xl mb-4">
            <span className="text-3xl">📋</span>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">No projects yet</h2>
          <p className="text-sm text-foreground-muted max-w-xs mx-auto mb-6">
            Create your first project to start building an estimate.
          </p>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            <span>+</span> New Project
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-surface">
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
            const statusColor = STATUS_COLORS[project.status] ?? STATUS_COLORS.draft

            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center justify-between px-4 py-4 hover:bg-surface-muted transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-foreground truncate">{project.name}</p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider ${statusColor}`}>
                        {project.status}
                      </span>
                    </div>
                    <p className="text-sm text-foreground-muted truncate">
                      {project.clientName ?? "No client"}
                      {itemCount > 0 && ` · ${itemCount} item${itemCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="font-semibold text-foreground tabular-nums">{formatCurrency(total)}</p>
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
