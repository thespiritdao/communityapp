"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "src/app/chat/components/ui/popover";
import { SmileIcon } from "lucide-react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import { useTheme } from "next-themes";

interface EmojiPickerProps {
  onChange: (value: string) => void; // Callback when an emoji is selected
}

export const EmojiPicker = ({ onChange }: EmojiPickerProps) => {
  const { theme } = useTheme();

  return (
    <Popover>
      {/* Emoji Button */}
      <PopoverTrigger aria-label="Select an emoji">
        <button className="p-2 rounded-full bg-muted hover:bg-accent transition">
          <SmileIcon className="h-5 w-5 text-muted-foreground hover:text-foreground transition" />
        </button>
      </PopoverTrigger>

      {/* Emoji Picker */}
      <PopoverContent className="w-80">
        <Picker
          emojiSize={18}
          theme={theme === "dark" ? "dark" : "light"} // Default to "light" if theme is undefined
          data={data}
          maxFrequentRows={1}
          onEmojiSelect={(emoji: any) => {
            if (emoji?.native) {
              onChange(emoji.native); // Pass the native emoji to the callback
            } else {
              console.warn("Selected emoji does not have a native property:", emoji);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
};
