import { NextResponse, type NextRequest } from 'next/server';

/** Stash the requested path so auth/session can return to Field vs HQ correctly. */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  requestHeaders.set('x-ee-path', path);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/hq/:path*', '/field/:path*'],
};
