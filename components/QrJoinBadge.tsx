import QRCode from "qrcode";

/**
 * Compact scan-to-join badge for the TV. The QR is always dark-on-white —
 * phones struggle with inverted codes, so it ignores the theme on purpose.
 */
export default function QrJoinBadge({ url, size = 112 }: { url: string; size?: number }) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  let path = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(x, y)) path += `M${x} ${y}h1v1h-1z`;
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-xl bg-white p-2.5 shadow-card ring-1 ring-white/10">
        <svg
          viewBox={`0 0 ${n} ${n}`}
          width={size}
          height={size}
          shapeRendering="crispEdges"
          role="img"
          aria-label="QR code — scan to join the leaderboard"
        >
          <path d={path} fill="#101518" />
        </svg>
      </div>
      <p className="label-caps">Scan to join</p>
    </div>
  );
}
