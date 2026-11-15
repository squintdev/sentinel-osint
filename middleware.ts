import { NextRequest, NextResponse } from 'next/server';

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile/i;

export function middleware(req: NextRequest) {
  const ua = req.headers.get('user-agent') || '';
  const wantsMobile = MOBILE_UA.test(ua) && req.nextUrl.searchParams.get('mobile') !== '0';

  // Desktop view override: /?mobile=0 sets a cookie and returns to the globe.
  if (req.nextUrl.pathname === '/' && req.nextUrl.searchParams.get('mobile') === '0') {
    const res = NextResponse.next();
    res.cookies.set('sentinel-view', 'desktop', { path: '/', maxAge: 60 * 60 * 24 * 365 });
    return res;
  }

  // Mobile devices land on / and get sent to the mobile view.
  if (req.nextUrl.pathname === '/' && wantsMobile && req.cookies.get('sentinel-view')?.value !== 'desktop') {
    const url = req.nextUrl.clone();
    url.pathname = '/mobile';
    url.searchParams.delete('mobile');
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
