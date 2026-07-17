"use client";

import { useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};

export default function TwitchPlayer({
  login,
  currencyName,
  accentColor,
}: {
  login: string;
  currencyName: string;
  accentColor: string;
}) {
  const host = useSyncExternalStore(
    subscribeNoop,
    () => window.location.hostname,
    () => null
  );

  if (!host) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black">
          <iframe
            title="Live da Twitch"
            src={`https://player.twitch.tv/?channel=${login}&parent=${host}&autoplay=true`}
            className="h-full w-full"
            allowFullScreen
          />
        </div>
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-6 py-4">
          <p className="text-sm text-zinc-300">
            Na Twitch os {currencyName} são creditados{" "}
            <span className="font-semibold" style={{ color: accentColor }}>
              automaticamente
            </span>{" "}
            para quem está no chat — inclusive em silêncio. Entre no chat ao
            lado com a sua conta da Twitch e pronto.
          </p>
        </div>
      </div>
      <div className="h-[560px] overflow-hidden rounded-2xl border border-zinc-800">
        <iframe
          title="Chat da live"
          src={`https://www.twitch.tv/embed/${login}/chat?parent=${host}&darkpopout`}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
