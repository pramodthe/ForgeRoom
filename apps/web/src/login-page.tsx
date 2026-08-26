import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { HostButton } from "@forgeroom/ui-components";
import { fetchSession, login, logout } from "./auth-api";

export function LoginPage() {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
  });
  const [email, setEmail] = useState("owner@example.test");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const session = sessionQuery.data;
      if (!session) {
        return;
      }
      await logout(session.csrf_token);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    loginMutation.mutate();
  }

  if (sessionQuery.isLoading) {
    return <p className="mt-6 text-sm text-zinc-600">Checking session…</p>;
  }

  if (sessionQuery.data) {
    return (
      <section className="mt-6 space-y-3">
        <p className="text-sm text-zinc-700">
          Signed in as <strong>{sessionQuery.data.user.display_name}</strong> (
          {sessionQuery.data.user.email})
        </p>
        <HostButton
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
          onClick={() => logoutMutation.mutate()}
        >
          Log out
        </HostButton>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </section>
    );
  }

  return (
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
  );
}
