//src/app/chat/components/chat/chat-topbar.tsx

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Info, Phone, Video } from "lucide-react";
import { ProfileHeader } from 'src/identity/components/ProfileHeader';

interface ChatTopbarProps {
  userName?: string; // Optional name of the user
  userAvatar?: string; // Optional avatar URL of the user
  walletAddress?: string; // Optional wallet address for display or debugging
}

export default function ChatTopbar({
  userName = "Guest",
  userAvatar,
  walletAddress,
}: ChatTopbarProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b bg-muted/40">
      {/* Left Side: Avatar and User Details */}
      <div className="flex items-center space-x-4">
        {/* Avatar */}
        <Avatar>
          {userAvatar ? (
            <AvatarImage src={userAvatar} alt={userName} />
          ) : (
            <AvatarFallback>{userName.charAt(0).toUpperCase()}</AvatarFallback>
          )}
        </Avatar>

        {/* User Information */}
        <div>
          <h2 className="text-lg font-semibold">{userName}</h2>
          <p className="text-sm text-muted-foreground">
            {walletAddress
              ? `Wallet: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
              : "Active now"}
          </p>
        </div>
      </div>

      {/* Right Side: Action Buttons */}
      <div className="flex items-center space-x-2">
        <button
          className="rounded-full bg-background p-2 hover:bg-accent"
          onClick={() => console.log(`Initiating call with ${userName}`)}
        >
          <Phone size={20} />
        </button>
        <button
          className="rounded-full bg-background p-2 hover:bg-accent"
          onClick={() => console.log(`Initiating video call with ${userName}`)}
        >
          <Video size={20} />
        </button>
        <button
          className="rounded-full bg-background p-2 hover:bg-accent"
          onClick={() => console.log(`Viewing info for ${userName}`)}
        >
          <Info size={20} />
        </button>
      </div>
    </div>
  );
}