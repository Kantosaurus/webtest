import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register'];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (
    PUBLIC_PATHS.includes(path) ||
    path.startsWith('/api') ||
    path.startsWith('/_next') ||
    path === '/favicon.ico'
  ) {
    return NextResponse.next();
  }
  const session = req.cookies.get('wt.sid');
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
