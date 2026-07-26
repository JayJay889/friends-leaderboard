"use client";

import { useState } from "react";

export default function DisconnectButton() {
  const [arming, setArming] = useState(false);

  if (!arming) {
    return (
      <button
        onClick={() => setArming(true)}
        className="rounded-lg border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-400 hover:bg-rose-500/10"
      >
        Disconnect &amp; delete my data
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3">
      <p className="text-sm text-rose-200">
        This revokes Google access and permanently deletes all your synced data. Sure?
      </p>
      <form method="post" action="/api/me/disconnect">
        <button className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400">
          Yes, delete everything
        </button>
      </form>
      <button onClick={() => setArming(false)} className="text-sm text-zinc-400 hover:text-zinc-200">
        Cancel
      </button>
    </div>
  );
}
