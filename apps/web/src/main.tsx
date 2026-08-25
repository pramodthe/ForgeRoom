import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HostButton } from "@forgeroom/ui-components";
import { APP_NAME } from "./app-name";
import "./styles.css";

const queryClient = new QueryClient();

function AppShell() {
  return (
    <main className="mx-auto max-w-xl p-8 text-zinc-900">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Channel workspace scaffold. Product UI is owned by later P0 tasks.
      </p>
      <Outlet />
    </main>
  );
}

function HomePage() {
  return (
    <p className="mt-6">
      <HostButton className="rounded border border-zinc-300 px-3 py-1.5 text-sm">
        Health checks live at <code>/health</code> on the API.
      </HostButton>
    </p>
  );
}

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root is missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
