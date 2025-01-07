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
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <div className="flex h-[calc(100dvh)] flex-col items-center justify-center p-4 md:px-24 py-32 gap-4">
        {/* Header */}
        <div className="flex justify-between max-w-5xl w-full items-center">
          <div className="flex gap-3 md:gap-6 items-center">
            <Link
              href="/chat"
              className="text-xl sm:text-2xl md:text-4xl font-bold text-gradient"
            >
              shadcn-chat
            </Link>
            <Examples />
          </div>
          <div className="flex gap-1 items-center">
            <Link
              href="https://github.com/jakobhoeg/shadcn-chat"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "size-7",
              )}
            >
              <GitHubLogoIcon className="size-7" />
            </Link>
            <ModeToggle />
          </div>
        </div>

        {/* Main content */}
        <div className="z-10 border rounded-lg max-w-5xl w-full h-full text-sm flex">
          {children}
        </div>

        {/* Footer */}
        <div className="flex justify-between max-w-5xl w-full items-start text-xs md:text-sm text-muted-foreground">
          <p className="max-w-[150px] sm:max-w-lg">
            Built by{" "}
            <a
              className="font-semibold"
              href="https://github.com/jakobhoeg/"
            >
              Jakob Hoeg
            </a>
            . Check out the{" "}
            <a
              className="font-semibold"
              href="https://docs-shadcn-chat.vercel.app/"
            >
              documentation
            </a>{" "}
            to get started.
          </p>
          <p className="max-w-[150px] sm:max-w-lg text-right">
            Source code available on{" "}
            <a
              className="font-semibold"
              href="https://github.com/jakobhoeg/shadcn-chat"
            >
              GitHub
            </a>
            .
          </p>
        </div>
      </div>
    </ThemeProvider>
  );
}
