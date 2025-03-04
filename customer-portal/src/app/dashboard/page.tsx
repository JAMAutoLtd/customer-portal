import React, { useEffect, useState } from "react";

const MAX_POLLS = 10; // Define MAX_POLLS

const Dashboard: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

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
              // Only update if we get more results than before
              if (data.length >= maxResultsCount) {
                maxResultsCount = data.length;
                setOrders(data);
                
                // Stop polling if we have results and have polled enough times
                if (data.length > 0 && localPollCount >= 3) { // Minimum 3 polls to ensure stability
                  clearInterval(intervalId);
                  setLoadingOrders(false);
                  console.log("✅ [Dashboard] Orders found and stable, stopping polling.");
                }
              } else {
                console.log("ℹ️ [Dashboard] Received fewer results than before, ignoring.");
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

        // Still maintain maximum polls safety net
        if (localPollCount >= MAX_POLLS) {
          console.log("⚠️ [Dashboard] Reached max polls, stopping.");
          setLoadingOrders(false);
          clearInterval(intervalId);
        }
      }, 5000);

      return () => clearInterval(intervalId);
    }
  }, [user]);

  return (
    <div>
      {/* Render your component content here */}
    </div>
  );
};

export default Dashboard; 