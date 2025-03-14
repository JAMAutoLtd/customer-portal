import * as React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "secondary";
}

export function Button({
  variant = "default",
  className,
  ...props
}: ButtonProps) {
  const baseStyle =
    "px-4 py-2 rounded text-white font-bold whitespace-nowrap h-[40px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-300";
  const variantStyle =
    variant === "destructive"
      ? "bg-rose-500 hover:bg-rose-600"
      : variant === "secondary"
      ? "bg-gray-300 hover:bg-gray-400"
      : "bg-[#4654a3] hover:bg-[#4654a3]/80";

  return (
    <button
      className={`${baseStyle} ${variantStyle} ${className}`}
      {...props}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}
