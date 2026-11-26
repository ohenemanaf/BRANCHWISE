import { ImageResponse } from "next/og";

export const alt = "Branchwise: see what every Git command does";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  const blue = "#2453d6";
  const green = "#0c9c6c";
  const station = (x: number, y: number, color: string, filled = false) => (
    <div
      key={`${x}-${y}`}
      style={{ position: "absolute", left: x - 18, top: y - 18, width: 36, height: 36, borderRadius: 18, border: `7px solid ${color}`, background: filled ? color : "#ffffff" }}
    />
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f3f5f8", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 34, color: "#4a5466", display: "flex" }}>Branchwise</div>
        <div style={{ fontSize: 76, fontWeight: 700, color: "#18202e", marginTop: 18, lineHeight: 1.05, display: "flex", maxWidth: 900 }}>See what every Git command does.</div>
        <div style={{ position: "relative", display: "flex", marginTop: 70, height: 200 }}>
          <div style={{ position: "absolute", left: 40, top: 46, width: 900, height: 10, background: blue, borderRadius: 5 }} />
          <div style={{ position: "absolute", left: 380, top: 146, width: 320, height: 10, background: green, borderRadius: 5 }} />
          <div style={{ position: "absolute", left: 300, top: 50, width: 110, height: 104, borderLeft: `10px solid ${green}`, borderBottom: `10px solid ${green}`, borderBottomLeftRadius: 60 }} />
          <div style={{ position: "absolute", left: 690, top: 50, width: 110, height: 104, borderRight: `10px solid ${green}`, borderBottom: `10px solid ${green}`, borderBottomRightRadius: 60 }} />
          {station(60, 51, blue)}
          {station(190, 51, blue)}
          {station(310, 51, blue)}
          {station(460, 151, green)}
          {station(620, 151, green)}
          {station(560, 51, blue)}
          {station(930, 51, blue, true)}
          <div style={{ position: "absolute", left: 970, top: 30, padding: "6px 18px", borderRadius: 22, background: blue, color: "#fff", fontSize: 28, display: "flex" }}>main</div>
        </div>
      </div>
    ),
    size,
  );
}
