import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "./utils";

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
  const inputValue = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`
    : "";

  return (
    <div className={cn("relative", className)}>
      <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        type="date"
        value={inputValue}
        disabled={disabled}
        aria-label={placeholder}
        onChange={(event) => {
          const value = event.target.value;
          if (!value) {
            onSelect(undefined);
            return;
          }
          const parsed = new Date(`${value}T00:00:00`);
          onSelect(Number.isNaN(parsed.getTime()) ? undefined : parsed);
        }}
        className={cn(
          "h-10 w-full rounded-md border border-input bg-input-background pl-10 pr-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          "[color-scheme:light]",
        )}
      />
    </div>
  );
}
