import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { dark } from "@clerk/themes";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Appointment Scheduler",
  description: "AI agent that calls doctors' offices and books appointments for you.",
  // Needed for opengraph-image to resolve to an absolute URL, which crawlers
  // require. Falls back to the deployment domain when run locally.
  metadataBase: new URL(
    process.env.PUBLIC_BASE_URL ?? "https://med-appointment-scheduler.vercel.app",
  ),
  openGraph: {
    title: "Appointment Scheduler",
    description: "AI agent that calls doctors' offices and books appointments for you.",
    type: "website",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  return (
    <ClerkProvider
      appearance={{
        theme: dark,
        variables: {
          colorPrimary: "#6d7cf7",
          colorBackground: "#111319",
        },
        elements: {
          headerSubtitle: { display: "none" },
        },
      }}
    >
      <html lang="en" className={cn("dark font-sans", geist.variable, geistMono.variable)}>
        <body>
          {userId && (
            <header className="flex justify-end px-7 pt-3.5">
              <UserButton />
            </header>
          )}
          {children}
          <Toaster position="top-center" richColors />
          {/* Page views only. Route paths here are static (/, /sign-in,
              /sign-up) — no patient identifier ever appears in a URL, so
              nothing sent to Vercel carries PHI. */}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
