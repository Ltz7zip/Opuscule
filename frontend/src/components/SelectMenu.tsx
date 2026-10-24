import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  color?: string;
  disabled?: boolean;
}

interface SelectMenuProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}

/**
 * A small listbox for in-page pickers. Native select popups are painted by
 * the OS (and cannot follow the token surface), so the closed control and
 * the open menu are both rendered here.
 */
export function SelectMenu({ value, options, onChange, ariaLabel, disabled, className, compact }: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; bottom: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((item) => item.value === value));
  const selected = options[selectedIndex] ?? options[0];

  const place = useCallback(() => {
    const node = buttonRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    setRect({ left: box.left, top: box.bottom + 6, width: box.width, bottom: box.bottom });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const node = popRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => popRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    setOpen(false);
    if (option.value !== value) onChange(option.value);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(selectedIndex);
      setOpen(true);
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      let next = active;
      for (let step = 0; step < options.length; step += 1) {
        next = (next + direction + options.length) % options.length;
        if (!options[next]?.disabled) break;
      }
      setActive(next);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const top = rect && rect.top + 300 > window.innerHeight ? Math.max(8, rect.bottom - 306) : rect?.top ?? 0;

  return (
    <div className={`select-menu${compact ? " select-menu--compact" : ""}${className ? ` ${className}` : ""}`}>
      <button
        ref={buttonRef}
        type="button"
        className="select-menu-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => { setActive(selectedIndex); setOpen((current) => !current); }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="select-menu-value">{selected?.label ?? ariaLabel}</span>
        <ChevronDown className="select-menu-chevron" size={16} aria-hidden="true" />
      </button>
      {open && rect
        ? createPortal(
            <div
              ref={popRef}
              id={listId}
              className="select-menu-pop"
              role="listbox"
              aria-label={ariaLabel}
              aria-activedescendant={`${listId}-${active}`}
              tabIndex={-1}
              style={{ left: rect.left, top, width: Math.max(rect.width, 200) }}
              onKeyDown={onMenuKeyDown}
            >
              {options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  data-index={index}
                  data-active={index === active ? "true" : "false"}
                  className="select-menu-option"
                  disabled={option.disabled}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(index)}
                >
                  <span className="select-menu-check" aria-hidden="true">
                    {option.value === value ? <Check size={14} /> : null}
                  </span>
                  {option.color ? <i className={`select-menu-dot era-${option.color}`} /> : null}
                  <span className="select-menu-label">{option.label}</span>
                  {option.hint ? <span className="select-menu-hint">{option.hint}</span> : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
