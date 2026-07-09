"use client";

import { Sun, Moon } from "lucide-react";
import { useDarkMode } from "@/hooks/useDarkMode";
import { Button } from "@/components/ui/button";

export function DarkModeToggle() {
  const { dark, toggle } = useDarkMode();
  return (
    <Button variant="outline" size="icon" onClick={toggle} aria-label="Toggle dark mode">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
