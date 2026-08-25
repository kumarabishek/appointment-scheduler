import { auth } from "@clerk/nextjs/server";
import { HomeApp } from "@/components/home-app";
import { Landing } from "@/components/landing";

/** "/" is the only route a signed-out visitor can reach, so it decides what to
 *  show on the SERVER: the app for a session, the landing page otherwise.
 *
 *  Middleware used to refuse this route outright. It no longer can, because a
 *  link preview crawler has to receive a real page. The gate therefore lives
 *  here — and the data behind it stays protected either way, since /api/calls
 *  and /api/requests are still session-only. */
export default async function Home() {
  const { userId } = await auth();
  return userId ? <HomeApp /> : <Landing />;
}
