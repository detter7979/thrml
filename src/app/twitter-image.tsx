import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Thrml — Private Wellness Spaces";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          backgroundColor: "#1a1a1a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          transform: "translateY(-24px)",
        }}
      >
        <div
          style={{
            color: "#ffffff",
            fontSize: "120px",
            fontWeight: "400",
            letterSpacing: "0.01em",
            textTransform: "lowercase",
            fontFamily: '"DM Serif Display", Georgia, serif',
            lineHeight: 1,
          }}
        >
          thrml
        </div>

        <div
          style={{
            color: "#a0a0a0",
            fontSize: "24px",
            fontWeight: "400",
            letterSpacing: "0.01em",
            fontFamily: '"DM Sans", Arial, sans-serif',
            lineHeight: 1.3,
          }}
        >
          Discover private wellness spaces near you.
        </div>
      </div>
    ),
    { ...size }
  );
}
