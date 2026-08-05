import { ImageResponse } from "next/og";
import { markDataUri, TILE_GRADIENT } from "./mark-image";

/// Apple touch icons have to be PNG — Safari ignores SVG here — so this is generated at
/// build time rather than committed as a binary.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: TILE_GRADIENT,
        }}
      >
        <img src={markDataUri} width={130} height={130} alt="" />
      </div>
    ),
    size,
  );
}
