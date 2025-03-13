import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    // Check active session using our API endpoint
    const checkSession = async () => {
      try {
        // First try to get session from the server API
        const response = await fetch("/api/auth/session");
        const data = await response.json();

        let clientSession = null;

        if (data.session) {
          setUser(data.session.user);
        } else {
          // Fallback to client-side session check
          const {
            data: { session },
          } = await supabase.auth.getSession();
          clientSession = session;
          setUser(session?.user || null);
        }

        // If session exists but user state is null, refresh the page
        // This helps with hydration issues
        if ((data.session?.user || clientSession?.user) && !user) {
          router.refresh();
        }
      } catch (error) {
        console.error("Error checking session:", error);
        // Fallback to client-side session check
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          setUser(session?.user || null);
        } catch (e) {
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state changed:", event, session?.user?.email);
      setUser(session?.user || null);
      setLoading(false);

      // Force a router refresh when auth state changes
      // This ensures the UI updates with the new auth state
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        router.refresh();
      }
    });

    checkSession();

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Login failed");
      }

      const data = await response.json();

      // After successful login, check the session again
      const sessionResponse = await fetch("/api/auth/session");
      const sessionData = await sessionResponse.json();

      if (sessionData.session) {
        setUser(sessionData.session.user);
      } else {
        // Fallback to client-side session check
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setUser(session?.user || null);
      }

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Login failed",
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);

      // Call server-side logout endpoint
      await fetch("/api/auth/logout", { method: "POST" });

      // Also call Supabase signOut client-side
      await supabase.auth.signOut();

      setUser(null);
      router.push("/login");
      return { success: true };
    } catch (error) {
      console.error("Logout failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Logout failed",
      };
    } finally {
      setLoading(false);
    }
  };

  return { user, login, logout, loading };
}
