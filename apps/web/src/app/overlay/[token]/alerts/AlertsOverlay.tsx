"use client";

import { useEffect, useRef, useState } from "react";

type AlertEvent = {
  id: string;
  userName: string | null;
  message: string;
  imageUrl: string | null;
  soundUrl: string | null;
  amount?: number | null;
};

export function AlertsOverlay({ token }: { token: string }) {
  const [queue, setQueue] = useState<AlertEvent[]>([]);
  const [current, setCurrent] = useState<AlertEvent | null>(null);
  const [duration, setDuration] = useState(7);
  const [accent, setAccent] = useState("#7c3aed");
  const [template, setTemplate] = useState("{message}");
  const after = useRef(0);

  useEffect(() => {
    let active = true;
    after.current = Date.now();
    const poll = async () => {
      const response = await fetch(
        `/api/overlay/${encodeURIComponent(token)}/events?after=${after.current}`,
        { cache: "no-store" }
      ).catch(() => null);
      if (!response?.ok || !active) return;
      const data = (await response.json()) as {
        serverTime: number;
        settings?: {
          durationSec?: number;
          accentColor?: string;
          template?: string;
        };
        events: AlertEvent[];
      };
      after.current = data.serverTime;
      setDuration(data.settings?.durationSec ?? 7);
      setAccent(data.settings?.accentColor ?? "#7c3aed");
      setTemplate(data.settings?.template ?? "{message}");
      if (data.events.length) {
        setQueue((previous) => [
          ...previous,
          ...data.events.filter(
            (event) => !previous.some((item) => item.id === event.id)
          ),
        ]);
      }
    };
    void poll();
    const interval = window.setInterval(poll, 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    const start = window.setTimeout(() => {
      setCurrent(next);
      setQueue(rest);
    }, 0);
    return () => window.clearTimeout(start);
  }, [current, queue]);

  useEffect(() => {
    if (!current) return;
    if (current.soundUrl) {
      const audio = new Audio(current.soundUrl);
      void audio.play().catch(() => undefined);
    }
    const timeout = window.setTimeout(
      () => setCurrent(null),
      Math.max(1, duration) * 1000
    );
    return () => window.clearTimeout(timeout);
  }, [current, duration]);

  if (!current) return null;
  const text = template
    .replaceAll("{user}", current.userName ?? "")
    .replaceAll("{message}", current.message)
    .replaceAll("{amount}", String(current.amount ?? ""));
  return (
    <main className="flex min-h-screen items-center justify-center bg-transparent p-8">
      <div
        className="animate-pulse rounded-3xl border-4 bg-zinc-950/90 px-10 py-8 text-center text-white shadow-2xl"
        style={{ borderColor: accent }}
      >
        {current.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.imageUrl}
            alt=""
            className="mx-auto mb-4 h-32 w-32 rounded-2xl object-cover"
          />
        )}
        <p className="text-3xl font-black">{text}</p>
      </div>
    </main>
  );
}
