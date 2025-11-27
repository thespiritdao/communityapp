// src/app/layout-minimal.tsx
"use client";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="relative min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}