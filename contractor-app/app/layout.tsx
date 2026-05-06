import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })

export const metadata: Metadata = {
  title: "Contractor App",
  description: "Estimate, propose, and win jobs faster.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Contractor App",
  },
}

export const viewport: Viewport = {
  themeColor: "#1a1a1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="h-full bg-gray-50 text-gray-900 antialiased font-sans">{children}</body>
    </html>
  )
}
