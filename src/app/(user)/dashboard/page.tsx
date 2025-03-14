"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/utils/supabase/client";
import { OrderCard } from "@/components/OrderCard";
import { Order } from "@/types";
import { ClipboardIcon } from "lucide-react";
import { DocumentIcon } from "@/components/icons/DocumentIcon";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) return;

      try {
        const { data: ordersData, error: ordersError } = await supabase
          .from("orders")
          .select(
            `
            id, 
            repair_order_number, 
            earliest_available_time, 
            notes, 
            invoice,
            addresses:address_id(id, street_address, lat, lng),
            vehicles:vehicle_id(id, vin, ymm)
          `
          )
          .eq("user_id", user.id)
          .order("id", { ascending: false });

        if (ordersError) throw ordersError;

        const ordersWithDetails = await Promise.all(
          (ordersData || []).map(async (order) => {
            const { data: servicesData } = await supabase
              .from("order_services")
              .select("services:service_id(id, service_name)")
              .eq("order_id", order.id);

            const { data: uploadsData } = await supabase
              .from("order_uploads")
              .select("id, file_name, file_url")
              .eq("order_id", order.id);

            const { data: jobsData } = await supabase
              .from("jobs")
              .select(
                "id, status, requested_time, estimated_sched, job_duration, notes"
              )
              .eq("order_id", order.id);

            return {
              id: order.id,
              repair_order_number: order.repair_order_number,
              earliest_available_time: order.earliest_available_time,
              notes: order.notes,
              invoice: order.invoice,
              address: order.addresses,
              vehicle: order.vehicles,
              services: servicesData?.map((item) => item.services) || [],
              uploads: uploadsData || [],
              jobs: jobsData || [],
            } as unknown as Order;
          })
        );

        setOrders(ordersWithDetails);
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      fetchOrders();
    }
  }, [user, supabase]);

  if (loading || isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        Loading...
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-[768px]">
      <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
        <ClipboardIcon className="text-blue-600" />
        Your Orders
      </h2>

      {orders.length === 0 ? (
        <div className="p-12 text-center">
          <DocumentIcon className="text-gray-400" />
          <p className="text-gray-500 text-lg">
            You don't have any orders yet.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
