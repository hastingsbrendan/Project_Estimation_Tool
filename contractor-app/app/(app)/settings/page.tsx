import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { Card } from "@/components/ui/card"
import { AutoSaveForm } from "../projects/[id]/auto-form"
import { updateBusinessProfile, uploadLogo, removeLogo } from "./actions"
import { LogoUploader } from "./logo-uploader"

/**
 * Business settings — the identity that appears on every client-facing
 * surface (public proposal page, proposal / invoice / materials PDFs).
 * Previously hardcoded via CONTRACTOR_* env vars; this page makes the
 * app usable by anyone, not just the original deployment.
 */
export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })
  if (!user) redirect("/login")

  const profile = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
  })

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Business settings</h1>
        <p className="text-sm text-foreground-muted mt-1">
          What clients see on proposals and invoices. Fields left blank simply
          don&rsquo;t appear. Changes auto-save.
        </p>
      </div>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Identity</h2>
        <AutoSaveForm
          action={updateBusinessProfile}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Business name
            </label>
            <input
              name="businessName"
              defaultValue={profile?.businessName ?? ""}
              placeholder="e.g. Reliable Remodeling LLC"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Tagline
            </label>
            <input
              name="tagline"
              defaultValue={profile?.tagline ?? ""}
              placeholder="e.g. Quality remodeling since 2008"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              License #
            </label>
            <input
              name="licenseNumber"
              defaultValue={profile?.licenseNumber ?? ""}
              placeholder="e.g. IL #104.012345"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Phone
            </label>
            <input
              name="phone"
              type="tel"
              defaultValue={profile?.phone ?? ""}
              placeholder="(555) 123-4567"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Business email
            </label>
            <input
              name="email"
              type="email"
              defaultValue={profile?.email ?? ""}
              placeholder="office@example.com"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Business address
            </label>
            <input
              name="address"
              defaultValue={profile?.address ?? ""}
              placeholder="123 Main St, Anytown"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </AutoSaveForm>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Logo</h2>
        <p className="text-xs text-foreground-muted">
          Appears on the proposal page and all PDFs. PNG with transparent
          background works best; 4 MB max.
        </p>
        <LogoUploader
          logoUrl={profile?.logoUrl ?? null}
          uploadAction={uploadLogo}
          removeAction={removeLogo}
        />
      </Card>

      <p className="text-xs text-foreground-soft">
        Signed in as {session.user.email}.
      </p>
    </div>
  )
}
