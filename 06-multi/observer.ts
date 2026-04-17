export class Observable<ObserverT extends object> {
  private observers = new Set<ObserverT>();

  registerObserver(observer: ObserverT): () => void {
    this.observers.add(observer);
    return () => this.unregisterObserver(observer);
  }

  unregisterObserver(observer: ObserverT): boolean {
    return this.observers.delete(observer);
  }

  emit<K extends keyof ObserverT>(
    method: K,
    ...args: NonNullable<ObserverT[K]> extends ((...args: infer A) => void) ? A : never
  ): void {
    [...this.observers].forEach(observer => {
      const fn = observer[method];
      if (typeof fn === 'function') {
        (fn as Function).apply(observer, args);
      }
    });
  }

  get observerCount(): number {
    return this.observers.size;
  }

  clearObservers(): void {
    this.observers.clear();
  }
}