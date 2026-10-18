import 'server-only';

// Live updates for the MEK Movers apps: every write is pushed to all open tabs over Server-Sent Events,
// exactly like the stand-alone server did. In memory, so it covers one app process (next start), which is
// how the Sales Hub runs on the laptop.
export interface MoversEvent {
  op: 'set' | 'update' | 'delete' | 'reload';
  col?: string;
  id?: string;
  data?: Record<string, unknown>;
  client?: string;
}

type Listener = (event: MoversEvent) => void;

const g = globalThis as typeof globalThis & { __mekMoversListeners?: Set<Listener> };
const listeners = (g.__mekMoversListeners ??= new Set<Listener>());

export function broadcast(event: MoversEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      listeners.delete(listener);
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
