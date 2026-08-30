import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { HostButton } from "@forgeroom/ui-components";
import { login } from "../auth-api";
import { useSession } from "../auth/session-context";
import { resolveDefaultChannelId } from "../api/workspace-api";
import { isFixtureMode } from "../api/mode";
import { isFixtureOnboardingComplete } from "../onboarding/fixture-onboarding";
import {
  postLoginDestination,
  loginPath,
  onboardingPath,
  workspaceFeedPath,
} from "../routes/paths";
import { AuthenticatedChannelRedirect } from "../shell/authenticated-channel-redirect";

export function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const { session, isLoading, refreshSession } = useSession();
  const [email, setEmail] = useState("owner@example.test");
  const [password, setPassword] = useState(isFixtureMode ? "demo" : "");
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: async (nextSession) => {
      setError(null);
      await refreshSession();
      const channelId = await resolveDefaultChannelId(nextSession.workspace_id);
      if (!channelId) {
        setError("No channels are available in this workspace yet.");
        return;
      }
      await navigate({
        to:
          isFixtureMode && !isFixtureOnboardingComplete(nextSession.workspace_id)
            ? onboardingPath()
            : search.redirect
              ? postLoginDestination(search.redirect, nextSession.workspace_id, channelId)
              : workspaceFeedPath(nextSession.workspace_id),
      });
    },
    onError: (err: Error) => setError(err.message),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    loginMutation.mutate();
  }

  if (isLoading) {
    return (
      <p className="grid min-h-full place-items-center text-sm text-zinc-600">Checking session…</p>
    );
  }

  if (session) {
    return (
      <AuthenticatedChannelRedirect workspaceId={session.workspace_id} redirect={search.redirect} />
    );
  }

  return (
    <main className="grid min-h-full bg-zinc-950 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(139,92,246,0.35),transparent_34%),radial-gradient(circle_at_80%_75%,rgba(14,165,233,0.25),transparent_36%)]" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-base font-bold text-zinc-950">
            F
          </span>
          <span className="text-lg font-semibold">ForgeRoom</span>
        </div>
        <div className="relative max-w-xl">
          <div className="mb-6 flex -space-x-2" aria-label="Persistent AI coworkers">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-zinc-950 bg-violet-200 font-semibold text-violet-800">
              A
            </span>
            <span className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-zinc-950 bg-sky-200 font-semibold text-sky-800">
              O
            </span>
            <span className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-zinc-950 bg-white/15 text-lg text-white">
              +
            </span>
          </div>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-tight">
            Give your AI coworkers a room to work together.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-zinc-300">
            Shared channels, visible work, governed tools, live generative UI, and human approval
            exactly where the work happens.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-xs text-zinc-300">
            <LoginFeature title="Shared context" detail="Sourced and replayable" />
            <LoginFeature title="Trusted actions" detail="Exact approval boundaries" />
            <LoginFeature title="Visual answers" detail="Charts, Tasks, artifacts" />
          </div>
        </div>
        <p className="relative text-xs text-zinc-500">
          Open-source agent channels · TrueForge-native runtime
        </p>
      </section>
      <section className="flex min-h-full items-center justify-center bg-white px-6 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-950 font-bold text-white">
              F
            </span>
            <span className="font-semibold text-zinc-950">ForgeRoom</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">
            Owner workspace
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Welcome back</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Sign in to coordinate coworkers and review governed actions.
          </p>
          {isFixtureMode ? (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Demo credentials are prefilled. Select Enter workspace to continue.
            </p>
          ) : null}
          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <label className="block text-xs font-medium text-zinc-700">
              Email
              <input
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm text-zinc-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              Password
              <input
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm text-zinc-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <HostButton
              className="w-full rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-60"
              type="submit"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Signing in…" : "Enter workspace"}
            </HostButton>
            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
          </form>
          <p className="mt-6 text-xs leading-5 text-zinc-400">
            Workspace access is bound to one owner identity in P0. Need help? Return to{" "}
            <Link to={loginPath()} className="font-medium text-zinc-600">
              login
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}

function LoginFeature({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
      <div className="font-medium text-white">{title}</div>
      <div className="mt-1 text-[11px] text-zinc-400">{detail}</div>
    </div>
  );
}
