"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          playerVars?: Record<string, unknown>;
          events?: {
            onStateChange?: (e: { data: number }) => void;
          };
        }
      ) => { getPlayerState?: () => number };
      PlayerState: { PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

const HEARTBEAT_MS = 30_000;
// A cada ~50 min pede confirmação de presença
const PRESENCE_CHECK_MS = 50 * 60_000;

const subscribeNoop = () => () => {};

export default function WatchPlayer({
  slug,
  videoId,
  currencyName,
  accentColor,
  initialPoints,
}: {
  slug: string;
  videoId: string;
  currencyName: string;
  accentColor: string;
  initialPoints: number;
}) {
  const playerRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(false);
  const confirmedRef = useRef(true);
  const [points, setPoints] = useState(initialPoints);
  const [sessionEarned, setSessionEarned] = useState(0);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [liveEnded, setLiveEnded] = useState(false);
  const chatHost = useSyncExternalStore(
    subscribeNoop,
    () => window.location.hostname,
    () => "localhost"
  );

  useEffect(() => {
    const el = playerRef.current;
    if (!el) return;

    const createPlayer = () => {
      new window.YT!.Player(el, {
        videoId,
        playerVars: { autoplay: 1 },
        events: {
          onStateChange: (e) => {
            playingRef.current = e.data === window.YT!.PlayerState.PLAYING;
          },
        },
      });
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = createPlayer;
    }
  }, [videoId]);

  const sendHeartbeat = useCallback(async () => {
    try {
      const res = await fetch("/api/watch/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          playing: playingRef.current && confirmedRef.current,
          visible: document.visibilityState === "visible",
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        live?: boolean;
        credited?: number;
        points?: number;
      };
      if (data.live === false) {
        setLiveEnded(true);
        return;
      }
      if (typeof data.points === "number") setPoints(data.points);
      if (data.credited) setSessionEarned((v) => v + data.credited!);
    } catch {
      // rede instável: tenta no próximo ciclo
    }
  }, [slug]);

  useEffect(() => {
    const hb = setInterval(sendHeartbeat, HEARTBEAT_MS);
    const presence = setInterval(() => {
      confirmedRef.current = false;
      setNeedsConfirm(true);
    }, PRESENCE_CHECK_MS);
    return () => {
      clearInterval(hb);
      clearInterval(presence);
    };
  }, [sendHeartbeat]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black">
          <div ref={playerRef} className="h-full w-full" />
          {needsConfirm && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
              <p className="text-lg font-semibold">Ainda está assistindo?</p>
              <button
                onClick={() => {
                  confirmedRef.current = true;
                  setNeedsConfirm(false);
                }}
                className="rounded-xl px-6 py-3 font-semibold"
                style={{ backgroundColor: accentColor }}
              >
                Sim, continuar ganhando {currencyName}
              </button>
            </div>
          )}
          {liveEnded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <p className="text-lg font-semibold">A live terminou. Obrigado!</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center gap-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-6 py-4">
          <div>
            <p className="text-xs text-zinc-400">Seus {currencyName}</p>
            <p className="text-2xl font-bold" style={{ color: accentColor }}>
              {points.toLocaleString("pt-BR")}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-400">Ganhos nesta sessão</p>
            <p className="text-2xl font-bold">+{sessionEarned}</p>
          </div>
          <p className="ml-auto max-w-56 text-xs text-zinc-500">
            Mantenha esta aba aberta e o vídeo tocando para acumular{" "}
            {currencyName}.
          </p>
        </div>
      </div>
      <div className="h-[560px] overflow-hidden rounded-2xl border border-zinc-800">
        <iframe
          title="Chat da live"
          src={`https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${chatHost}`}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
