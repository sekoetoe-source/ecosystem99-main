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
      const fetchProfile = async () => {
        const { data, error } = await supabase.from("profiles").select("full_name, is_approved, requested_role, requested_class_id, requested_nis").eq("id", userId).maybeSingle();
        if (error) {
          const { data: fb } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
          return { full_name: fb?.full_name, is_approved: true, requested_role: null, requested_class_id: null, requested_nis: null };
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

      const roles = (roleRows ?? []).map((r) => r.role as AppRole);
      const primaryRole: AppRole = roles.includes("admin")
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

      return {
        userId,
        email: session?.user.email ?? null,
        fullName: profile?.full_name ?? session?.user.email ?? "Pengguna",
        isApproved: profile ? (profile as any).is_approved : false,
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