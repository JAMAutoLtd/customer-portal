"use client"; // Required for Next.js 13+ to run in the browser

import { useState, useEffect, useRef } from "react";
import { LoadScript, StandaloneSearchBox } from "@react-google-maps/api";

const libraries: ["places"] = ["places"];

interface AddressAutocompleteProps {
  onAddressSelect: (address: string) => void;
}

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({ onAddressSelect }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handlePlaceSelect = () => {
    if (!inputRef.current) return;
    const places = inputRef.current.value;
    onAddressSelect(places); // Pass selected address to parent
  };

  return (
    <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!} libraries={libraries}>
      <StandaloneSearchBox onLoad={(ref) => (inputRef.current = ref as HTMLInputElement)} onPlacesChanged={handlePlaceSelect}>
        <input
          type="text"
          placeholder="Enter address"
          className="w-full p-2 border rounded"
          ref={inputRef}
        />
      </StandaloneSearchBox>
    </LoadScript>
  );
};

export default AddressAutocomplete;
