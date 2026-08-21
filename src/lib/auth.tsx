import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "student" | "officer" | "admin" | "teacher";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
      queryClient.invalidateQueries({ queryKey: ["me"] });
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
      setTimeout(() => {
        if (window.location.hash.includes("access_token")) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      }, 500);
    }

    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export function useSession() {
  return useContext(AuthContext);
}

export type Me = {
  userId: string;
  email: string | null;
  fullName: string;
  isApproved: boolean;
  requestedRole: string | null;
  requestedClassId: string | null;
  requestedNis: string | null;
  roles: AppRole[];
  primaryRole: AppRole;
  student: { id: string; nis: string; full_name: string; class_id: string | null } | null;
  officer: { id: string; full_name: string; station: string; active: boolean } | null;
  teacherClass: { id: string; name: string } | null;
};

export function useMe() {
  const { session, loading } = useSession();
  const userId = session?.user.id ?? null;

  const query = useQuery<Me | null>({
    queryKey: ["me", userId],
    enabled: !loading,
    queryFn: async () => {
      if (!userId) return null;

      const userEmail = (session?.user.email ?? "").toLowerCase().trim();
      const isAdminEmail =
        userEmail === "admin.smpn99@gmail.com" ||
        userEmail === "admin@smpn99.sch.id" ||
        userEmail.startsWith("admin.") ||
        userEmail.startsWith("admin@");

      const fetchProfile = async () => {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, is_approved, requested_role, requested_class_id, requested_nis")
          .eq("id", userId)
          .maybeSingle();

        if (!data) {
          const defaultName = (session?.user?.user_metadata as any)?.["full_name"] || session?.user?.email || "Pengguna";
          const isApprovedInitial = isAdminEmail;
          const { data: inserted } = await supabase
            .from("profiles")
            .upsert({ id: userId, full_name: defaultName, is_approved: isApprovedInitial }, { onConflict: "id" })
            .select("full_name, is_approved, requested_role, requested_class_id, requested_nis")
            .single();
          return inserted ?? { full_name: defaultName, is_approved: isApprovedInitial, requested_role: null, requested_class_id: null, requested_nis: null };
        }
        return data;
      };

      const [profile, { data: roleRows }, { data: student }, { data: officer }] =
        await Promise.all([
          fetchProfile(),
          supabase.from("user_roles").select("role").eq("user_id", userId),
          supabase
            .from("students")
            .select("id, nis, full_name, class_id")
            .eq("profile_id", userId)
            .maybeSingle(),
          supabase
            .from("officers")
            .select("id, full_name, station, active")
            .eq("profile_id", userId)
            .maybeSingle(),
        ]);

      let roles = (roleRows ?? []).map((r) => r.role as AppRole);

      // Auto-assign / sync admin role if designated admin email
      if (isAdminEmail) {
        if (!roles.includes("admin")) {
          roles = ["admin", ...roles.filter((r) => r !== "admin")];
          supabase.from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" }).then();
        }
        if (!profile?.is_approved) {
          supabase.from("profiles").update({ is_approved: true }).eq("id", userId).then();
        }
      }

      const hasAdminRole = roles.includes("admin") || isAdminEmail;

      const primaryRole: AppRole = hasAdminRole
        ? "admin"
        : roles.includes("officer")
          ? "officer"
          : roles.includes("teacher")
            ? "teacher"
            : "student";

      let teacherClass = null;
      if (roles.includes("teacher")) {
        const { data } = await supabase
          .from("classes")
          .select("id, name")
          .eq("homeroom_teacher_id", userId)
          .maybeSingle();
        teacherClass = data;
      }

      const isApproved = hasAdminRole || (profile ? (profile as any).is_approved : false);

      return {
        userId,
        email: session?.user.email ?? null,
        fullName: profile?.full_name ?? session?.user.email ?? "Pengguna",
        isApproved,
        requestedRole: profile ? (profile as any).requested_role : null,
        requestedClassId: profile ? (profile as any).requested_class_id : null,
        requestedNis: profile ? (profile as any).requested_nis : null,
        roles,
        primaryRole,
        student: student ?? null,
        officer: officer ?? null,
        teacherClass,
      };
    },
  });

  return { me: query.data ?? null, isLoading: loading || query.isLoading };
}

export const homeForRole: Record<AppRole, string> = {
  student: "/siswa",
  officer: "/petugas",
  admin: "/admin",
  teacher: "/teacher",
};

export async function signOut() {
  await supabase.auth.signOut();
}