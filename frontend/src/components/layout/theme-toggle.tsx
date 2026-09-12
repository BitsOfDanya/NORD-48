"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const theme = useSyncExternalStore(
    (notify) => {
      window.addEventListener("nord48-theme-change", notify);
      return () => window.removeEventListener("nord48-theme-change", notify);
    },
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light"
  );

  const nextTheme = theme === "dark" ? "light" : "dark";
  const label = nextTheme === "dark" ? "Включить тёмную тему" : "Включить светлую тему";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={showLabel ? "default" : "icon"}
          className={showLabel ? "w-full justify-start gap-3 text-sidebar-foreground" : undefined}
          aria-label={label}
          onClick={() => {
            applyTheme(nextTheme);
            window.localStorage.setItem("nord48-theme", nextTheme);
            window.dispatchEvent(new Event("nord48-theme-change"));
          }}
        >
          {theme === "dark" ? <Sun /> : <Moon />}
          {showLabel && <span>{theme === "dark" ? "Светлая тема" : "Тёмная тема"}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
    </Tooltip>
  );
}
