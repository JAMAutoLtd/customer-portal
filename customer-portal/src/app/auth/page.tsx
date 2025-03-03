"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const { user, loginWithGoogle, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push("/dashboard"); // ✅ Redirect to dashboard after login
    }
  }, [user, router]);

  if (user) {
    return <p className="text-center mt-10">Redirecting to dashboard...</p>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-2xl font-bold mb-4">Login</h1>
      <button onClick={loginWithGoogle} className="px-4 py-2 bg-blue-500 text-white rounded">
        Sign in with Google
      </button>
    </div>
  );
}
