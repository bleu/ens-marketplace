import { ImageResponse } from "next/og";
import { markDataUri, TILE_GRADIENT } from "./mark-image";

/// The bid is submitted to a Discourse thread, where this link preview is the first thing
/// a reviewer sees. Generated rather than committed so no binary lands in the repo.
/// No `fonts` passed on purpose: satori would need the Erode/Instrument Serif webfiles
/// fetched over the network at build time, and a CI build shouldn't depend on that.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#0a0d18",
          backgroundImage: "radial-gradient(900px 500px at 88% 108%, rgba(255,134,104,0.16), transparent)",
          color: "#f2f4f1",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 104,
              height: 104,
              borderRadius: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: TILE_GRADIENT,
            }}
          >
            <img src={markDataUri} width={75} height={75} alt="" />
          </div>
          <div style={{ display: "flex", fontSize: 108, fontWeight: 600, letterSpacing: "-0.035em" }}>Farol</div>
          <div
            style={{
              display: "flex",
              marginTop: 18,
              padding: "8px 16px",
              borderRadius: 999,
              border: "1px solid rgba(255,134,104,0.5)",
              color: "#ff8668",
              fontSize: 24,
              letterSpacing: "0.12em",
            }}
          >
            BETA
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 44, fontSize: 42, color: "#cfd1cc", letterSpacing: "-0.02em" }}>
          Non-custodial ENS marketplace. Forkable by design.
        </div>

        <div style={{ display: "flex", marginTop: 28, width: 132, height: 3, background: "#ff8668" }} />
      </div>
    ),
    size,
  );
}
