import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE_NAME = "machida_lab_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.has(AUTH_COOKIE_NAME);

  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/invoices/:path*", "/orders/:path*", "/works/:path*", "/deliveries/:path*"],
};
