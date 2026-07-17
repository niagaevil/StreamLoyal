import { notFound } from "next/navigation";
import { verifyOverlayToken } from "@/lib/overlay-token";
import { AlertsOverlay } from "./AlertsOverlay";

export default async function AlertsOverlayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!(await verifyOverlayToken(token, "ALERTS"))) notFound();
  return <AlertsOverlay token={token} />;
}
