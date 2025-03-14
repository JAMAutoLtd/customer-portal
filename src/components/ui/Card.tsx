import * as React from "react";

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-4 shadow hover:shadow-md transition-shadow duration-300">
      {children}
    </div>
  );
}

export function CardContent({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
