"use client"

import { useState, useEffect } from "react";
import { GOOGLE_MAPS_API_KEY } from "@/config/maps";

interface AddressAutocompleteProps {
  onAddressSelect: (address: string) => void;
}

declare global {
  interface Window {
    initializeAutocomplete?: () => void;
    google: any;
  }
}

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({ onAddressSelect }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      console.error('API Key is missing or invalid');
      setError("Google Maps API key is not configured");
      setIsLoading(false);
      return;
    }

    // Function to initialize autocomplete
    const initializeAutocomplete = () => {
      try {
        const input = document.getElementById("address-input") as HTMLInputElement;
        if (!input) {
          console.error('Address input element not found');
          return;
        }

        const autocomplete = new window.google.maps.places.Autocomplete(input, {
          componentRestrictions: { country: "ca" },
          fields: ["name", "formatted_address", "place_id", "types"],
          types: ["geocode", "establishment"]
        });

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          let fullAddress = place.formatted_address || '';
          
          if (place.types?.includes('establishment') && place.name && !fullAddress.startsWith(place.name)) {
            fullAddress = `${place.name}, ${fullAddress}`;
          }
          
          onAddressSelect(fullAddress);
        });

        setIsLoading(false);
      } catch (err) {
        console.error('Error initializing autocomplete:', err);
        setError("Failed to initialize address search");
        setIsLoading(false);
      }
    };

    // If Google Maps is already loaded, initialize with a small delay to ensure API is ready
    if (window.google?.maps) {
      setTimeout(initializeAutocomplete, 100);
      return;
    }

    // Set up the callback
    window.initializeAutocomplete = initializeAutocomplete;

    // Load Google Maps script if not already present
    const scriptId = 'google-maps-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&callback=initializeAutocomplete`;
      script.async = true;
      script.defer = true;
      
      script.onerror = () => {
        setError("Failed to load Google Maps");
        setIsLoading(false);
      };

      // Add a timeout to handle cases where the script fails to load or callback isn't called
      const timeoutId = setTimeout(() => {
        if (isLoading) {
          setError("Failed to initialize Google Maps");
          setIsLoading(false);
        }
      }, 10000); // 10 second timeout

      // Clean up timeout on successful load
      script.onload = () => clearTimeout(timeoutId);

      document.head.appendChild(script);
    }

    // Cleanup function
    return () => {
      if (window.initializeAutocomplete) {
        delete window.initializeAutocomplete;
      }
    };
  }, [onAddressSelect]);

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
        placeholder="Enter business name or address"
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        disabled={isLoading}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck="false"
        role="combobox"
        aria-autocomplete="list"
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
