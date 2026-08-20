import { ImageResponse } from "next/og";

export const alt = "好店智装云官网";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#095488",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Arial, PingFang SC, Microsoft YaHei, sans-serif",
          height: "100%",
          justifyContent: "space-between",
          padding: "72px",
          width: "100%",
        }}
      >
        <div
          style={{
            color: "#ffffff",
            display: "flex",
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          好店智装云
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              color: "#ffffff",
              display: "flex",
              fontSize: 72,
              fontWeight: 700,
              letterSpacing: "-2px",
            }}
          >
            装修经营与项目交付平台
          </div>
          <div style={{ color: "#dbeefa", display: "flex", fontSize: 30 }}>
            让业务过程有记录，交付结果可核对
          </div>
        </div>
        <div style={{ background: "#ff6b2b", display: "flex", height: 12, width: 180 }} />
      </div>
    ),
    size,
  );
}
