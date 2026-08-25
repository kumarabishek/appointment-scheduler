import { ImageResponse } from "next/og";

/** Preview card for links shared to LinkedIn, Slack, iMessage and the rest.
 *  Generated rather than a checked-in PNG so it is built from the same colors
 *  as the app and cannot drift from them. */
export const alt = "Appointment Scheduler — doctor appointments, booked by phone";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#08090c",
          padding: "0 84px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 44 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              background: "#6d7cf7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff">
              <path d="M6.6 2.5c-1.4 0-2.5 1.2-2.3 2.6.4 3.5 2 6.6 4.5 9.1s5.6 4.1 9.1 4.5c1.4.2 2.6-.9 2.6-2.3v-2.1c0-1.1-.8-2.1-1.9-2.3l-1.8-.3c-1-.2-1.9.2-2.5 1l-.4.6a12 12 0 0 1-4.3-4.3l.6-.4c.8-.6 1.2-1.5 1-2.5l-.3-1.8c-.2-1.1-1.2-1.9-2.3-1.9z" />
            </svg>
          </div>
          <div style={{ color: "#eef0f4", fontSize: 30, fontWeight: 600 }}>
            Appointment Scheduler
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <div style={{ color: "#eef0f4", fontSize: 74, fontWeight: 600, letterSpacing: "-0.03em" }}>
            Someone still has to call.
          </div>
          <div style={{ color: "#6d7cf7", fontSize: 74, fontWeight: 600, letterSpacing: "-0.03em" }}>
            It doesn&apos;t have to be you.
          </div>
        </div>

        <div style={{ color: "#9aa0ad", fontSize: 30, marginTop: 40, display: "flex" }}>
          Doctor appointments, booked by phone.
        </div>
      </div>
    ),
    size,
  );
}
