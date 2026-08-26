import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { HostButton } from "@forgeroom/ui-components";
import { login } from "../auth-api";
import { useSession } from "../auth/session-context";
import { defaultChannelId } from "../api/workspace-api";
import { postLoginDestination, loginPath } from "../routes/paths";

export function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const { session, isLoading, refreshSession } = useSession();
  const [email, setEmail] = useState("owner@example.test");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: async (nextSession) => {
      setError(null);
      await refreshSession();
      await navigate({
        to: postLoginDestination(search.redirect, nextSession.workspace_id, defaultChannelId()),
      });
    },
    onError: (err: Error) => setError(err.message),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    loginMutation.mutate();
  }

  if (isLoading) {
    return <p className="mt-6 text-sm text-zinc-600">Checking session…</p>;
  }

  if (session) {
    return (
      <Navigate
        to={postLoginDestination(search.redirect, session.workspace_id, defaultChannelId())}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center p-8">
      <h1 className="text-2xl font-semibold text-zinc-900">Sign in</h1>
      <p className="mt-2 text-sm text-zinc-600">Owner authentication for the channel workspace.</p>
      <form className="mt-6 space-y-3" onSubmit={onSubmit}>
        <label className="block text-sm">
          Email
          <input
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <HostButton className="rounded border border-zinc-300 px-3 py-1.5 text-sm" type="submit">
          Log in
        </HostButton>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </form>
      <p className="mt-6 text-xs text-zinc-500">
        Need help? Return to <Link to={loginPath()}>login</Link>.
      </p>
    </main>
  );
}

export function RootRedirect() {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return <p className="p-8 text-sm text-zinc-600">Loading session…</p>;
  }

  if (!session) {
    return <Navigate to={loginPath()} />;
  }

  return (
    <Navigate
      to={postLoginDestination(undefined, session.workspace_id, defaultChannelId())}
      replace
    />
  );
}
