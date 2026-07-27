"use client";

import { useState } from "react";

export default function DisconnectButton() {
  const [arming, setArming] = useState(false);

  if (!arming) {
    return (
      <button
        onClick={() => setArming(true)}
        className="rounded-lg border border-brick/40 px-4 py-2 text-sm font-semibold text-brick hover:bg-brick/5"
      >
        Disconnect &amp; delete my data
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brick/40 bg-brick/5 p-3">
      <p className="text-sm text-brick">
        This revokes Google access and permanently deletes all your synced data. Sure?
      </p>
      <form method="post" action="/api/me/disconnect">
        <button className="rounded-lg bg-brick px-4 py-2 text-sm font-semibold text-white hover:bg-brick/80">
          Yes, delete everything
        </button>
      </form>
      <button onClick={() => setArming(false)} className="text-sm text-sub hover:text-ink">
        Cancel
      </button>
    </div>
  );
}
