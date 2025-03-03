"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      fetch(`/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("📤 Email sent to Zapier:", data);

          if (data.error) {
            throw new Error(data.error);
          }

          // Now fetch the orders after email is sent
          return fetch(`/api/orders-response`);
        })
        .then((res) => res.json())
        .then((data) => {
          console.log("📦 Received Orders:", data);

          if (Array.isArray(data)) {
            setOrders(data);
          } else if (data.subDate) {
            setOrders(Array.isArray(data.subDate) ? data.subDate : [data.subDate]);
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
          {orders.map((order: any, index) => (
            <li key={index} className="p-4 border-b">
              <p><strong>Submission Date:</strong> {order.subDate || "N/A"}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4">No orders found.</p>
      )}
    </div>
  );
}
