import { ImageResponse } from "next/og";

export const alt = "鹅班长官网";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background: "#fffdf5",
          color: "#151515",
          display: "flex",
          fontFamily: "Arial, PingFang SC, Microsoft YaHei, sans-serif",
          height: "100%",
          padding: "64px",
          width: "100%",
        }}
      >
        <div
          style={{
            background: "#151515",
            borderRadius: "24px",
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px",
          }}
        >
          <div style={{ color: "#f6c945", display: "flex", fontSize: 34, fontWeight: 700 }}>
            鹅班长
          </div>
          <div style={{ color: "#fffdf5", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 700, letterSpacing: "-2px" }}>
              装修经营与项目交付平台
            </div>
            <div style={{ color: "#d7d3c8", display: "flex", fontSize: 30 }}>
              让业务过程有记录，交付结果可核对
            </div>
          </div>
          <div style={{ background: "#f6c945", display: "flex", height: 12, width: 180 }} />
        </div>
      </div>
    ),
    size,
  );
}
