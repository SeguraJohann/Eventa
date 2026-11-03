import { useState } from "react";
import { useAuth } from "./AuthContext";
import { useT } from "@/i18n";
import { LoginIcon } from "@/components/icons";
import styles from "./LoginScreen.module.css";

export function LoginScreen() {
  const { signIn } = useAuth();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    setError(false);
    try {
      await signIn();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <span className={styles.mark} />
        <h1 className={styles.title}>{t.auth.welcome}</h1>
        <p className={styles.description}>{t.auth.description}</p>
        <button className="btn pri" onClick={handleSignIn} disabled={loading} style={{ width: "100%" }}>
          <LoginIcon size={18} />
          {loading ? t.auth.signingIn : t.auth.signIn}
        </button>
        {error && <p className={styles.error}>{t.auth.error}</p>}
      </div>
    </div>
  );
}
