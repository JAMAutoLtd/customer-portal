"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Define types based on the database schema
type Address = {
  id: number;
  street_address: string;
  lat?: number;
  lng?: number;
};

type Vehicle = {
  id: number;
  vin?: string;
  ymm: string;
};

type Service = {
  id: number;
  service_name: string;
};

type Order = {
  id: number;
  repair_order_number?: string;
  earliest_available_time?: string;
  notes?: string;
  invoice?: number;
  address: Address;
  vehicle: Vehicle;
  services: Service[];
  uploads: {
    id: number;
    file_name: string;
    file_url: string;
  }[];
  jobs: {
    id: number;
    status: string;
    requested_time?: string;
    estimated_sched?: string;
    job_duration?: number;
    notes?: string;
  }[];
};

export default function Dashboard() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) return;

      try {
        // Fetch orders with related data
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

        // For each order, fetch related services, uploads, and jobs
        const ordersWithDetails = await Promise.all(
          (ordersData || []).map(async (order) => {
            // Fetch services for this order
            const { data: servicesData } = await supabase
              .from("order_services")
              .select("services:service_id(id, service_name)")
              .eq("order_id", order.id);

            // Fetch uploads for this order
            const { data: uploadsData } = await supabase
              .from("order_uploads")
              .select("id, file_name, file_url")
              .eq("order_id", order.id);

            // Fetch jobs for this order
            const { data: jobsData } = await supabase
              .from("jobs")
              .select(
                "id, status, requested_time, estimated_sched, job_duration, notes"
              )
              .eq("order_id", order.id);

            // Create a properly typed order object
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

  const handleNewOrder = () => {
    router.push("/order/new");
  };

  const handleLogout = async () => {
    await logout();
  };

  if (loading || isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        Loading...
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header with buttons */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Your Dashboard</h1>
        <div className="flex gap-4">
          <Button onClick={handleNewOrder}>New Order</Button>
          <Button variant="default" onClick={handleLogout}>
            Log Out
          </Button>
        </div>
      </div>

      {/* Orders list */}
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Your Orders</h2>

        {orders.length === 0 ? (
          <p className="text-gray-500">You don't have any orders yet.</p>
        ) : (
          orders.map((order) => (
            <Card key={order.id}>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-2">
                      Order #{order.id}
                    </h3>
                    {order.repair_order_number && (
                      <p>
                        <span className="font-medium">
                          Repair Order Number:
                        </span>{" "}
                        {order.repair_order_number}
                      </p>
                    )}
                    {order.earliest_available_time && (
                      <p>
                        <span className="font-medium">
                          Earliest Available Time:
                        </span>{" "}
                        {new Date(
                          order.earliest_available_time
                        ).toLocaleString()}
                      </p>
                    )}
                    {order.invoice && (
                      <p>
                        <span className="font-medium">Invoice:</span> $
                        {order.invoice}
                      </p>
                    )}
                    {order.notes && (
                      <p>
                        <span className="font-medium">Notes:</span>{" "}
                        {order.notes}
                      </p>
                    )}
                  </div>

                  <div>
                    <h4 className="font-medium mb-1">Vehicle Information</h4>
                    <p>{order.vehicle.ymm}</p>
                    {order.vehicle.vin && (
                      <p>
                        <span className="font-medium">VIN:</span>{" "}
                        {order.vehicle.vin}
                      </p>
                    )}

                    <h4 className="font-medium mt-4 mb-1">Address</h4>
                    <p>{order.address.street_address}</p>
                  </div>
                </div>

                {/* Services */}
                {order.services.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Services</h4>
                    <ul className="list-disc pl-5">
                      {order.services.map((service) => (
                        <li key={service.id}>{service.service_name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Jobs */}
                {order.jobs.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Jobs</h4>
                    <div className="space-y-2">
                      {order.jobs.map((job) => (
                        <div key={job.id} className="p-3 bg-gray-50 rounded">
                          <p>
                            <span className="font-medium">Status:</span>{" "}
                            {job.status}
                          </p>
                          {job.requested_time && (
                            <p>
                              <span className="font-medium">
                                Requested Time:
                              </span>{" "}
                              {new Date(job.requested_time).toLocaleString()}
                            </p>
                          )}
                          {job.estimated_sched && (
                            <p>
                              <span className="font-medium">
                                Estimated Schedule:
                              </span>{" "}
                              {new Date(job.estimated_sched).toLocaleString()}
                            </p>
                          )}
                          {job.job_duration && (
                            <p>
                              <span className="font-medium">Duration:</span>{" "}
                              {job.job_duration} minutes
                            </p>
                          )}
                          {job.notes && (
                            <p>
                              <span className="font-medium">Notes:</span>{" "}
                              {job.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Uploads/Attachments */}
                {order.uploads.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Attachments</h4>
                    <ul className="list-disc pl-5">
                      {order.uploads.map((upload) => (
                        <li key={upload.id}>
                          <a
                            href={upload.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {upload.file_name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
