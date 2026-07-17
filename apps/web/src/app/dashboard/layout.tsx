import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@streamloyal/db";

const NAV = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/dashboard/loyalty", label: "Fidelidade" },
  { href: "/dashboard/store", label: "Loja" },
  { href: "/dashboard/commands", label: "Comandos" },
  { href: "/dashboard/timers", label: "Timers" },
  { href: "/dashboard/chat", label: "Fila & Quotes" },
  { href: "/dashboard/moderation", label: "Moderação" },
  { href: "/dashboard/engagement", label: "Engajamento" },
  { href: "/dashboard/obs", label: "OBS & Mídia" },
  { href: "/dashboard/bot", label: "Conta do bot" },
  { href: "/dashboard/data", label: "Importar/Exportar" },
  { href: "/dashboard/viewers", label: "Espectadores" },
  { href: "/dashboard/redemptions", label: "Resgates" },
  { href: "/dashboard/appearance", label: "Aparência" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const channel = await prisma.channel.findUnique({
    where: { ownerId: session.user.id },
  });
  if (!channel) redirect("/onboarding");

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-zinc-800 bg-zinc-900/40 p-4">
        <Link href="/dashboard" className="mb-6 px-2 text-lg font-bold">
          Stream<span className="text-violet-400">Loyal</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-zinc-800 pt-4">
          <Link
            href={`/c/${channel.slug}`}
            className="mb-3 block rounded-lg bg-violet-600/20 px-3 py-2 text-center text-sm font-medium text-violet-300 hover:bg-violet-600/30 transition-colors"
          >
            Ver minha página
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
