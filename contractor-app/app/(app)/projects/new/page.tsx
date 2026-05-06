import Link from "next/link"
import { createProject } from "../actions"

export default function NewProjectPage() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <Link href="/projects" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to projects
        </Link>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-1">New Project</h1>
      <p className="text-sm text-gray-500 mb-6">Start a new estimate. You can edit anything later.</p>

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
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
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
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
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
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
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
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
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
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Create project
          </button>
        </div>
      </form>
    </div>
  )
}
