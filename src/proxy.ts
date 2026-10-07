import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_SITE_PREVIEW_MODE !== "true")
    return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (path === "/api/auth/session" && request.method === "GET")
    return NextResponse.json({});
  if (path.startsWith("/api/preview/") && request.method === "GET")
    return NextResponse.next();
  return NextResponse.json(
    {
      code: 403,
      message: "This preview is read-only. Sign-in and editing are disabled.",
    },
    { status: 403 },
  );
}

export const config = { matcher: ["/api/:path*"] };
