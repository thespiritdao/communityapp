"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Vote, Bell } from "lucide-react"; // Lucide for icons
import "src/styles/index.css";

export default function BottomNav() {
  const pathname = usePathname();

  // Hide BottomNav on the landing/login gate page (assuming it is at '/')
  if (pathname === "/") return null;

  return (
    <nav className="bottom-nav">
      <Link href="/home" className="bottom-nav-link">
        <Home />
      </Link>
      <Link href="/vote" className="bottom-nav-link">
        <Vote />
      </Link>
      <Link href="/notifications" className="bottom-nav-link">
        <Bell />
      </Link>
    </nav>
  );
}
