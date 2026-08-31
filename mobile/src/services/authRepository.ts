import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export const AuthRepository = {
  async signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email: email.trim(), password });
  },
  async signUp(email: string, password: string, displayName?: string) {
    return supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: displayName?.trim() } } });
  },
  async signOut() {
    return supabase.auth.signOut();
  },
  async getSession() {
    return supabase.auth.getSession();
  },
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },
};

export type { Session, User };
