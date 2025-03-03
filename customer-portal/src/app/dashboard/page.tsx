"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

type Order = { subDate: string }; // ✅ Defined the correct type instead of `any`

export default function Dashboard() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]); // ✅ Use the defined `Order` type
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ Redirect if not logged in (AFTER Firebase finishes loading)
  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
    }
  }, [user, loading, router]);

  // ✅ Fetch orders when user is available
  useEffect(() => {
    if (user) {
      fetch(`/api/orders-response`)
        .then((res) => res.json())
        .then((data) => {
          console.log("📦 Received Orders:", data);

          if (Array.isArray(data)) {
            setOrders(data);
          } else if (data.subDate) {
            setOrders([{ subDate: data.subDate }]); // ✅ Ensure correct format
          } else {
            console.error("❌ Unexpected order format:", data);
            setError("Failed to load orders.");
          }

          setLoadingOrders(false);
        })
        .catch((error) => {
          console.error("❌ Error loading orders:", error);
          setError("An error occurred while fetching orders.");
          setLoadingOrders(false);
        });
    }
  }, [user]);

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
              <p><strong>Submission Date:</strong> {order.subDate}</p> 
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4">No orders found.</p>
      )}
    </div>
  );
}
