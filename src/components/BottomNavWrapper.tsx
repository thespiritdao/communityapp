// src/components/BottomNavWrapper.tsx
"use client";

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";

export default function BottomNavWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Assume the login/landing page is at "/"
  const showBottomNav = pathname !== "/";

  return (
    <>
      {children}
      {showBottomNav && <BottomNav />}
    </>
  );
}
