"use client";

import { Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AboutDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Badge
          variant="outline"
          className="h-9 cursor-pointer gap-1.5 px-3 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Info className="h-3 w-3" />
          КосмоХакатон 2026 · команда 5bit
        </Badge>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>NORD-48</DialogTitle>
          <DialogDescription>
            Мастерская устойчивости спутниковой группировки
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm text-foreground">
          <p>
            <span className="text-muted-foreground">Кейс: </span>
            «Проектирование устойчивой спутниковой группировки»
          </p>
          <p>
            <span className="text-muted-foreground">Соревнование: </span>
            КосмоХакатон 2026
          </p>
          <p>
            <span className="text-muted-foreground">Команда: </span>
            5bit
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
