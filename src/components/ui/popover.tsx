import * as React from "react";
import * as RadixPopover from "@radix-ui/react-popover";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof RadixPopover.Content>,
  React.ComponentPropsWithoutRef<typeof RadixPopover.Content>
>(({ children, ...props }, ref) => (
  <RadixPopover.Content ref={ref} sideOffset={4} {...props}>
    {children}
  </RadixPopover.Content>
));
PopoverContent.displayName = "PopoverContent"; 