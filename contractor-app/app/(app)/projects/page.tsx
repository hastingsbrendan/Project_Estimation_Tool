import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { signOut } from "@/auth"

export default async function ProjectsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔨</span>
            <span className="font-semibold text-gray-900">Contractor App</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">{session.user?.email}</span>
            <form
              action={async () => {
                "use server"
                await signOut({ redirectTo: "/login" })
              }}
            >
              <button
                type="submit"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">Projects</h1>
          <button
            disabled
            className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium opacity-50 cursor-not-allowed"
            title="Coming in W2"
          >
            <span>+</span> New Project
          </button>
        </div>

        {/* Empty state */}
        <div className="text-center py-16 px-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-2xl mb-4">
            <span className="text-3xl">📋</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No projects yet</h2>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            Your estimates and proposals will show up here. Project creation is coming soon.
          </p>
        </div>
      </main>
    </div>
  )
}
