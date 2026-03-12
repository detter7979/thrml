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
          backgroundColor: "#c46339",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          position: "relative",
        }}
      >
        <div
          style={{
            color: "#ffffff",
            fontSize: "188px",
            fontWeight: "400",
            letterSpacing: "0.01em",
            textTransform: "lowercase",
            fontFamily: '"DM Serif Display", Georgia, serif',
            lineHeight: 1,
            marginTop: "220px",
          }}
        >
          thrml
        </div>

        <div
          style={{
            color: "rgba(255,255,255,0.82)",
            fontSize: "50px",
            fontWeight: "400",
            letterSpacing: "0.01em",
            fontFamily: '"DM Sans", Arial, sans-serif',
            lineHeight: 1.3,
            marginTop: "16px",
          }}
        >
          Discover private wellness spaces near you.
        </div>

        <div
          style={{
            color: "rgba(255,255,255,0.42)",
            fontSize: "40px",
            fontWeight: "400",
            letterSpacing: "0.01em",
            fontFamily: '"DM Sans", Arial, sans-serif',
            lineHeight: 1,
            position: "absolute",
            bottom: "36px",
            left: 0,
            right: 0,
            textAlign: "center",
          }}
        >
          usethrml.com
        </div>
      </div>
    ),
    { ...size }
  );
}
