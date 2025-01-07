"use client";

import React from "react";
import { ThemeProvider } from "next-themes";
import Examples from "src/app/chat/components/examples";
import { ModeToggle } from "src/app/chat/components/mode-toggle";
import Link from "next/link";
import { cn } from "src/app/chat/lib/utils";
import { buttonVariants } from "src/app/chat/components/ui/button";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import "./chatcss.css";

export default function ChatLayout({
    children,
}: {
  children: React.ReactNode;
}) {
  return (
  const [users, setUsers] = useState<UserData[]>([]);
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      useEffect(() => {
  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from("users") // Replace "users" with your actual user table name
      .select("id, name, avatar"); // Adjust columns based on your schema

    if (!error) {
      setUsers(data || []);
    }
  };

  fetchUsers();
}, []);

        {/* Main content */}
        <div className="z-10 border rounded-lg max-w-5xl w-full h-full text-sm flex">
          {children}
        </div>

        {/* Footer */}
        <div className="flex justify-between max-w-5xl w-full items-start text-xs md:text-sm text-muted-foreground">

        </div>
      </div>
    </ThemeProvider>
  );
}
