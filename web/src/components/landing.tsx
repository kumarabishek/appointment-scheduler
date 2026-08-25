"use client";

/** Signed-out view of "/". The app itself is unreachable without a session, so
 *  this is the only page a visitor (or a link preview crawler) ever sees.
 *
 *  The hero is a real booking call replaying in time rather than a product
 *  screenshot: what distinguishes this app is not its UI but that it holds the
 *  line with a receptionist on your behalf. Details are from a genuine call,
 *  with the patient's identifiers replaced.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Phone } from "lucide-react";
import { SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

type Turn = {
  at: string;
  who: "menu" | "keypad" | "staff" | "agent";
  said: string;
};

const TURNS: Turn[] = [
  { at: "00:03", who: "menu", said: '"For appointments, press 2."' },
  { at: "00:56", who: "keypad", said: "2" },
  { at: "01:08", who: "staff", said: "Hello, how can I help you today?" },
  {
    at: "01:18",
    who: "agent",
    said: "Calling for Jordan Reyes, an existing patient, to book an appointment.",
  },
  { at: "01:35", who: "staff", said: "Can I have the patient's date of birth?" },
  { at: "01:40", who: "agent", said: "March 4th, 1991." },
  {
    at: "03:52",
    who: "agent",
    said: "My name is Alex. I am an automated assistant calling with the patient's authorization.",
  },
  { at: "04:37", who: "agent", said: "Does Dr. Chan have any availability?" },
];

const AFTER_HOLD: Turn[] = [
  {
    at: "07:46",
    who: "staff",
    said: "Thanks for holding. I can do Friday, October 2nd at 9:30.",
  },
  { at: "07:55", who: "agent", said: "That works perfectly. Go ahead and book it." },
];

/** Clock readings in call order, one per revealed row. */
const STAMPS = [
  "00:03", "00:56", "01:08", "01:18", "01:35", "01:40", "03:52", "04:37",
  "05:14", "07:46", "07:55", "10:29", "10:29",
];

const FIGURES = [
  ["10:29", "on the phone"],
  ["2:32", "on hold"],
  ["28", "turns"],
  ["$0.60", "to run"],
];

export function Landing() {
  // `revealed` counts rows played so far. It starts at TURNS.length + 5 (every
  // row) so the transcript is readable before hydration and without JS; the
  // effect resets it to 0 only once it is able to animate.
  const TOTAL = TURNS.length + AFTER_HOLD.length + 3;
  const [revealed, setRevealed] = useState(TOTAL);
  const [clock, setClock] = useState("10:29");
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setRevealed(0);
    setClock("00:00");

    let timers: ReturnType<typeof setTimeout>[] = [];
    const play = () => {
      timers = Array.from({ length: TOTAL }, (_, i) =>
        setTimeout(() => {
          setRevealed(i + 1);
          if (STAMPS[i]) setClock(STAMPS[i]);
        }, 200 + i * 300),
      );
    };

    const el = panel.current;
    if (!el || !("IntersectionObserver" in window)) {
      play();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          play();
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [TOTAL]);

  const row = (i: number) => (revealed > i ? "animate-reveal" : "opacity-0");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[880px] px-6">
        <header className="flex items-center justify-between gap-4 pt-6">
          <div className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
            <span className="flex size-[25px] flex-none items-center justify-center rounded-[7px] bg-primary">
              <Phone className="size-3.5 text-primary-foreground" />
            </span>
            Appointment Scheduler
          </div>
          <SignInButton mode="modal">
            <Button variant="outline" size="sm">
              Sign in
            </Button>
          </SignInButton>
        </header>

        <section className="pb-9 pt-[82px]">
          <p className="mb-[18px] font-mono text-[11.5px] uppercase tracking-[0.16em] text-primary">
            Doctor appointments, booked by phone
          </p>
          <h1 className="mb-[30px] text-[clamp(1.95rem,4.9vw,3.05rem)] font-semibold leading-[1.08] tracking-[-0.032em]">
            Someone still has to call.
            {/* The break is set rather than left to wrapping: the concession on
                one line, the payoff on the next, is the whole idea. */}
            <span className="block text-primary">It doesn&apos;t have to be you.</span>
          </h1>
          <SignInButton mode="modal">
            <Button size="lg">Book a doctor&apos;s appointment</Button>
          </SignInButton>
        </section>

        <section
          ref={panel}
          aria-label="Transcript of a real booking call"
          className="overflow-hidden rounded-[14px] border bg-card"
        >
          <div className="flex items-center gap-2.5 border-b border-border/60 bg-muted px-[18px] py-3.5">
            <span className="size-[7px] flex-none rounded-full bg-good shadow-[0_0_0_3px_rgba(52,211,153,0.14)]" />
            <span className="text-sm font-medium">A real call to a primary care office</span>
            <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground/70">
              {clock}
            </span>
          </div>

          <div className="py-2">
            {TURNS.map((t, i) => (
              <Row key={t.at} turn={t} className={row(i)} />
            ))}

            {/* A real gap, so hold reads as time passing rather than a label. */}
            <div
              className={`grid grid-cols-[58px_1fr] items-center gap-3.5 px-[18px] pb-4 pt-3.5 ${row(TURNS.length)}`}
            >
              <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground/70">
                05:14
              </span>
              <span className="relative h-px bg-[repeating-linear-gradient(90deg,var(--border)_0_5px,transparent_5px_11px)]">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 bg-card pr-3 font-mono text-[11.5px] tabular-nums text-muted-foreground/70">
                  on hold, 2 min 32 sec
                </span>
              </span>
            </div>

            {AFTER_HOLD.map((t, i) => (
              <Row key={t.at} turn={t} className={row(TURNS.length + 1 + i)} />
            ))}
          </div>

          <div
            className={`mx-[18px] flex items-center gap-2.5 rounded-lg border border-good/30 bg-good/[0.07] px-[15px] py-3.5 ${row(TURNS.length + 3)}`}
          >
            <Check className="size-4 flex-none text-good" />
            <b className="text-[14.5px] font-semibold">Booked. Friday, October 2nd at 9:30 AM</b>
            <span className="ml-auto text-[13px] text-muted-foreground">Annual checkup</span>
          </div>

          {/* Figures sit inside the call, where they read as evidence rather
              than as a pitch. */}
          <div
            className={`flex flex-wrap gap-x-[26px] px-[19px] pb-4 pt-4 font-mono text-xs tabular-nums text-muted-foreground/70 ${row(TURNS.length + 4)}`}
          >
            {FIGURES.map(([n, label]) => (
              <span key={label}>
                <b className="font-medium text-muted-foreground">{n}</b> {label}
              </span>
            ))}
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-6 pt-12">
          <p className="max-w-[46ch] text-[14.5px] text-muted-foreground">
            Medical details are encrypted, and read out only when an office asks for them.
          </p>
          <SignInButton mode="modal">
            <Button size="lg">Book a doctor&apos;s appointment</Button>
          </SignInButton>
        </section>

        <footer className="mt-12 flex flex-wrap justify-between gap-4 border-t pb-11 pt-5 text-[13px] text-muted-foreground/70">
          <span>Appointment Scheduler</span>
          <a
            className="text-muted-foreground hover:text-foreground"
            href="https://github.com/kumarabishek/appointment-scheduler"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
          </a>
        </footer>
      </div>
    </div>
  );
}

function Row({ turn, className }: { turn: Turn; className: string }) {
  const system = turn.who === "menu" || turn.who === "keypad";
  return (
    <div
      className={`grid grid-cols-[50px_1fr] items-baseline gap-3.5 px-[18px] py-[7px] sm:grid-cols-[58px_70px_1fr] ${className}`}
    >
      <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground/70">
        {turn.at}
      </span>
      <span
        className={`hidden font-mono text-[10.5px] uppercase tracking-[0.07em] sm:inline ${
          turn.who === "agent"
            ? "text-primary"
            : turn.who === "staff"
              ? "text-muted-foreground"
              : "text-muted-foreground/70"
        }`}
      >
        {turn.who}
      </span>
      <span
        className={
          system
            ? "font-mono text-[12.5px] text-muted-foreground"
            : turn.who === "staff"
              ? "text-[14.5px] leading-[1.5] text-secondary-foreground"
              : "text-[14.5px] leading-[1.5]"
        }
      >
        {turn.said}
      </span>
    </div>
  );
}
