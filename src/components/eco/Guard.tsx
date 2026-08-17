import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMe, type AppRole } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export function Guard({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { me, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!me || !me.isApproved) return <Navigate to="/auth" replace />;

  const allowed = me.roles.some((r) => roles.includes(r));
  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="surface-card max-w-md p-8 text-center">
          <h1 className="text-xl font-bold">Akses ditolak</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Akun Anda tidak memiliki izin untuk membuka halaman ini. Hubungi admin sekolah jika ini
            keliru.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}