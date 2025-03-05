"use client"; // Required for Next.js 13+ to run in the browser

import { useState, useEffect } from "react";
import { GOOGLE_MAPS_API_KEY } from "@/config/maps";

interface AddressAutocompleteProps {
  onAddressSelect: (address: string) => void;
}

declare global {
  interface Window {
    _googleMapsCallback?: () => void;
    google: any;
  }
}

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({ onAddressSelect }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // More detailed debugging
    console.log('Debug Info:', {
      apiKey: GOOGLE_MAPS_API_KEY,
      apiKeyExists: !!GOOGLE_MAPS_API_KEY,
      apiKeyLength: GOOGLE_MAPS_API_KEY?.length,
      windowGoogle: !!window.google,
      windowGoogleMaps: !!window.google?.maps,
      env: process.env.NODE_ENV
    });

    if (!GOOGLE_MAPS_API_KEY) {
      console.error('API Key is missing or invalid');
      setError("Google Maps API key is not configured");
      setIsLoading(false);
      return;
    }

    // Check if script is already loaded
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      console.log('Google Maps script already exists, initializing...');
      initializeAutocomplete();
      return;
    }

    // Load the script if not already loaded
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&callback=_googleMapsCallback`;
    script.async = true;
    script.defer = true;
    window._googleMapsCallback = initializeAutocomplete;
    
    script.onerror = (error) => {
      console.error('Google Maps script failed to load:', error);
      setError("Failed to load Google Maps");
      setIsLoading(false);
    };

    document.head.appendChild(script);

    return () => {
      window._googleMapsCallback = undefined;
      const scriptToRemove = document.querySelector(`script[src*="maps.googleapis.com"]`);
      if (scriptToRemove) {
        document.head.removeChild(scriptToRemove);
      }
    };
  }, []);

  const initializeAutocomplete = () => {
    try {
      const input = document.getElementById("address-input") as HTMLInputElement;
      if (!input) {
        console.error('Address input element not found');
        return;
      }

      const autocomplete = new window.google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: "ca" },
        fields: ["formatted_address"],
        types: ["address"]
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.formatted_address) {
          onAddressSelect(place.formatted_address);
        }
      });

      setIsLoading(false);
      console.log('Autocomplete initialized successfully');
    } catch (err) {
      console.error('Error initializing autocomplete:', err);
      setError("Failed to initialize address search");
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="w-full px-3 py-2 border border-red-300 rounded-md text-red-600 bg-red-50">
        {error} (Check console for details)
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        id="address-input"
        type="text"
        placeholder="Enter address"
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        disabled={isLoading}
      />
      {isLoading && (
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
