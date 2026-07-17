"use client";

import { useCallback, useEffect, useState } from "react";

type MediaItem = { id: string; videoId: string; status: string };
type Payload = {
  item: MediaItem | null;
  settings: { maxDurationSec: number; volume: number } | null;
};

export function MediaOverlay({ token }: { token: string }) {
  const [payload, setPayload] = useState<Payload>({
    item: null,
    settings: null,
  });

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/overlay/${encodeURIComponent(token)}/media`,
      { cache: "no-store" }
    ).catch(() => null);
    if (response?.ok) setPayload((await response.json()) as Payload);
  }, [token]);

  const finish = useCallback(
    async (itemId: string, action: "played" | "skipped" = "played") => {
      await fetch(`/api/overlay/${encodeURIComponent(token)}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action }),
      }).catch(() => null);
      setPayload((previous) => ({ ...previous, item: null }));
      window.setTimeout(load, 500);
    },
    [load, token]
  );

  useEffect(() => {
    const initial = window.setTimeout(load, 0);
    const interval = window.setInterval(load, 2000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  useEffect(() => {
    if (!payload.item) return;
    const timeout = window.setTimeout(
      () => void finish(payload.item!.id),
      Math.max(5, payload.settings?.maxDurationSec ?? 120) * 1000
    );
    return () => window.clearTimeout(timeout);
  }, [finish, payload.item, payload.settings?.maxDurationSec]);

  if (!payload.item) return null;
  const volume = Math.min(100, Math.max(0, payload.settings?.volume ?? 70));
  return (
    <main className="flex min-h-screen items-center justify-center bg-transparent">
      <iframe
        key={payload.item.id}
        title="Media Share"
        src={`https://www.youtube.com/embed/${payload.item.videoId}?autoplay=1&controls=0&rel=0&volume=${volume}`}
        allow="autoplay; encrypted-media"
        className="aspect-video h-auto w-full border-0"
      />
    </main>
  );
}
