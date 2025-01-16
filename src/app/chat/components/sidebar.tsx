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
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

interface Chat {
  wallet_address: string;
  name: string; // Derived from `desired_involvement` or similar field
  avatar?: string; // Optional field for profile picture
  lastMessage?: string; // The last message content
  lastMessageSender?: string; // Name of the sender of the last message
  isTyping?: boolean; // If the user is currently typing
}

interface SidebarProps {
  chats: Chat[];
  isCollapsed?: boolean;
  onSelectChat: (walletAddress: string) => void; // Callback to set selected user
}

export function Sidebar({
  chats,
  isCollapsed = false,
  onSelectChat,
}: SidebarProps) {
  return (
    <div
      data-collapsed={isCollapsed}
      className={cn(
        "relative flex flex-col h-full bg-muted/10 dark:bg-muted/20 gap-4 p-2",
        isCollapsed ? "w-16" : "w-64"
      )}
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
                  <button
                    onClick={() => onSelectChat(chat.wallet_address)}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "icon" }),
                      "h-11 w-11 md:h-16 md:w-16"
                    )}
                  >
                    <Avatar>
                      {chat.avatar ? (
                        <AvatarImage
                          src={chat.avatar}
                          alt={`${chat.name}'s avatar`}
                          className="w-10 h-10"
                        />
                      ) : (
                        <AvatarFallback>
                          {chat.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{chat.name}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <button
              key={index}
              onClick={() => onSelectChat(chat.wallet_address)}
              className={cn(
                buttonVariants({ variant: "ghost", size: "xl" }),
                "flex items-center gap-4 p-2 rounded-md hover:bg-primary"
              )}
            >
              <Avatar>
                {chat.avatar ? (
                  <AvatarImage
                    src={chat.avatar}
                    alt={`${chat.name}'s avatar`}
                    className="w-10 h-10"
                  />
                ) : (
                  <AvatarFallback>
                    {chat.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="flex flex-col max-w-28">
                <span className="font-semibold truncate">{chat.name}</span>
                {chat.lastMessage && (
                  <span className="text-sm text-zinc-500 truncate">
                    {chat.lastMessageSender || "Unknown"}:{" "}
                    {chat.isTyping ? "Typing..." : chat.lastMessage}
                  </span>
                )}
              </div>
            </button>
          )
        )}
      </nav>
    </div>
  );
}
