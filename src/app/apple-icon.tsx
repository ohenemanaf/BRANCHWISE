import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the favicon mark at 180px. iOS rounds the corners itself, so the square is full-bleed. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#18202e" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <path d="M5 21.5h22" stroke="#6d8dff" strokeWidth="3" strokeLinecap="round" />
          <path d="M9.5 21.5c4 0 3-10 6.5-10s2.5 10 6.5 10" fill="none" stroke="#38c995" strokeWidth="3" strokeLinecap="round" />
          <circle cx="9.5" cy="21.5" r="3.2" fill="#ffffff" stroke="#6d8dff" strokeWidth="2.2" />
          <circle cx="16" cy="11.5" r="3.2" fill="#ffffff" stroke="#38c995" strokeWidth="2.2" />
          <circle cx="22.5" cy="21.5" r="3.2" fill="#ffffff" stroke="#6d8dff" strokeWidth="2.2" />
        </svg>
      </div>
    ),
    size,
  );
}
