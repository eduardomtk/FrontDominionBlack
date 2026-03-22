// src/core/Emitter.js

export default class Emitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, fn) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(fn);
  }

  off(event, fn) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).delete(fn);
  }

  emit(event, payload) {
    if (!this.listeners.has(event)) return;
    for (const fn of this.listeners.get(event)) {
      fn(payload);
    }
  }

  clear() {
    this.listeners.clear();
  }
}
