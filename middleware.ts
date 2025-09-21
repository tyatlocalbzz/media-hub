import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  // Create a response object
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Create a Supabase client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session
  const { data: { user }, error } = await supabase.auth.getUser();

  // Protected routes
  const protectedPaths = ['/dashboard', '/files'];
  const isProtectedPath = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  );

  // If trying to access protected route without auth, redirect to login
  if (isProtectedPath && (!user || error)) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // If authenticated and trying to access login, redirect to dashboard
  if (request.nextUrl.pathname === '/login' && user && !error) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // For the root path, redirect based on auth status
  if (request.nextUrl.pathname === '/') {
    if (user && !error) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes (except auth callback)
     * - debug page (dev only)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api/(?!auth/callback)|debug).*)',
  ],
};