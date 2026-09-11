"use client";

import { ChevronFirst, ChevronLast, Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore, type PlaybackSpeed } from "@/store/app-store";

const SPEEDS: PlaybackSpeed[] = [0.5, 1, 2, 4];

export function PlaybackControls({
  playing,
  onTogglePlay,
  onStepBack,
  onStepForward,
  onJumpStart,
  onJumpEnd,
}: {
  playing: boolean;
  onTogglePlay: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onJumpStart: () => void;
  onJumpEnd: () => void;
}) {
  const playbackSpeed = useAppStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useAppStore((s) => s.setPlaybackSpeed);

  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onJumpStart} title="В начало">
        <ChevronFirst className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStepBack} title="Шаг назад">
        <SkipBack className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        className="h-7 w-7"
        onClick={onTogglePlay}
        title={playing ? "Пауза" : "Воспроизвести"}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStepForward} title="Шаг вперёд">
        <SkipForward className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onJumpEnd} title="В конец">
        <ChevronLast className="h-4 w-4" />
      </Button>

      <Select
        value={String(playbackSpeed)}
        onValueChange={(v) => setPlaybackSpeed(Number(v) as PlaybackSpeed)}
      >
        <SelectTrigger className="ml-1 h-7 w-16 text-xs" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SPEEDS.map((speed) => (
            <SelectItem key={speed} value={String(speed)}>
              {speed}×
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
