import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  settleDialog,
  subscribeDialogs,
  type ConfirmOptions,
  type DialogRequest,
  type PromptOptions,
} from "../lib/dialogs";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useDialogKeys(panelRef: React.RefObject<HTMLDivElement | null>, onCancel: () => void) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onCancel, panelRef]);
}

function Scrim({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <div
      className="dialog-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      {children}
    </div>
  );
}

function ConfirmView({ options }: { options: ConfirmOptions }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const cancel = useCallback(() => settleDialog(false), []);

  useDialogKeys(panelRef, cancel);

  useEffect(() => {
    (options.danger ? cancelRef.current : confirmRef.current)?.focus();
  }, [options.danger]);

  return (
    <Scrim onDismiss={cancel}>
      <div
        className="dialog dialog-compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.body ? bodyId : undefined}
        ref={panelRef}
      >
        <div className="dialog-head">
          <div>
            <h2 id={titleId}>{options.title}</h2>
            {options.body && <p id={bodyId}>{options.body}</p>}
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" ref={cancelRef} onClick={cancel}>
            {options.cancelLabel ?? "取消"}
          </button>
          <button
            type="button"
            className={`btn ${options.danger ? "btn-danger" : "btn-primary"}`}
            ref={confirmRef}
            onClick={() => settleDialog(true)}
          >
            {options.confirmLabel ?? "确认"}
          </button>
        </div>
      </div>
    </Scrim>
  );
}

function PromptView({ options }: { options: PromptOptions }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [value, setValue] = useState(options.defaultValue ?? "");
  const titleId = useId();
  const fieldId = useId();
  const cancel = useCallback(() => settleDialog(null), []);

  useDialogKeys(panelRef, cancel);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (input instanceof HTMLInputElement) input.select();
  }, []);

  const submit = () => settleDialog(value);

  return (
    <Scrim onDismiss={cancel}>
      <div
        className="dialog dialog-compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className="dialog-head">
          <div>
            <h2 id={titleId}>{options.title}</h2>
            {options.body && <p>{options.body}</p>}
          </div>
        </div>
        <form
          className="dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="dialog-field" htmlFor={fieldId}>
            {options.label && <span>{options.label}</span>}
            {options.multiline ? (
              <textarea
                id={fieldId}
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={value}
                placeholder={options.placeholder}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
            ) : (
              <input
                id={fieldId}
                ref={inputRef as React.RefObject<HTMLInputElement>}
                value={value}
                placeholder={options.placeholder}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </label>
          {options.hint && <p className="dialog-hint">{options.hint}</p>}
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={cancel}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              {options.confirmLabel ?? "确定"}
            </button>
          </div>
        </form>
      </div>
    </Scrim>
  );
}

/** Mounted once by App. Renders whichever confirm/prompt request is active. */
export function DialogHost() {
  const [request, setRequest] = useState<DialogRequest | null>(null);

  useEffect(() => subscribeDialogs(setRequest), []);

  if (!request) return null;
  const key = request.id;
  return request.kind === "confirm" ? (
    <ConfirmView key={key} options={request.options} />
  ) : (
    <PromptView key={key} options={request.options} />
  );
}
