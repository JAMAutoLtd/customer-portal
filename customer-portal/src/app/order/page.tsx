"use client";

import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import VehicleSelect from "@/components/VehicleSelect";

type ServiceCategory = 'Insurance Claim' | 'Salvage Repair or Commercial' | 'Residential or Personal';

interface AddressAutocompleteProps {
  onAddressSelect: (address: string) => void;
}

type OrderFormData = {
  serviceCategory: ServiceCategory;
  vin: string;
  vinUnknown: boolean;
  address: string;
  earliestDate: string;
  earliestTime: string;
  notes: string;
  customerName: string;
  customerEmail: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
};

const OrderForm: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState<OrderFormData>({
    serviceCategory: 'Residential or Personal',
    vin: '',
    vinUnknown: false,
    address: '',
    earliestDate: '',
    earliestTime: '',
    notes: '',
    customerName: '',
    customerEmail: '',
    vehicleYear: '',
    vehicleMake: '',
    vehicleModel: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Mock data for vehicle makes and models (replace with API call later)
  const vehicleMakes = [
    'Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW', 'Mercedes-Benz', 'Audi',
    'Volkswagen', 'Nissan', 'Hyundai', 'Kia', 'Subaru', 'Mazda', 'Lexus'
  ];

  const vehicleModels: Record<string, string[]> = {
    'Toyota': ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Sienna'],
    'Honda': ['Civic', 'Accord', 'CR-V', 'Pilot', 'Odyssey'],
    'Ford': ['F-150', 'Explorer', 'Escape', 'Edge', 'Mustang'],
    // Add more makes and models as needed
  };

  const years = Array.from({ length: 25 }, (_, i) => (new Date().getFullYear() - i).toString());

  // Format time for 12-hour format
  const formatTime = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Check if a date is a weekend
  const isWeekend = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDay();
    return day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
  };

  // Handle date change with weekend validation
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    if (!isWeekend(date)) {
      handleChange(e);
    }
  };

  // Get the next available date (excluding weekends)
  const getNextAvailableDate = () => {
    const today = new Date();
    let nextDate = new Date(today);
    
    // If it's a weekend, move to next Monday
    if (nextDate.getDay() === 0) { // Sunday
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (nextDate.getDay() === 6) { // Saturday
      nextDate.setDate(nextDate.getDate() + 2);
    }
    
    return nextDate.toISOString().split('T')[0];
  };

  // Get the next available time slot
  const getNextAvailableTime = () => {
    const now = new Date();
    const currentHour = now.getHours();
    
    // If current time is before 9 AM, return 9:00
    if (currentHour < 9) return '9:00';
    
    // If current time is after 5 PM, return 9:00
    if (currentHour >= 17) return '9:00';
    
    // Round up to the next hour
    const nextHour = currentHour + 1;
    return `${nextHour}:00`;
  };

  // Initialize form with default values and user info
  React.useEffect(() => {
    if (!loading && user) {
      setFormData(prev => ({
        ...prev,
        earliestDate: getNextAvailableDate(),
        earliestTime: getNextAvailableTime(),
        customerName: user.displayName || '',
        customerEmail: user.email || ''
      }));
    }
  }, [loading, user]);

  // If not logged in, redirect
  React.useEffect(() => {
    if (!loading && !user) {
      router.push("/auth");
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/order-submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          customerName: user?.displayName || '',
          customerEmail: user?.email || '',
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit order");
      }

      setSuccess(true);
      // Reset form
      setFormData({
        serviceCategory: 'Residential or Personal',
        vin: '',
        vinUnknown: false,
        address: '',
        earliestDate: getNextAvailableDate(),
        earliestTime: getNextAvailableTime(),
        notes: '',
        customerName: user?.displayName || '',
        customerEmail: user?.email || '',
        vehicleYear: '',
        vehicleMake: '',
        vehicleModel: '',
      });
    } catch (err) {
      setError("Failed to submit order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleVinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (value.length <= 17) { // VINs are 17 characters
      setFormData(prev => ({
        ...prev,
        vin: value
      }));
    }
  };

  if (loading) {
    return <div className="p-6 text-center">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Submit New Order</h1>
          <p className="text-gray-600 mt-1">
            {user?.displayName || user?.email}
          </p>
        </div>
        <div className="flex space-x-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Dashboard
          </button>
          <button
            onClick={logout}
            className="px-4 py-2 text-white bg-red-500 rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Logout
          </button>
        </div>
      </div>
      
      {success && (
        <div className="mb-4 p-4 bg-green-100 text-green-800 rounded-lg">
          Order submitted successfully! You can view it in your dashboard.
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-800 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="serviceCategory" className="block text-sm font-medium text-gray-700 mb-1">
              Service Category
            </label>
            <select
              id="serviceCategory"
              name="serviceCategory"
              value={formData.serviceCategory}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Residential or Personal">Residential or Personal</option>
              <option value="Insurance Claim">Insurance Claim</option>
              <option value="Salvage Repair or Commercial">Salvage Repair or Commercial</option>
            </select>
          </div>

          {!formData.vinUnknown && (
            <div>
              <label htmlFor="vin" className="block text-sm font-medium text-gray-700 mb-1">
                VIN
              </label>
              <input
                type="text"
                id="vin"
                name="vin"
                value={formData.vin}
                onChange={handleVinChange}
                required
                maxLength={17}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter VIN"
              />
            </div>
          )}

          <div className="flex items-end">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="vinUnknown"
                name="vinUnknown"
                checked={formData.vinUnknown}
                onChange={handleChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">VIN Unknown</span>
            </label>
          </div>
        </div>

        {formData.vinUnknown && (
          <VehicleSelect
            onVehicleSelect={({ year, make, model }) => {
              setFormData(prev => ({
                ...prev,
                vehicleYear: year,
                vehicleMake: make,
                vehicleModel: model
              }));
            }}
          />
        )}

        <div>
          <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
            Address
          </label>
          <AddressAutocomplete 
            onAddressSelect={(address: string) => {
              setFormData(prev => ({
                ...prev,
                address
              }));
            }} 
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="earliestDate" className="block text-sm font-medium text-gray-700 mb-1">
              Earliest Available Date
            </label>
            <input
              type="date"
              id="earliestDate"
              name="earliestDate"
              value={formData.earliestDate}
              onChange={handleDateChange}
              min={getNextAvailableDate()}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              style={{
                colorScheme: 'light'
              }}
            />
            <p className="mt-1 text-sm text-gray-600">
              {formData.earliestDate ? formatDate(formData.earliestDate) : ''}
            </p>
          </div>

          <div>
            <label htmlFor="earliestTime" className="block text-sm font-medium text-gray-700 mb-1">
              Preferred Time
            </label>
            <select
              id="earliestTime"
              name="earliestTime"
              value={formData.earliestTime}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Time</option>
              {Array.from({ length: 9 }, (_, i) => i + 9).map(hour => (
                <option key={hour} value={`${hour}:00`}>
                  {formatTime(hour)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Additional Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Any additional information or special requests..."
          />
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Order'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default OrderForm; 