import Link from "next/link"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { calcEstimate, formatCurrency } from "@/lib/calc"
import { StatusBadge } from "@/components/ui/status-badge"
import { TabPillLink } from "@/components/ui/tab-pill"
import { ConfirmSubmitButton } from "../confirm-submit-button"
import { createFromTemplate, deleteTemplate } from "./actions"

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const sp = await searchParams
  const view =
    sp?.view === "archived" ? "archived" : sp?.view === "templates" ? "templates" : "active"
  const showArchived = view === "archived"
  const showTemplates = view === "templates"

  const session = await auth()
  const user = session?.user?.email
    ? await prisma.user.findUnique({ where: { email: session.user.email } })
    : null

  const projects = user
    ? await prisma.project.findMany({
        where: showTemplates
          ? { userId: user.id, isTemplate: true }
          : { userId: user.id, archived: showArchived, isTemplate: false },
        orderBy: { updatedAt: "desc" },
        include: {
          sections: { include: { lineItems: true } },
        },
      })
    : []

  const [archivedCount, templateCount] = user
    ? await Promise.all([
        prisma.project.count({
          where: { userId: user.id, archived: true, isTemplate: false },
        }),
        prisma.project.count({ where: { userId: user.id, isTemplate: true } }),
      ])
    : [0, 0]

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold text-foreground">
          {showArchived ? "Archived projects" : showTemplates ? "Templates" : "Projects"}
        </h1>
        {view === "active" && (
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            <span>+</span> New Project
          </Link>
        )}
      </div>

      {/* Filter pills — same dialect as Receipts / Subs / Catalog. */}
      <div className="flex items-center gap-2 mb-6">
        <TabPillLink href="/projects" active={view === "active"}>
          Active
        </TabPillLink>
        <TabPillLink href="/projects?view=templates" active={showTemplates}>
          Templates
          {templateCount > 0 && (
            <span className="opacity-60 tabular-nums">({templateCount})</span>
          )}
        </TabPillLink>
        <TabPillLink href="/projects?view=archived" active={showArchived}>
          Archived
          {archivedCount > 0 && (
            <span className="opacity-60 tabular-nums">({archivedCount})</span>
          )}
        </TabPillLink>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16 px-4 bg-surface border border-border rounded-lg">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-accent-soft rounded-2xl mb-4">
            <span className="text-3xl">{showArchived ? "📦" : "📋"}</span>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {showArchived
              ? "No archived projects"
              : showTemplates
                ? "No templates yet"
                : "No projects yet"}
          </h2>
          <p className="text-sm text-foreground-muted max-w-xs mx-auto mb-6">
            {showArchived
              ? "Projects you archive will show up here."
              : showTemplates
                ? "Open any project and click “Save as template” to reuse its sections and line items on future jobs."
                : "Create your first project to start building an estimate."}
          </p>
          {!showArchived && !showTemplates && (
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              <span>+</span> New Project
            </Link>
          )}
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

            return (
              <li key={project.id}>
                <div className="flex items-center justify-between px-4 py-4 hover:bg-surface-muted transition-colors gap-3">
                  <Link href={`/projects/${project.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium text-foreground truncate">{project.name}</p>
                      {showTemplates ? (
                        <StatusBadge status="draft" label="Template" className="uppercase tracking-wider" />
                      ) : (
                        <StatusBadge status={project.status} className="uppercase tracking-wider" />
                      )}
                    </div>
                    <p className="text-sm text-foreground-muted truncate">
                      {showTemplates
                        ? `${project.sections.length} section${project.sections.length === 1 ? "" : "s"}`
                        : project.clientName ?? "No client"}
                      {itemCount > 0 && ` · ${itemCount} item${itemCount === 1 ? "" : "s"}`}
                    </p>
                  </Link>
                  <div className="ml-2 text-right shrink-0 flex items-center gap-3">
                    <p className="font-semibold text-foreground tabular-nums">{formatCurrency(total)}</p>
                    {showTemplates && (
                      <>
                        <form action={createFromTemplate.bind(null, project.id)}>
                          <button
                            type="submit"
                            className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover"
                          >
                            Use →
                          </button>
                        </form>
                        <form action={deleteTemplate.bind(null, project.id)}>
                          <ConfirmSubmitButton
                            confirmText={`Delete template "${project.name}"?`}
                            className="text-xs text-foreground-soft hover:text-danger"
                          >
                            ✕
                          </ConfirmSubmitButton>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
