"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

type Order = {
  subDate: string;
  vehicleYear: string;
  vehicleMM: string;  // Make and Model
  serviceReq: string;
  orderComplete: string;
};

const MAX_POLLS = 10; // Define MAX_POLLS

const Dashboard: React.FC = () => {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  // If not logged in, redirect
  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      const safeEmail = user.email || "";
      let localPollCount = 0;
      let maxResultsCount = 0; // Track the maximum number of results we've seen
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
        localPollCount++;
        console.log(
          `🔄 [Dashboard] Polling /api/orders-response?email=${safeEmail}, attempt #${localPollCount}`
        );

        fetch(`/api/orders-response?email=${encodeURIComponent(safeEmail)}`)
          .then((res) => res.json())
          .then((data) => {
            console.log("📦 [Dashboard] Received Orders:", data);

            if (Array.isArray(data)) {
              if (data.length > 0) {
                // Data is now an array of complete order objects
                setOrders(data);
                clearInterval(intervalId);
                setLoadingOrders(false);
                console.log(`✅ [Dashboard] Received ${data.length} orders, stopping polls.`);
              } else {
                console.log("ℹ️ [Dashboard] Received empty array, continuing to poll...");
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

        // Safety net to stop polling after MAX_POLLS attempts even if no valid response
        if (localPollCount >= MAX_POLLS) {
          console.log("⚠️ [Dashboard] Reached max polls without valid response, stopping.");
          setLoadingOrders(false);
          clearInterval(intervalId);
        }
      }, 5000);

      return () => clearInterval(intervalId);
    }
  }, [user]);

  return (
    <div className="p-6 text-center">
      <h1 className="text-xl font-bold">
        Welcome, {user?.displayName || user?.email || "User"}!
      </h1>
      <button onClick={logout} className="mt-4 px-4 py-2 bg-red-500 text-white rounded">
        Logout
      </button>

      <h2 className="text-lg font-bold mt-6">Your Orders</h2>

      {error ? (
        <p className="mt-4 text-red-500">{error}</p>
      ) : loadingOrders ? (
        <p className="text-center mt-10">Loading...</p>
      ) : orders.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Submission Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vehicle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Services Required
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.map((order, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-left">
                    {order.subDate}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-left">
                    {order.vehicleYear} {order.vehicleMM}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-left">
                    {order.serviceReq || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-left">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      order.orderComplete.toLowerCase() === 'true' 
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {order.orderComplete.toLowerCase() === 'true' ? 'Complete' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4">No orders found.</p>
      )}
    </div>
  );
};

export default Dashboard; 