"use client";

import Link from "next/link";
import { MoreHorizontal, SquarePen } from "lucide-react";
import { cn } from "src/app/chat/lib/utils";
import { buttonVariants } from "src/app/chat/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "src/app/chat/components/ui/tooltip";
import { Avatar, AvatarImage } from "./ui/avatar";

interface SidebarProps {
  chats: {
    name: string;
    messages: { name: string; message: string; isLoading: boolean }[];
    avatar: string;
    variant: "secondary" | "ghost";
  }[];
  isCollapsed?: boolean;
}

export default function Sidebar({ chats, isCollapsed = false }: SidebarProps) {
  return (
    <div
      data-collapsed={isCollapsed}
      className="relative flex flex-col h-full bg-muted/10 dark:bg-muted/20 gap-4 p-2"
    >
      {!isCollapsed && (
        <div className="flex justify-between p-2 items-center">
          <div className="flex gap-2 items-center text-2xl">
            <p className="font-medium">Chats</p>
            <span className="text-zinc-300">({chats.length})</span>
          </div>

          <div className="flex gap-2">
            <Link
              href="#"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "h-9 w-9"
              )}
            >
              <MoreHorizontal size={20} />
            </Link>

            <Link
              href="#"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "h-9 w-9"
              )}
            >
              <SquarePen size={20} />
            </Link>
          </div>
        </div>
      )}

      <nav className="grid gap-1 px-2">
        {chats.map((chat, index) =>
          isCollapsed ? (
            <TooltipProvider key={index}>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    href="#"
                    className={cn(
                      buttonVariants({ variant: chat.variant, size: "icon" }),
                      "h-11 w-11 md:h-16 md:w-16"
                    )}
                  >
                    <Avatar>
                      <AvatarImage
                        src={chat.avatar}
                        alt={`${chat.name} avatar`}
                        className="w-10 h-10"
                      />
                    </Avatar>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{chat.name}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Link
              key={index}
              href="#"
              className={cn(
                buttonVariants({ variant: chat.variant, size: "xl" }),
                "flex items-center gap-4 p-2 rounded-md hover:bg-primary"
              )}
            >
              <Avatar>
                <AvatarImage
                  src={chat.avatar}
                  alt={`${chat.name} avatar`}
                  className="w-10 h-10"
                />
              </Avatar>
              <div className="flex flex-col max-w-28">
                <span>{chat.name}</span>
                {chat.messages.length > 0 && (
                  <span className="text-sm text-zinc-500 truncate">
                    {chat.messages[chat.messages.length - 1].name}:{" "}
                    {chat.messages[chat.messages.length - 1].isLoading
                      ? "Typing..."
                      : chat.messages[chat.messages.length - 1].message}
                  </span>
                )}
              </div>
            </Link>
          )
        )}
      </nav>
    </div>
  );
}
