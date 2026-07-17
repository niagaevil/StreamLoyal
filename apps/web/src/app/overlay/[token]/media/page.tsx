import { notFound } from "next/navigation";
import { verifyOverlayToken } from "@/lib/overlay-token";
import { MediaOverlay } from "./MediaOverlay";

export default async function MediaOverlayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!(await verifyOverlayToken(token, "MEDIA"))) notFound();
  return <MediaOverlay token={token} />;
}
