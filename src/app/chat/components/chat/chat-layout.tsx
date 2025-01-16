//src/app/chat/components/chat/chat-layout.tsx

"use client";

import React, { useState, useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { supabase } from "src/utils/supabaseClient"; // Ensure this utility is set up correctly
import "./chatcss.css";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("wallet_address, first_name, last_name, profile_picture");

        if (error) {
          setError(error.message);
        } else if (data) {
          setUsers(data);
        }
      } catch (err) {
        setError("An unexpected error occurred. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <div className="flex flex-col items-center justify-center h-full">
        <div className="z-10 border rounded-lg max-w-5xl w-full h-full text-sm flex p-4">
          {isLoading ? (
            <p className="text-muted-foreground">Loading users...</p>
          ) : error ? (
            <p className="text-red-500">{error}</p>
          ) : (
            children
          )}
        </div>
        <footer className="flex justify-between max-w-5xl w-full items-center text-xs md:text-sm text-muted-foreground mt-4">
          <p>© 2025 SpiritDAO</p>
          <p>
            <a
              href="https://github.com/your-repo"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              GitHub
            </a>
          </p>
        </footer>
      </div>
    </ThemeProvider>
  );
}
