export interface PositionStore {
  getSnapshot: () => number;
  subscribe: (listener: () => void) => () => void;
  set: (value: number) => void;
}

export function createPositionStore(initialValue = 0): PositionStore {
  let currentValue = initialValue;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => currentValue,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (value) => {
      if (Math.abs(value - currentValue) < 0.5) return;
      currentValue = value;
      for (const listener of listeners) {
        listener();
      }
    }
  };
}
