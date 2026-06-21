import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes that must stay reachable WITHOUT a login:
//  - /api/webhooks/vapi  → Vapi's servers call this mid-call; a machine can't
//    log in. It enforces its own x-vapi-secret instead.
//  - /api/test-ivr(.*)   → the fake test IVR is hit by Twilio (also a machine).
//  - /sign-in, /sign-up  → the auth pages themselves.
// Everything else (the UI + /api/requests, /api/calls, /api/decide) requires
// a signed-in Clerk user.
const isPublic = createRouteMatcher([
  "/api/webhooks/vapi",
  "/api/test-ivr(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Run on everything except Next internals and static files…
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // …and always on API routes.
    "/(api|trpc)(.*)",
  ],
};
