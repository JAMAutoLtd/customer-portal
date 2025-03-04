"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

type Order = { subDate: string };
export const dynamic = "force-dynamic";

export default function Dashboard() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // For limiting the poll attempts:
  const MAX_POLLS = 6;
  const [pollCount, setPollCount] = useState(0);

  // If not logged in, redirect
  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      const safeEmail = user.email || "";
      console.log("🟢 [Dashboard] Sending email to /api/orders:", safeEmail);

      // 1) POST email to /api/orders (to trigger Zapier)
      fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: safeEmail }),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("✅ [Dashboard] /api/orders response:", data);
        })
        .catch((err) => {
          console.error("❌ [Dashboard] Error calling /api/orders:", err);
        });

      // 2) Poll /api/orders-response?email=... every 5s, up to MAX_POLLS times
      const intervalId = setInterval(() => {
        setPollCount((prev) => prev + 1); // increment poll count
        console.log(
          `🔄 [Dashboard] Polling /api/orders-response?email=${safeEmail}, attempt #${
            pollCount + 1
          }`
        );

        fetch(`/api/orders-response?email=${encodeURIComponent(safeEmail)}`)
          .then((res) => res.json())
          .then((data) => {
            console.log("📦 [Dashboard] Received Orders:", data);

            if (Array.isArray(data)) {
              setOrders(data);
              if (data.length > 0) {
                // Found orders; stop polling
                clearInterval(intervalId);
                setLoadingOrders(false);
                console.log("✅ [Dashboard] Orders found, stopping polling.");
              }
            } else {
              console.error("❌ [Dashboard] Unexpected format:", data);
              setError("Failed to load orders.");
              setLoadingOrders(false);
              clearInterval(intervalId);
            }
          })
          .catch((error) => {
            console.error("❌ [Dashboard] Error loading orders:", error);
            setError("An error occurred while fetching orders.");
            setLoadingOrders(false);
            clearInterval(intervalId);
          });

        // If we reach MAX_POLLS without finding orders, stop and show "No orders found"
        if (pollCount + 1 >= MAX_POLLS) {
          console.log("⚠️ [Dashboard] Reached max polls, stopping.");
          setLoadingOrders(false);
          clearInterval(intervalId);
        }
      }, 5000);

      return () => clearInterval(intervalId);
    }
  }, [user, pollCount]);

  if (loading || loadingOrders) {
    return <p className="text-center mt-10">Loading...</p>;
  }

  if (!user) {
    return <p className="text-center mt-10">Redirecting to login...</p>;
  }

  return (
    <div className="p-6 text-center">
      <h1 className="text-xl font-bold">
        Welcome, {user.displayName || user.email || "User"}!
      </h1>
      <button onClick={logout} className="mt-4 px-4 py-2 bg-red-500 text-white rounded">
        Logout
      </button>

      <h2 className="text-lg font-bold mt-6">Your Orders</h2>

      {error ? (
        <p className="mt-4 text-red-500">{error}</p>
      ) : orders.length > 0 ? (
        <ul className="mt-4">
          {orders.map((order, index) => (
            <li key={index} className="p-4 border-b">
              <p>
                <strong>Submission Date:</strong> {order.subDate}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4">No orders found.</p>
      )}
    </div>
  );
}
