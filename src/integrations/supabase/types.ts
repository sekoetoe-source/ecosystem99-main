export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      classes: {
        Row: {
          created_at: string
          homeroom_teacher: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          homeroom_teacher?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          homeroom_teacher?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      eco_items: {
        Row: {
          active: boolean
          co2_grams: number
          code: string
          label: string
          points: number
        }
        Insert: {
          active?: boolean
          co2_grams?: number
          code: string
          label: string
          points?: number
        }
        Update: {
          active?: boolean
          co2_grams?: number
          code?: string
          label?: string
          points?: number
        }
        Relationships: []
      }
      officers: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          profile_id: string | null
          station: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name: string
          id?: string
          profile_id?: string | null
          station?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          profile_id?: string | null
          station?: string
        }
        Relationships: [
          {
            foreignKeyName: "officers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      redemptions: {
        Row: {
          created_at: string
          id: string
          points_spent: number
          reward_id: string
          status: Database["public"]["Enums"]["redemption_status"]
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          points_spent: number
          reward_id: string
          status?: Database["public"]["Enums"]["redemption_status"]
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          points_spent?: number
          reward_id?: string
          status?: Database["public"]["Enums"]["redemption_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_scores"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "redemptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean
          cost_points: number
          created_at: string
          description: string | null
          id: string
          name: string
          stock: number
        }
        Insert: {
          active?: boolean
          cost_points?: number
          created_at?: string
          description?: string | null
          id?: string
          name: string
          stock?: number
        }
        Update: {
          active?: boolean
          cost_points?: number
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          stock?: number
        }
        Relationships: []
      }
      students: {
        Row: {
          active: boolean
          avatar_url: string | null
          class_id: string | null
          created_at: string
          full_name: string
          id: string
          nis: string
          profile_id: string | null
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          class_id?: string | null
          created_at?: string
          full_name: string
          id?: string
          nis: string
          profile_id?: string | null
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          class_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          nis?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_scores"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      validation_items: {
        Row: {
          day: string
          id: string
          item_code: string
          points: number
          student_id: string
          validation_id: string
        }
        Insert: {
          day?: string
          id?: string
          item_code: string
          points?: number
          student_id: string
          validation_id: string
        }
        Update: {
          day?: string
          id?: string
          item_code?: string
          points?: number
          student_id?: string
          validation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_items_item_code_fkey"
            columns: ["item_code"]
            isOneToOne: false
            referencedRelation: "eco_items"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "validation_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_scores"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "validation_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_items_validation_id_fkey"
            columns: ["validation_id"]
            isOneToOne: false
            referencedRelation: "validations"
            referencedColumns: ["id"]
          },
        ]
      }
      validations: {
        Row: {
          created_at: string
          id: string
          note: string | null
          officer_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: Database["public"]["Enums"]["validation_source"]
          station: string | null
          status: Database["public"]["Enums"]["validation_status"]
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          officer_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["validation_source"]
          station?: string | null
          status?: Database["public"]["Enums"]["validation_status"]
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          officer_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["validation_source"]
          station?: string | null
          status?: Database["public"]["Enums"]["validation_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validations_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "officers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_scores"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "validations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      class_scores: {
        Row: {
          avg_points: number | null
          class_id: string | null
          class_name: string | null
          student_count: number | null
          total_points: number | null
        }
        Relationships: []
      }
      student_scores: {
        Row: {
          avatar_url: string | null
          balance_points: number | null
          class_id: string | null
          class_name: string | null
          earned_points: number | null
          full_name: string | null
          nis: string | null
          spent_points: number | null
          student_id: string | null
          total_items: number | null
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "class_scores"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_officer_id: { Args: never; Returns: string }
      current_student_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      student_streak: { Args: { _student_id: string }; Returns: number }
    }
    Enums: {
      app_role: "student" | "officer" | "admin"
      redemption_status: "pending" | "fulfilled" | "cancelled"
      validation_source: "scan" | "manual"
      validation_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["student", "officer", "admin"],
      redemption_status: ["pending", "fulfilled", "cancelled"],
      validation_source: ["scan", "manual"],
      validation_status: ["pending", "approved", "rejected"],
    },
  },
} as const
