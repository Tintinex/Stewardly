import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Protects /admin/** routes — only users with custom:role === 'superadmin'
 * in their Cognito access token may access these pages.
 *
 * Amplify v6 stores the access token in localStorage (not cookies), so
 * we can't reliably read it in Edge middleware. Instead we set a
 * 'x-admin-verified' cookie on the client after the React auth check,
 * and use that here as a lightweight gate. The real enforcement is done
 * in AdminLayout (server-side token check) and in every admin-service Lambda.
 *
 * If the cookie is absent, redirect to sign-in with a returnUrl param so the
 * user lands back at the admin page after login.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/admin')) {
    const adminCookie = request.cookies.get('stewardly-admin-verified')
    if (!adminCookie || adminCookie.value !== '1') {
      const loginUrl = new URL('/auth/signin', request.url)
      loginUrl.searchParams.set('returnUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
