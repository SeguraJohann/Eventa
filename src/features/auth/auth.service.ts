import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { serverTimestamp, setDoc } from "firebase/firestore";
import { auth, googleProvider } from "@/config/firebase";
import { userDoc } from "@/lib/firebase/collections";
import { APP_CONFIG } from "@/config/app.config";
import { reportError } from "@/lib/utils/errors";

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
}

function toAuthUser(u: User): AuthUser {
  return { uid: u.uid, email: u.email ?? "", displayName: u.displayName ?? "", photoURL: u.photoURL };
}

export function watchAuth(cb: (user: AuthUser | null) => void): () => void {
  return onAuthStateChanged(auth, (u) => cb(u ? toAuthUser(u) : null));
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, googleProvider);
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

/** Keeps users/{uid} up to date (profile document). */
export function touchProfile(user: AuthUser): void {
  setDoc(
    userDoc(user.uid),
    {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      timezone: APP_CONFIG.timezone,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  ).catch(reportError);
}
