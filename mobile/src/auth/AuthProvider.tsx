import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session, User } from "../services/authRepository";
import { AuthRepository } from "../services/authRepository";
import { isSupabaseConfigured } from "../lib/supabase";

type AuthContextValue = {
  currentUser: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setLoading] = useState(isSupabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    AuthRepository.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data } = AuthRepository.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      setAuthError(null);
    });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    currentUser: session?.user ?? null,
    session,
    isLoading,
    isAuthenticated: Boolean(session?.user),
    authError,
    signIn: async (email, password) => { const { error } = await AuthRepository.signIn(email, password); if (error) throw error; },
    signUp: async (email, password, displayName) => { const { error } = await AuthRepository.signUp(email, password, displayName); if (error) throw error; },
    signOut: async () => { const { error } = await AuthRepository.signOut(); if (error) throw error; setSession(null); },
  }), [session, isLoading, authError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (!isSupabaseConfigured) return <>{children}</>;
  if (auth.isLoading) return <View style={styles.center}><ActivityIndicator color="#b6f36b" /></View>;
  if (auth.isAuthenticated) return <>{children}</>;
  return <AuthScreen />;
}

function AuthScreen() {
  const { signIn, signUp, authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try { if (mode === "signIn") await signIn(email, password); else await signUp(email, password, displayName); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Authentication failed"); }
    finally { setBusy(false); }
  };
  return <View style={styles.container}>
    <Text style={styles.title}>Chronos</Text><Text style={styles.subtitle}>{mode === "signIn" ? "Welcome back" : "Create your account"}</Text>
    {mode === "signUp" && <TextInput style={styles.input} placeholder="Display name" placeholderTextColor="#88908a" value={displayName} onChangeText={setDisplayName} />}
    <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#88908a" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
    <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#88908a" secureTextEntry value={password} onChangeText={setPassword} />
    {(error || authError) && <Text style={styles.error}>{error || authError}</Text>}
    <Pressable style={styles.button} onPress={submit} disabled={busy}><Text style={styles.buttonText}>{busy ? "Please wait..." : mode === "signIn" ? "Sign in" : "Sign up"}</Text></Pressable>
    <Pressable onPress={() => setMode(mode === "signIn" ? "signUp" : "signIn")}><Text style={styles.link}>{mode === "signIn" ? "Need an account? Sign up" : "Already registered? Sign in"}</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0f1412" },
  container: { flex: 1, padding: 28, justifyContent: "center", backgroundColor: "#0f1412" },
  title: { color: "#f1f5ef", fontSize: 42, fontWeight: "700", marginBottom: 8 }, subtitle: { color: "#9ca89f", fontSize: 18, marginBottom: 28 },
  input: { backgroundColor: "#1b241f", borderColor: "#344138", borderWidth: 1, borderRadius: 8, color: "#f1f5ef", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12 },
  button: { backgroundColor: "#b6f36b", borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 8, marginBottom: 18 }, buttonText: { color: "#14200f", fontWeight: "700", fontSize: 16 },
  link: { color: "#b6f36b", textAlign: "center" }, error: { color: "#ff8f8f", marginBottom: 8 },
});
