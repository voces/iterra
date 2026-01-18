import type { GameState, Action, LogEntry } from './types.ts';
import { createPlayer } from './player.ts';
import { canAffordAction, spendTicks, addTicks } from './actor.ts';

export type GameEventType = 'tick' | 'action-start' | 'action-complete' | 'log';

export type GameEventCallback = (game: Game) => void;

export class Game {
  state: GameState;
  private listeners: Map<GameEventType, Set<GameEventCallback>> = new Map();
  private tickInterval: number | null = null;
  private lastTickTime: number = 0;

  constructor() {
    this.state = {
      player: createPlayer(),
      turn: 0,
      log: [],
    };
  }

  start(): void {
    this.log('Welcome to Iterra.');
    this.lastTickTime = performance.now();
    this.tickInterval = window.setInterval(() => this.tick(), 100);
  }

  stop(): void {
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private tick(): void {
    const now = performance.now();
    const deltaSeconds = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;

    const player = this.state.player;

    // Passive tick regeneration
    if (player.tickRegenRate > 0) {
      const ticksToAdd = player.tickRegenRate * deltaSeconds;
      addTicks(player, ticksToAdd);
    }

    // Process current action progress
    if (player.currentAction) {
      player.actionProgress += deltaSeconds;
      const requiredTime = player.currentAction.tickCost * 0.5; // 0.5s per tick cost

      if (player.actionProgress >= requiredTime) {
        this.completeAction();
      }
    }

    this.emit('tick');
  }

  selectAction(action: Action): boolean {
    const player = this.state.player;

    if (player.currentAction) {
      return false;
    }

    if (!canAffordAction(player, action)) {
      this.log(`Not enough ticks for ${action.name}. Need ${action.tickCost}, have ${Math.floor(player.ticks)}.`);
      return false;
    }

    if (!spendTicks(player, action.tickCost)) {
      return false;
    }

    player.currentAction = action;
    player.actionProgress = 0;
    this.emit('action-start');

    return true;
  }

  private completeAction(): void {
    const player = this.state.player;
    const action = player.currentAction;

    if (!action) return;

    const result = action.execute(player);
    this.state.turn++;
    this.log(result.message);

    player.currentAction = null;
    player.actionProgress = 0;

    this.emit('action-complete');
  }

  log(message: string): void {
    const entry: LogEntry = {
      turn: this.state.turn,
      message,
      timestamp: Date.now(),
    };
    this.state.log.unshift(entry);

    // Keep log size manageable
    if (this.state.log.length > 100) {
      this.state.log.pop();
    }

    this.emit('log');
  }

  on(event: GameEventType, callback: GameEventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: GameEventType, callback: GameEventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: GameEventType): void {
    this.listeners.get(event)?.forEach((cb) => cb(this));
  }

  getAvailableActions(): Action[] {
    return this.state.player.actions;
  }

  filterActions(query: string): Action[] {
    const q = query.toLowerCase().trim();
    if (!q) {
      return this.getAvailableActions();
    }

    return this.getAvailableActions().filter((action) => {
      const nameMatch = action.name.toLowerCase().includes(q);
      const descMatch = action.description.toLowerCase().includes(q);
      const tagMatch = action.tags.some((tag) => tag.toLowerCase().includes(q));
      return nameMatch || descMatch || tagMatch;
    });
  }
}
