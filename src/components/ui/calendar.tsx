import * as React from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

export interface CalendarProps {
  mode?: "single";
  selected?: Date | undefined;
  onSelect?: (date: Date | undefined) => void;
  initialFocus?: boolean;
  className?: string;
}

export const Calendar: React.FC<CalendarProps> = ({
  mode = "single",
  selected,
  onSelect,
  initialFocus,
  className = "",
}) => {
  // Only support single mode as per usage
  return (
    <DayPicker
      mode={mode}
      selected={selected}
      onSelect={onSelect}
      className={className}
      initialFocus={initialFocus}
    />
  );
}; 