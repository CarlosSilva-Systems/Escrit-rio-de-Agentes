import type { OfficeEvent } from '../contracts';

// Typed in-process event bus (ARQUITETURA §1: HookIngest/JsonlWatcher -> EventBus -> OfficeState,
// ApprovalBroker...). Synchronous delivery; a faulty listener never breaks the others.

export type OfficeEventListener = (event: OfficeEvent) => void;

export class EventBus {
  private readonly listeners = new Set<OfficeEventListener>();
  /** Number of listener exceptions swallowed so far (diagnostic counter). */
  listenerErrors = 0;

  constructor(private readonly onListenerError?: (error: unknown) => void) {}

  /** Subscribes; returns the unsubscribe function. */
  on(listener: OfficeEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: OfficeEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.listenerErrors++;
        this.onListenerError?.(error);
      }
    }
  }

  get size(): number {
    return this.listeners.size;
  }
}
