import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Info, Phone, Video } from "lucide-react";

interface ChatTopbarProps {
  userName?: string; // Make userName optional
  userAvatar?: string; // Make userAvatar optional
}

export default function ChatTopbar({ userName = "Guest", userAvatar }: ChatTopbarProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b bg-muted/40">
      <div className="flex items-center space-x-4">
        {/* Avatar */}
        <Avatar>
          {userAvatar ? (
            <AvatarImage src={userAvatar} alt={userName} />
          ) : (
            <AvatarFallback>{userName.charAt(0).toUpperCase()}</AvatarFallback>
          )}
        </Avatar>
        {/* User Name */}
        <div>
          <h2 className="text-lg font-semibold">{userName}</h2>
          <p className="text-sm text-muted-foreground">Active now</p>
        </div>
      </div>
      {/* Action Buttons */}
      <div className="flex items-center space-x-2">
        <button className="rounded-full bg-background p-2">
          <Phone size={20} />
        </button>
        <button className="rounded-full bg-background p-2">
          <Video size={20} />
        </button>
        <button className="rounded-full bg-background p-2">
          <Info size={20} />
        </button>
      </div>
    </div>
  );
}
