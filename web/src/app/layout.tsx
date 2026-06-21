import type { Metadata } from "next";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Appointment Scheduler",
  description: "AI agent that calls offices and books appointments for you.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {userId && (
            <header
              style={{
                display: "flex",
                justifyContent: "flex-end",
                padding: "0.75rem 1rem",
              }}
            >
              <UserButton />
            </header>
          )}
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
