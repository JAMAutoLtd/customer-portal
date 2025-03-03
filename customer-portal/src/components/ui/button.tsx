import * as React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive";
}

export function Button({ variant = "default", className, ...props }: ButtonProps) {
  const baseStyle = "px-4 py-2 rounded text-white font-bold";
  const variantStyle =
    variant === "destructive" ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600";

  return (
    <button className={`${baseStyle} ${variantStyle} ${className}`} {...props}>
      {props.children}
    </button>
  );
}
