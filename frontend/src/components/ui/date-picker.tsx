import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "./utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface DatePickerProps {
  date: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function DatePicker({
  date,
  onSelect,
  placeholder = "Pick a date",
  disabled = false,
  className,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            disabled && "opacity-50 cursor-not-allowed",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "MMM dd, yyyy") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-50" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
