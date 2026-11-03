import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { signInWithGoogle, signOutUser, touchProfile, watchAuth, type AuthUser } from "./auth.service";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const touched = useRef<string | null>(null);

  useEffect(
    () =>
      watchAuth((u) => {
        setUser(u);
        setLoading(false);
        // Guard against StrictMode double effects: write the profile once per uid.
        if (u && touched.current !== u.uid) {
          touched.current = u.uid;
          touchProfile(u);
        }
      }),
    [],
  );

  return <AuthContext.Provider value={{ user, loading, signIn: signInWithGoogle, signOutUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** uid of the signed-in user (only call below the login gate). */
export function useUid(): string {
  const { user } = useAuth();
  if (!user) throw new Error("useUid called without a signed-in user");
  return user.uid;
}
