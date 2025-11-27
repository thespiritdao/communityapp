"use client";

import * as React from "react";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Button } from "./button";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Input } from "./input";
import { Label } from "./label";

export interface DateTimePickerProps {
  value?: string; // datetime-local format: YYYY-MM-DDTHH:mm
  onChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
}

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = "Select date and time",
  className = "",
  minDate,
  maxDate,
}) => {
  const [date, setDate] = React.useState<Date | undefined>(() => {
    if (value) {
      return new Date(value);
    }
    return undefined;
  });

  const [time, setTime] = React.useState<string>(() => {
    if (value) {
      const d = new Date(value);
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    return "12:00";
  });

  const [isOpen, setIsOpen] = React.useState(false);

  // ✅ FIX: Memoize the onChange callback to prevent infinite loops
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // ✅ FIX: Remove onChange from dependencies to prevent infinite loop
  React.useEffect(() => {
    if (date && time) {
      const [hours, minutes] = time.split(':');
      const newDate = new Date(date);
      newDate.setHours(parseInt(hours));
      newDate.setMinutes(parseInt(minutes));

      // Format as datetime-local: YYYY-MM-DDTHH:mm
      const year = newDate.getFullYear();
      const month = (newDate.getMonth() + 1).toString().padStart(2, '0');
      const day = newDate.getDate().toString().padStart(2, '0');
      const formattedTime = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
      const datetimeLocal = `${year}-${month}-${day}T${formattedTime}`;

      // Call onChange via ref to avoid dependency
      if (onChangeRef.current) {
        onChangeRef.current(datetimeLocal);
      }
    }
  }, [date, time]); // ✅ Only depend on date and time

  const handleDateSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate && !time) {
      setTime("12:00");
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTime(e.target.value);
  };

  const handleClear = () => {
    setDate(undefined);
    setTime("12:00");
    if (onChangeRef.current) {
      onChangeRef.current("");
    }
  };

  const displayText = date
    ? `${format(date, "PPP")} at ${time}`
    : placeholder;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={`w-full justify-start text-left font-normal ${
              !date && "text-muted-foreground"
            }`}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span className="flex-1 truncate">{displayText}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 bg-white dark:bg-gray-800 border shadow-lg"
          align="center"
          sideOffset={5}
        >
          <div className="p-4 space-y-4 bg-white dark:bg-gray-800 rounded-lg">
            <div className="bg-white dark:bg-gray-800">
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleDateSelect}
                initialFocus
                className="rounded-md"
              />
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <Label htmlFor="time-input" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Time
              </Label>
              <Input
                id="time-input"
                type="time"
                value={time}
                onChange={handleTimeChange}
                className="mt-1.5 bg-white dark:bg-gray-700"
              />
            </div>
            <div className="flex gap-2 border-t border-gray-200 dark:border-gray-700 pt-3">
              {date && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleClear}
                  type="button"
                >
                  Clear
                </Button>
              )}
              <Button
                size="sm"
                className="flex-1"
                onClick={() => setIsOpen(false)}
                disabled={!date || !time}
                type="button"
              >
                Done
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Hidden input for form compatibility */}
      <input
        type="hidden"
        value={value || ""}
        required={required}
        disabled={disabled}
      />
    </div>
  );
};
