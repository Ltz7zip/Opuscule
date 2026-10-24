import { CalendarDays, MapPin, NotebookPen, UserRound, Wrench, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  character: UserRound,
  place: MapPin,
  event: CalendarDays,
  note: NotebookPen,
  tool: Wrench,
};

/** One grayscale glyph per card type: the shape carries the meaning. */
export function TypeIcon({ typeKey, size = 16 }: { typeKey: string; size?: number }) {
  const Icon = ICONS[typeKey] ?? NotebookPen;
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" focusable="false" />;
}
