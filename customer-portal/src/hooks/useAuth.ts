import { useState, useEffect } from "react"; // ✅ Add `useEffect`
import { auth } from "@/lib/firebase";
import { signInWithPopup, GoogleAuthProvider, signOut, User, onAuthStateChanged } from "firebase/auth";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false); // ✅ Prevent multiple login attempts

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    if (loggingIn) return; // ✅ Prevent multiple popups
    setLoggingIn(true);

    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return { user, loginWithGoogle, logout, loading };
}
