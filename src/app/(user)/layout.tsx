"use client";

import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useRouter, usePathname } from "next/navigation";

export default function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleNewOrder = () => {
    router.push("/order/new");
  };

  const handleDashboard = () => {
    router.push("/dashboard");
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto flex justify-between items-center h-16 px-4 max-w-[768px]">
          <div
            onClick={handleDashboard}
            className={`self-end px-4 py-4 cursor-pointer font-bold transition-colors rounded-t-md  ${
              pathname === "/dashboard"
                ? "text-gray-900  bg-gray-50"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            Dashboard
          </div>
          <div className="flex gap-3">
            {pathname !== "/order/new" && (
              <Button onClick={handleNewOrder}>
                <span className="mr-2">+</span> New Order
              </Button>
            )}

            <Button onClick={handleLogout} variant="destructive">
              Logout
            </Button>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
