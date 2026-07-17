import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@streamloyal/db";

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) {
    const channel = await prisma.channel.findUnique({
      where: { ownerId: session.user.id },
    });
    redirect(channel ? "/dashboard" : "/onboarding");
  }

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-8 py-5 border-b border-zinc-800">
        <span className="text-xl font-bold tracking-tight">
          Stream<span className="text-violet-400">Loyal</span>
        </span>
        <div className="flex gap-2">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/onboarding" });
            }}
          >
            <button className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium transition-colors">
              Entrar com Google
            </button>
          </form>
          <form
            action={async () => {
              "use server";
              await signIn("twitch", { redirectTo: "/onboarding" });
            }}
          >
            <button className="rounded-lg bg-purple-700 hover:bg-purple-600 px-4 py-2 text-sm font-medium transition-colors">
              Entrar com Twitch
            </button>
          </form>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="max-w-3xl text-4xl sm:text-6xl font-extrabold leading-tight">
          Pontos de fidelidade e{" "}
          <span className="text-violet-400">lojinha</span> para a sua live
        </h1>
        <p className="max-w-xl text-lg text-zinc-400">
          Recompense quem acompanha a sua live no YouTube ou na Twitch: pontos
          por participação, loja de recompensas personalizada e ranking dos
          maiores fãs. Grátis.
        </p>
        <div className="flex gap-4">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/onboarding" });
            }}
          >
            <button className="rounded-xl bg-violet-600 hover:bg-violet-500 px-6 py-3 font-semibold transition-colors">
              Criar minha lojinha
            </button>
          </form>
          <Link
            href="#como-funciona"
            className="rounded-xl border border-zinc-700 hover:border-zinc-500 px-6 py-3 font-semibold transition-colors"
          >
            Como funciona
          </Link>
        </div>
      </section>

      <section
        id="como-funciona"
        className="grid gap-6 px-8 pb-16 sm:grid-cols-3 max-w-5xl mx-auto w-full"
      >
        {[
          {
            title: "1. Conecte seu canal",
            body: "Entre com Google ou Twitch e vincule seu canal do YouTube ou da Twitch em segundos.",
          },
          {
            title: "2. Configure pontos e loja",
            body: "Defina o nome da moeda, quanto cada atividade vale e crie recompensas: perks, sons e códigos.",
          },
          {
            title: "3. Compartilhe sua página",
            body: "Seus viewers acompanham a live pela sua página, acumulam pontos e resgatam prêmios.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
          >
            <h3 className="mb-2 font-semibold text-violet-300">{f.title}</h3>
            <p className="text-sm text-zinc-400">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
