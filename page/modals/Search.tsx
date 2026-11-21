import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@jaetask/toolkit/ui/command";
import { BotAvatarFor } from "../avatar/BotAvatar";
import { botPath, go } from "../router";
import { useStore } from "../store";

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const bots = useStore((s) => s.bots);
  const ordered = [...bots].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || b.lastActivityAt - a.lastActivityAt,
  );
  const pick = (path: string) => {
    onClose();
    go(path);
  };
  return (
    <CommandDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <CommandInput placeholder="Search bots and pages" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="Bots">
          {ordered.map((b) => (
            <CommandItem
              key={b.id}
              value={`${b.name} ${b.label} ${b.description}`}
              onSelect={() => pick(botPath(b.id))}
            >
              <BotAvatarFor bot={b} size={18} />
              <span>{b.name}</span>
              {b.label && <span className="quiet">{b.label}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Pages">
          <CommandItem value="Tasks" onSelect={() => pick("/tasks")}>
            Tasks
          </CommandItem>
          <CommandItem value="New bot" onSelect={() => pick("/bots/new")}>
            New bot
          </CommandItem>
          <CommandItem value="Settings" onSelect={() => pick("/settings")}>
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
