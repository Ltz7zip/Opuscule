export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  body?: string;
  label?: string;
  hint?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  multiline?: boolean;
}

export type DialogRequest =
  | { id: number; kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { id: number; kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

type Listener = (request: DialogRequest | null) => void;

let sequence = 0;
let current: DialogRequest | null = null;
const queue: DialogRequest[] = [];
const listeners = new Set<Listener>();

function publish() {
  for (const listener of listeners) listener(current);
}

function enqueue(request: DialogRequest) {
  if (current) {
    queue.push(request);
    return;
  }
  current = request;
  publish();
}

/** Resolve the active dialog and promote the next queued request. */
export function settleDialog(value: boolean | string | null) {
  const request = current;
  if (!request) return;
  current = queue.shift() ?? null;
  if (request.kind === "confirm") request.resolve(Boolean(value));
  else request.resolve(typeof value === "string" ? value : null);
  publish();
}

export function subscribeDialogs(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    enqueue({ id: (sequence += 1), kind: "confirm", options, resolve });
  });
}

export function promptAction(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    enqueue({ id: (sequence += 1), kind: "prompt", options, resolve });
  });
}
