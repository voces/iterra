import type { GameState, Action, LogEntry } from './types.ts';
import { createPlayer } from './player.ts';
import { canAffordAction, spendTicks, addTicks } from './actor.ts';

export type GameEventType = 'turn' | 'log';

export type GameEventCallback = (game: Game) => void;

export class Game {
  state: GameState;
  private listeners: Map<GameEventType, Set<GameEventCallback>> = new Map();

  constructor() {
    this.state = {
      player: createPlayer(),
      turn: 0,
      log: [],
    };
  }

  start(): void {
    this.log('Welcome to Iterra.');
  }

  performAction(action: Action): boolean {
    const player = this.state.player;

    if (!canAffordAction(player, action)) {
      this.log(`Not enough ticks for ${action.name}. Need ${action.tickCost}, have ${player.ticks}.`);
      return false;
    }

    spendTicks(player, action.tickCost);

    if (action.tickGain) {
      addTicks(player, action.tickGain);
    }

    const result = action.execute(player);
    this.state.turn++;
    this.log(result.message);

    this.emit('turn');
    return true;
  }

  log(message: string): void {
    const entry: LogEntry = {
      turn: this.state.turn,
      message,
    };
    this.state.log.unshift(entry);

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
