import { HTMLAttributes } from "react";

export const CheckMarkIcon = ({ className }: HTMLAttributes<SVGElement>) => {
  return (
    <svg
      className={`h-5 w-5 text-green-500 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
};
