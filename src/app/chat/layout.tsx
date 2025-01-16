//src/app/chat/layout.tsx

"use client";

import React from "react";
import { ThemeProvider } from "next-themes";
import ChatTopbar from "./components/chat/chat-topbar";
import ChatList from "./components/chat/chat-list";
import { ModeToggle } from "./components/mode-toggle";
import "./chatcss.css";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <div className="flex flex-col h-screen">
        <ChatTopbar /> {/* Top bar with chat title */}
        <div className="flex flex-grow">
          <ChatList /> {/* Sidebar for chats */}
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </ThemeProvider>
  );
}
