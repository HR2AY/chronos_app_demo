import { supabase } from "../lib/supabase";

export type Profile = { id: string; display_name: string | null; avatar_url: string | null; timezone: string; language: string; created_at: string; updated_at: string };
export type UserPreferences = { id: string; user_id: string; reminder_preferences: Record<string, unknown>; default_activity_difficulty: "easy" | "medium" | "hard"; voice_settings: Record<string, unknown>; created_at: string; updated_at: string };

export const UserStateRepository = {
  async getProfile(userId: string) {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error) throw error;
    return data as Profile;
  },
  async updateProfile(userId: string, patch: Partial<Pick<Profile, "display_name" | "avatar_url" | "timezone" | "language">>) {
    const { data, error } = await supabase.from("profiles").update(patch).eq("id", userId).select().single();
    if (error) throw error;
    return data as Profile;
  },
  async getPreferences(userId: string) {
    const { data, error } = await supabase.from("user_preferences").select("*").eq("user_id", userId).single();
    if (error) throw error;
    return data as UserPreferences;
  },
  async updatePreferences(userId: string, patch: Partial<Omit<UserPreferences, "id" | "user_id" | "created_at" | "updated_at">>) {
    const { data, error } = await supabase.from("user_preferences").update(patch).eq("user_id", userId).select().single();
    if (error) throw error;
    return data as UserPreferences;
  },
};
