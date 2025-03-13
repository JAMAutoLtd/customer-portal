"use client";

import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import VehicleSelect from "@/components/VehicleSelect";

type ServiceCategory =
  | "Insurance Claim"
  | "Salvage Repair or Commercial"
  | "Residential or Personal";

type ADASService =
  | "Front Radar"
  | "Windshield Camera"
  | "360 Camera or Side Mirror"
  | "Blind Spot Monitor"
  | "Parking Assist Sensor";
type ModuleService =
  | "ECM"
  | "TCM"
  | "BCM"
  | "Airbag Module"
  | "Instrument Cluster"
  | "Front Radar"
  | "Windshield Camera"
  | "Blind Spot Monitor"
  | "Headlamp Module"
  | "Other";
type KeyService =
  | "All Keys Lost/No Working Keys"
  | "Adding Additional Spare Keys"
  | "Immobilizer Module Replaced";
type KeyType = "Push Button Start" | "Blade Ignition";
type KeySource = "JAM Providing" | "Customer Providing";

interface KeyProgrammingDetails {
  keyType: KeyType;
  keySource: KeySource;
  quantity: number;
}

interface ServicesRequired {
  adasCalibration?: ADASService[];
  airbagModuleReset?: boolean;
  moduleReplacement?: ModuleService[];
  keyProgramming?: {
    service: KeyService;
    keyType: KeyType;
    keySource: KeySource;
    quantity: number;
    partNumber?: string;
  };
  diagnosticOrWiring?: boolean;
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
  servicesRequired: ServicesRequired;
};

const OrderForm: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState<OrderFormData>({
    serviceCategory: "Residential or Personal",
    vin: "",
    vinUnknown: false,
    address: "",
    earliestDate: "",
    earliestTime: "",
    notes: "",
    customerName: "",
    customerEmail: "",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    servicesRequired: {},
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isCheckingVin, setIsCheckingVin] = useState(false);
  const [vinError, setVinError] = useState<string | null>(null);
  const [isVinValid, setIsVinValid] = useState(false);

  // Format time for 12-hour format
  const formatTime = (hour: number) => {
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour;
    return `${displayHour}:00 ${period}`;
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-CA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
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
    if (nextDate.getDay() === 0) {
      // Sunday
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (nextDate.getDay() === 6) {
      // Saturday
      nextDate.setDate(nextDate.getDate() + 2);
    }

    return nextDate.toISOString().split("T")[0];
  };

  // Get the next available time slot
  const getNextAvailableTime = () => {
    const now = new Date();
    const currentHour = now.getHours();

    // If current time is before 9 AM, return 9:00
    if (currentHour < 9) return "9:00";

    // If current time is after 5 PM, return 9:00
    if (currentHour >= 17) return "9:00";

    // Round up to the next hour
    const nextHour = currentHour + 1;
    return `${nextHour}:00`;
  };

  // Initialize form with default values and user info
  React.useEffect(() => {
    if (!loading && user) {
      setFormData((prev) => ({
        ...prev,
        earliestDate: getNextAvailableDate(),
        earliestTime: getNextAvailableTime(),
        customerName: user.user_metadata.full_name || "",
        customerEmail: user.email || "",
      }));
    }
  }, [loading, user]);

  // If not logged in, redirect
  React.useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
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
          customerName: user?.user_metadata.full_name || "",
          customerEmail: user?.email || "",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit order");
      }

      setSuccess(true);
      // Reset form
      setFormData({
        serviceCategory: "Residential or Personal",
        vin: "",
        vinUnknown: false,
        address: "",
        earliestDate: getNextAvailableDate(),
        earliestTime: getNextAvailableTime(),
        notes: "",
        customerName: user?.user_metadata.full_name || "",
        customerEmail: user?.email || "",
        vehicleYear: "",
        vehicleMake: "",
        vehicleModel: "",
        servicesRequired: {},
      });
    } catch (err) {
      setError("Failed to submit order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleVinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (value.length <= 17) {
      // VINs are 17 characters
      setFormData((prev) => ({
        ...prev,
        vin: value,
      }));
      setIsVinValid(false); // Reset validation when VIN changes
    }
  };

  const handleServiceChange = (
    serviceType: keyof ServicesRequired,
    value: any
  ) => {
    setFormData((prev) => ({
      ...prev,
      servicesRequired: {
        ...prev.servicesRequired,
        [serviceType]: value,
      },
    }));
  };

  const handleKeyProgrammingChange = (
    service: KeyService,
    keyType: KeyType,
    keySource: KeySource,
    quantity: number,
    partNumber?: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      servicesRequired: {
        ...prev.servicesRequired,
        keyProgramming: {
          service,
          keyType,
          keySource,
          quantity,
          ...(partNumber !== undefined ? { partNumber } : {}),
        },
      },
    }));
  };

  const handleVinCheck = async () => {
    setIsCheckingVin(true);
    setVinError(null);
    setIsVinValid(false);

    try {
      const response = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${formData.vin}?format=json`
      );
      const data = await response.json();

      // Check if the VIN is valid and returns a make
      const make = data.Results.find(
        (item: any) => item.Variable === "Make"
      )?.Value;
      const error = data.Results.find(
        (item: any) => item.Variable === "Error Code"
      )?.Value;

      if (error !== "0" || !make) {
        setVinError(
          'Invalid VIN. Please check the number or use "VIN Unknown" option.'
        );
        return;
      }

      // If valid, update the form with the decoded info
      const year = data.Results.find(
        (item: any) => item.Variable === "Model Year"
      )?.Value;
      const model = data.Results.find(
        (item: any) => item.Variable === "Model"
      )?.Value;

      setFormData((prev) => ({
        ...prev,
        vehicleYear: year || "",
        vehicleMake: make.toUpperCase(),
        vehicleModel: model?.toUpperCase() || "",
      }));

      setIsVinValid(true);
    } catch (err) {
      setVinError(
        'Failed to validate VIN. Please try again or use "VIN Unknown" option.'
      );
    } finally {
      setIsCheckingVin(false);
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
            {user?.user_metadata.full_name || user?.email}
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

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Service Category */}
        <div>
          <label
            htmlFor="serviceCategory"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Service Category
          </label>
          <select
            id="serviceCategory"
            name="serviceCategory"
            value={formData.serviceCategory}
            onChange={handleChange}
            required
            className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Residential or Personal">
              Residential or Personal
            </option>
            <option value="Insurance Claim">Insurance Claim</option>
            <option value="Salvage Repair or Commercial">
              Salvage Repair or Commercial
            </option>
          </select>
        </div>

        {/* VIN Section */}
        <div className="space-y-4">
          {!formData.vinUnknown && (
            <div>
              <label
                htmlFor="vin"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                VIN
              </label>
              <div className="flex space-x-3">
                <div className="flex-1">
                  <input
                    type="text"
                    id="vin"
                    name="vin"
                    value={formData.vin}
                    onChange={handleVinChange}
                    required
                    maxLength={17}
                    className={`w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      vinError ? "border-red-500" : ""
                    }`}
                    placeholder="Enter VIN"
                  />
                  {vinError && (
                    <p className="mt-2 text-sm text-red-600">{vinError}</p>
                  )}
                  {!vinError && formData.vehicleMake && (
                    <p className="mt-2 text-sm text-gray-600">
                      Vehicle: {formData.vehicleYear} {formData.vehicleMake}{" "}
                      {formData.vehicleModel}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleVinCheck}
                  disabled={formData.vin.length !== 17 || isCheckingVin}
                  className={`px-5 py-2.5 text-white rounded-md focus:outline-none focus:ring-2 whitespace-nowrap ${
                    isCheckingVin
                      ? "bg-gray-400 cursor-not-allowed"
                      : isVinValid
                      ? "bg-green-600 hover:bg-green-700 focus:ring-green-500"
                      : formData.vin.length === 17
                      ? "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
                >
                  {isCheckingVin ? (
                    <span className="inline-flex items-center">
                      Checking...
                    </span>
                  ) : isVinValid ? (
                    "Valid"
                  ) : (
                    "Check VIN"
                  )}
                </button>
              </div>
            </div>
          )}

          <div>
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
          <div>
            <VehicleSelect
              onVehicleSelect={({ year, make, model }) => {
                const updatedFormData = {
                  ...formData,
                  vehicleYear: year,
                  vehicleMake: make,
                  vehicleModel: model,
                };

                // If it's a Ford vehicle and key programming is already selected with "All Keys Lost"
                if (
                  make === "FORD" &&
                  formData.servicesRequired.keyProgramming?.service ===
                    "All Keys Lost/No Working Keys"
                ) {
                  updatedFormData.servicesRequired = {
                    ...formData.servicesRequired,
                    keyProgramming: {
                      ...formData.servicesRequired.keyProgramming,
                      quantity: Math.max(
                        2,
                        formData.servicesRequired.keyProgramming.quantity
                      ),
                    },
                  };
                }

                setFormData(updatedFormData);
              }}
            />
          </div>
        )}

        <div className="mt-8">
          <label
            htmlFor="address"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Address
          </label>
          <AddressAutocomplete
            onAddressSelect={(address: string) => {
              setFormData((prev) => ({
                ...prev,
                address,
              }));
            }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="earliestDate"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
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
                colorScheme: "light",
              }}
            />
            <p className="mt-1 text-sm text-gray-600">
              {formData.earliestDate ? formatDate(formData.earliestDate) : ""}
            </p>
          </div>

          <div>
            <label
              htmlFor="earliestTime"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
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
              {Array.from({ length: 9 }, (_, i) => i + 9).map((hour) => (
                <option key={hour} value={`${hour}:00`}>
                  {formatTime(hour)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
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

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Services Required</h2>

          {/* ADAS Calibration */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={!!formData.servicesRequired.adasCalibration}
                onChange={(e) =>
                  handleServiceChange(
                    "adasCalibration",
                    e.target.checked ? [] : undefined
                  )
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm font-medium">ADAS Calibration</span>
            </label>
            {formData.servicesRequired.adasCalibration && (
              <div className="ml-6 space-y-2">
                {(
                  [
                    "Front Radar",
                    "Windshield Camera",
                    "360 Camera or Side Mirror",
                    "Blind Spot Monitor",
                    "Parking Assist Sensor",
                  ] as ADASService[]
                ).map((service) => (
                  <label key={service} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.servicesRequired.adasCalibration?.includes(
                        service
                      )}
                      onChange={(e) => {
                        const current =
                          formData.servicesRequired.adasCalibration || [];
                        handleServiceChange(
                          "adasCalibration",
                          e.target.checked
                            ? [...current, service]
                            : current.filter((s) => s !== service)
                        );
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm">{service}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Airbag Module Reset */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={!!formData.servicesRequired.airbagModuleReset}
                onChange={(e) =>
                  handleServiceChange("airbagModuleReset", e.target.checked)
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm font-medium">Airbag Module Reset</span>
            </label>
          </div>

          {/* Module Replacement */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={!!formData.servicesRequired.moduleReplacement}
                onChange={(e) =>
                  handleServiceChange(
                    "moduleReplacement",
                    e.target.checked ? [] : undefined
                  )
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm font-medium">
                Module Replacement Programming or Calibration
              </span>
            </label>
            {formData.servicesRequired.moduleReplacement && (
              <div className="ml-6 space-y-2">
                {(
                  [
                    "ECM",
                    "TCM",
                    "BCM",
                    "Airbag Module",
                    "Instrument Cluster",
                    "Front Radar",
                    "Windshield Camera",
                    "Blind Spot Monitor",
                    "Headlamp Module",
                    "Other",
                  ] as ModuleService[]
                ).map((service) => (
                  <label key={service} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.servicesRequired.moduleReplacement?.includes(
                        service
                      )}
                      onChange={(e) => {
                        const current =
                          formData.servicesRequired.moduleReplacement || [];
                        handleServiceChange(
                          "moduleReplacement",
                          e.target.checked
                            ? [...current, service]
                            : current.filter((s) => s !== service)
                        );
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm">{service}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Key Programming */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={!!formData.servicesRequired.keyProgramming}
                onChange={(e) => {
                  const defaultQuantity =
                    formData.vehicleMake === "FORD" ? 2 : 1;
                  handleServiceChange(
                    "keyProgramming",
                    e.target.checked
                      ? {
                          service: "All Keys Lost/No Working Keys",
                          keyType: "Push Button Start",
                          keySource: "JAM Providing",
                          quantity: defaultQuantity,
                        }
                      : undefined
                  );
                }}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm font-medium">
                Keys or Immobilizer Programming
              </span>
            </label>
            {formData.servicesRequired.keyProgramming && (
              <div className="ml-6 space-y-4">
                {/* Service Type Selection */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Service Type
                  </label>
                  <div className="space-y-2">
                    {(
                      [
                        "Immobilizer Module Replaced",
                        "All Keys Lost/No Working Keys",
                        "Adding Additional Spare Keys",
                      ] as KeyService[]
                    ).map((service) => (
                      <label
                        key={service}
                        className="flex items-center space-x-2"
                      >
                        <input
                          type="radio"
                          checked={
                            formData.servicesRequired.keyProgramming
                              ?.service === service
                          }
                          onChange={() =>
                            handleKeyProgrammingChange(
                              service,
                              "Push Button Start",
                              "JAM Providing",
                              1
                            )
                          }
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <span className="text-sm">{service}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Key Type Selection (only for All Keys Lost and Adding Additional Spare Keys) */}
                {(formData.servicesRequired.keyProgramming.service ===
                  "All Keys Lost/No Working Keys" ||
                  formData.servicesRequired.keyProgramming.service ===
                    "Adding Additional Spare Keys") && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Key Type
                    </label>
                    <div className="space-y-2">
                      {(
                        ["Push Button Start", "Blade Ignition"] as KeyType[]
                      ).map((type) => (
                        <label
                          key={type}
                          className="flex items-center space-x-2"
                        >
                          <input
                            type="radio"
                            checked={
                              formData.servicesRequired.keyProgramming
                                ?.keyType === type
                            }
                            onChange={() =>
                              handleKeyProgrammingChange(
                                formData.servicesRequired.keyProgramming!
                                  .service,
                                type,
                                formData.servicesRequired.keyProgramming!
                                  .keySource,
                                formData.servicesRequired.keyProgramming!
                                  .quantity
                              )
                            }
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                          />
                          <span className="text-sm">{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Source Selection (only for All Keys Lost and Adding Additional Spare Keys) */}
                {(formData.servicesRequired.keyProgramming.service ===
                  "All Keys Lost/No Working Keys" ||
                  formData.servicesRequired.keyProgramming.service ===
                    "Adding Additional Spare Keys") && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Key Source
                    </label>
                    <div className="space-y-2">
                      {(
                        ["JAM Providing", "Customer Providing"] as KeySource[]
                      ).map((source) => (
                        <label
                          key={source}
                          className="flex items-center space-x-2"
                        >
                          <input
                            type="radio"
                            checked={
                              formData.servicesRequired.keyProgramming
                                ?.keySource === source
                            }
                            onChange={() =>
                              handleKeyProgrammingChange(
                                formData.servicesRequired.keyProgramming!
                                  .service,
                                formData.servicesRequired.keyProgramming!
                                  .keyType,
                                source,
                                formData.servicesRequired.keyProgramming!
                                  .quantity
                              )
                            }
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                          />
                          <span className="text-sm">{source}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quantity Selection (only for All Keys Lost and Adding Additional Spare Keys) */}
                {(() => {
                  const keyProgramming =
                    formData.servicesRequired.keyProgramming;
                  if (!keyProgramming?.service) return null;

                  if (
                    keyProgramming.service ===
                      "All Keys Lost/No Working Keys" ||
                    keyProgramming.service === "Adding Additional Spare Keys"
                  ) {
                    return (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Quantity{" "}
                          {formData.vehicleMake === "FORD" &&
                          keyProgramming.service ===
                            "All Keys Lost/No Working Keys"
                            ? "(minimum 2 required for Ford all-keys-lost)"
                            : "(max 3)"}
                        </label>
                        <input
                          type="number"
                          min={
                            formData.vehicleMake === "FORD" &&
                            keyProgramming.service ===
                              "All Keys Lost/No Working Keys"
                              ? "2"
                              : "1"
                          }
                          max="3"
                          value={
                            keyProgramming.quantity ||
                            (formData.vehicleMake === "FORD" &&
                            keyProgramming.service ===
                              "All Keys Lost/No Working Keys"
                              ? 2
                              : 1)
                          }
                          onChange={(e) => {
                            const newQuantity = parseInt(e.target.value);
                            if (
                              formData.vehicleMake === "FORD" &&
                              keyProgramming.service ===
                                "All Keys Lost/No Working Keys" &&
                              newQuantity < 2
                            ) {
                              return; // Don't allow less than 2 keys for Ford all keys lost
                            }
                            handleKeyProgrammingChange(
                              keyProgramming.service,
                              keyProgramming.keyType,
                              keyProgramming.keySource,
                              newQuantity
                            );
                          }}
                          className={`mt-1 block w-14 text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 ${
                            formData.vehicleMake === "FORD" &&
                            keyProgramming.service ===
                              "All Keys Lost/No Working Keys" &&
                            keyProgramming.quantity < 2
                              ? "border-red-500"
                              : ""
                          }`}
                        />
                        {formData.vehicleMake === "FORD" &&
                          keyProgramming.service ===
                            "All Keys Lost/No Working Keys" &&
                          keyProgramming.quantity < 2 && (
                            <p className="mt-1 text-sm text-red-600">
                              Ford all-keys-lost requires a minimum of 2 keys
                            </p>
                          )}
                        {(formData.vehicleMake === "KIA" ||
                          formData.vehicleMake === "HYUNDAI") && (
                          <div className="mt-4 space-y-2">
                            <p className="text-sm text-red-600">
                              Important: For {formData.vehicleMake} vehicles,
                              please contact your dealer with the VIN to obtain
                              the correct key part number before proceeding.
                            </p>
                            <div>
                              <label className="block text-sm font-medium text-gray-700">
                                Dealer Key Part Number
                              </label>
                              <input
                                type="text"
                                value={keyProgramming.partNumber || ""}
                                onChange={(e) => {
                                  const partNumber = e.target.value;
                                  handleKeyProgrammingChange(
                                    keyProgramming.service,
                                    keyProgramming.keyType,
                                    keyProgramming.keySource,
                                    keyProgramming.quantity,
                                    partNumber
                                  );
                                }}
                                placeholder="Enter dealer key part number"
                                className="mt-1 block w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                required={
                                  formData.vehicleMake === "KIA" ||
                                  formData.vehicleMake === "HYUNDAI"
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </div>

          {/* Diagnostic or Wiring Repair */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={!!formData.servicesRequired.diagnosticOrWiring}
                onChange={(e) =>
                  handleServiceChange("diagnosticOrWiring", e.target.checked)
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="text-sm font-medium">
                Diagnostic or Wiring Repair
              </span>
            </label>
          </div>
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
              isSubmitting ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isSubmitting ? "Submitting..." : "Submit Order"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default OrderForm;
