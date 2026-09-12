"use client";

import { CircleHelp } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function HelpTip({
  children,
  label = "Пояснение",
  className,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
        >
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[320px] text-pretty leading-relaxed" sideOffset={6}>
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
