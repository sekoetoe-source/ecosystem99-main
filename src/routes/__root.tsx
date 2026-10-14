import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../lib/auth";
import { Toaster } from "../components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function isChunkLoadError(error: Error) {
  const message = (error?.message || String(error)).toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("loading chunk") ||
    message.includes("chunkloaderror") ||
    message.includes("failed to load module script") ||
    (message.includes("404") && message.includes("module"))
  );
}

function ErrorComponent({ error }: { error: Error; reset: () => void }) {
  console.error(error);
  const isChunkError = isChunkLoadError(error);

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });

    if (isChunkError) {
      try {
        const storageKey = `chunk_reload_count:${import.meta.env.VITE_APP_VERSION || "current"}`;
        const count = Number(sessionStorage.getItem(storageKey) || 0);
        if (count < 1) {
          sessionStorage.setItem(storageKey, String(count + 1));
          window.location.replace(`${window.location.pathname}${window.location.search}${window.location.hash}`);
        }
      } catch {
        // Keep the error boundary available when browser storage is disabled.
      }
    }
  }, [error, isChunkError]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {isChunkError ? "Tampilan perlu diperbarui" : "Halaman gagal dimuat"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isChunkError
            ? "Versi aplikasi berubah saat halaman ini terbuka. Muat ulang untuk membuka versi terbaru."
            : "Terjadi kendala saat membuka halaman. Buka detail error untuk mengetahui penyebabnya."}
        </p>
        {!isChunkError && (
          <details className="mt-4 rounded-lg border border-border bg-white p-3 text-left text-xs text-muted-foreground">
            <summary className="cursor-pointer font-semibold">Detail error</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">{error.message || String(error)}</pre>
          </details>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              try {
                sessionStorage.removeItem(`chunk_reload_count:${import.meta.env.VITE_APP_VERSION || "current"}`);
              } catch {
                // Reload remains available when storage is disabled.
              }
              window.location.assign(`${window.location.pathname}${window.location.search}${window.location.hash}`);
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Muat Ulang Halaman
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Kembali ke Beranda
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ecosystem99 — Website Resmi Ecosystem 99 SMPN 99 Jakarta" },
      {
        name: "description",
        content:
          "ecosystem99 (ecosystem99.web.id) adalah platform resmi Eco-Points & sekolah bebas sampah SMP Negeri 99 Jakarta. Scan tumbler & kotak makan, kumpulkan poin, dan raih reward.",
      },
      {
        name: "keywords",
        content:
          "ecosystem99, ecosystem99.web.id, ecosystem 99, ecosystem99 web id, smpn 99 jakarta, smp 99 jakarta, eco points smpn 99",
      },
      { name: "author", content: "SMP Negeri 99 Jakarta" },
      { name: "google-site-verification", content: "google30611e22a79a9eea" },
      { property: "og:title", content: "ecosystem99 — Website Resmi Ecosystem 99 SMPN 99 Jakarta" },
      {
        property: "og:description",
        content:
          "ecosystem99 (ecosystem99.web.id) adalah platform resmi Eco-Points & sekolah bebas sampah SMP Negeri 99 Jakarta.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://ecosystem99.web.id/" },
      { property: "og:site_name", content: "ecosystem99" },
      { property: "og:image", content: "https://ecosystem99.web.id/logo-smpn99.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "ecosystem99 — Website Resmi Ecosystem 99 SMPN 99 Jakarta" },
      {
        name: "twitter:description",
        content:
          "Platform resmi Eco-Points & sekolah bebas sampah SMP Negeri 99 Jakarta (ecosystem99.web.id).",
      },
      { name: "twitter:image", content: "https://ecosystem99.web.id/logo-smpn99.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "canonical", href: "https://ecosystem99.web.id/" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ecosystem99",
    alternateName: [
      "Ecosystem99",
      "Ecosystem 99",
      "ecosystem99.web.id",
      "School Ecosystem SMPN 99 Jakarta",
    ],
    url: "https://ecosystem99.web.id/",
    description:
      "ecosystem99 adalah platform resmi Eco-Points & sekolah bebas sampah SMP Negeri 99 Jakarta.",
    publisher: {
      "@type": "Organization",
      name: "SMP Negeri 99 Jakarta",
      url: "https://ecosystem99.web.id/",
      logo: "https://ecosystem99.web.id/logo-smpn99.png",
    },
  };

  return (
    <html lang="id">
      <head>
        <HeadContent />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
