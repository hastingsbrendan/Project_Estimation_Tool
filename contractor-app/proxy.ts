import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function proxy(req: NextRequest) {
  const session = await auth()
  const { pathname } = req.nextUrl

  const isProtected = pathname.startsWith("/projects") || pathname.startsWith("/estimate")
  const isAuthPage = pathname === "/login"

  if (isProtected && !session) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthPage && session) {
    return NextResponse.redirect(new URL("/projects", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json).*)"],
}
