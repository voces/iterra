import type { GameState, Action, LogEntry } from './types.ts';
import { createPlayer } from './player.ts';
import {
  canAffordAction,
  spendTicks,
  addTicks,
  isAlive,
  isOverfull,
  isStarving,
  getStarvationDamage,
  heal,
  dealDamage,
  drainSaturation,
} from './actor.ts';
import {
  createEncounter,
  processEnemyTurn,
  handlePlayerActionResult,
  endEncounter,
} from './encounter.ts';
import { getRandomEnemy } from './enemies.ts';

export type GameEventType = 'turn' | 'log' | 'encounter-start' | 'encounter-end';

export type GameEventCallback = (game: Game) => void;

const REGEN_AMOUNT = 2;
const REGEN_SATURATION_COST = 1;

export class Game {
  state: GameState;
  private listeners: Map<GameEventType, Set<GameEventCallback>> = new Map();

  constructor() {
    this.state = {
      player: createPlayer(),
      turn: 0,
      log: [],
      encounter: null,
      berryBushFound: false,
    };
  }

  start(): void {
    this.log('Welcome to Iterra.');
  }

  performAction(action: Action): boolean {
    const player = this.state.player;

    // Check if action is allowed in current state
    if (this.state.encounter && action.tags.includes('non-combat')) {
      this.log(`Cannot ${action.name.toLowerCase()} during an encounter!`);
      return false;
    }

    if (!this.state.encounter && action.tags.includes('combat')) {
      this.log(`No enemy to ${action.name.toLowerCase()}.`);
      return false;
    }

    if (!canAffordAction(player, action)) {
      this.log(
        `Not enough ticks for ${action.name}. Need ${action.tickCost}, have ${player.ticks}.`
      );
      return false;
    }

    spendTicks(player, action.tickCost);

    if (action.tickGain) {
      addTicks(player, action.tickGain);
    }

    const context = {
      encounter: this.state.encounter ?? undefined,
      game: this.state,
    };
    const result = action.execute(player, context);
    this.state.turn++;
    this.log(result.message);

    // Handle resource discovery
    if (result.foundResource === 'berries') {
      this.state.berryBushFound = true;
    }

    // Deplete berry bush after gathering
    if (action.id === 'gather-berries') {
      // 60% chance bush is depleted after gathering
      if (Math.random() < 0.6) {
        this.state.berryBushFound = false;
        this.log('The berry bush is now empty.');
      }
    }

    // Handle encounter-specific results
    if (this.state.encounter) {
      handlePlayerActionResult(this.state.encounter, result, player);

      if (this.state.encounter.ended) {
        this.endCurrentEncounter();
      } else {
        // Enemy turn
        this.processEnemyTurns();
      }
    } else {
      // Random encounter chance when wandering (if no berries found)
      if (action.id === 'wander' && !result.foundResource) {
        this.checkForEncounter();
      }
    }

    // Health regeneration when overfull
    this.processRegen();

    // Starvation damage when saturation too low
    this.processStarvation();

    this.emit('turn');
    return true;
  }

  private processRegen(): void {
    const player = this.state.player;

    if (isOverfull(player) && player.health < player.maxHealth) {
      heal(player, REGEN_AMOUNT);
      drainSaturation(player, REGEN_SATURATION_COST);
      this.log(
        `You feel restored. (+${REGEN_AMOUNT} HP, ${player.health}/${player.maxHealth})`
      );
    }
  }

  private processStarvation(): void {
    const player = this.state.player;

    if (isStarving(player)) {
      const damage = getStarvationDamage(player);
      dealDamage(player, damage);
      this.log(
        `You are starving! (-${damage} HP, ${player.health}/${player.maxHealth})`
      );

      if (!isAlive(player)) {
        this.log('You have starved to death...');
      }
    }
  }

  private checkForEncounter(): void {
    const encounterChance = 0.3;
    if (Math.random() < encounterChance) {
      this.startEncounter();
    }
  }

  startEncounter(enemy?: ReturnType<typeof getRandomEnemy>): void {
    const encounter = createEncounter(enemy);
    this.state.encounter = encounter;
    this.log(`A wild ${encounter.enemy.name} appears!`);
    this.emit('encounter-start');
  }

  private processEnemyTurns(): void {
    if (!this.state.encounter || this.state.encounter.ended) return;

    const encounter = this.state.encounter;
    const player = this.state.player;

    // Process enemy action
    const enemyAction = processEnemyTurn(encounter, player);

    if (enemyAction) {
      this.log(enemyAction.message);

      if (enemyAction.encounterEnded) {
        if (!isAlive(player)) {
          endEncounter(encounter, 'defeat');
        } else if (enemyAction.fled) {
          endEncounter(encounter, 'enemy_escaped');
        } else if (encounter.playerFleeing) {
          endEncounter(encounter, 'player_escaped');
        }
        this.endCurrentEncounter();
      }
    }
  }

  private endCurrentEncounter(): void {
    if (!this.state.encounter) return;

    const result = this.state.encounter.result;
    const enemy = this.state.encounter.enemy;

    switch (result) {
      case 'victory':
        this.log(`You defeated the ${enemy.name}!`);
        break;
      case 'defeat':
        this.log('You have been defeated...');
        break;
      case 'player_escaped':
        this.log('You escaped safely.');
        break;
      case 'enemy_escaped':
        this.log(`The ${enemy.name} got away.`);
        break;
    }

    this.state.encounter = null;
    this.emit('encounter-end');
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
    const actions = this.state.player.actions;
    const inCombat = this.state.encounter !== null;
    const enemyFleeing = this.state.encounter?.enemyFleeing ?? false;
    const hasBerries = this.state.player.inventory.berries > 0;
    const bushAvailable = this.state.berryBushFound;

    return actions.filter((action) => {
      // Filter out non-combat actions during encounters
      if (inCombat && action.tags.includes('non-combat')) {
        return false;
      }

      // Filter out combat actions outside of encounters
      if (!inCombat && action.tags.includes('combat')) {
        return false;
      }

      // Chase only available when enemy is fleeing
      if (action.id === 'chase' && !enemyFleeing) {
        return false;
      }

      // Let go only available when enemy is fleeing
      if (action.id === 'let-go' && !enemyFleeing) {
        return false;
      }

      // Can't flee if already fleeing (waiting for enemy response)
      if (action.id === 'flee' && this.state.encounter?.playerFleeing) {
        return false;
      }

      // Gather berries only when bush is found
      if (action.id === 'gather-berries' && !bushAvailable) {
        return false;
      }

      // Eat berries only when player has berries
      if (action.id === 'eat-berries' && !hasBerries) {
        return false;
      }

      return true;
    });
  }

  filterActions(query: string): Action[] {
    const available = this.getAvailableActions();
    const q = query.toLowerCase().trim();

    if (!q) {
      return available;
    }

    return available.filter((action) => {
      const nameMatch = action.name.toLowerCase().includes(q);
      const descMatch = action.description.toLowerCase().includes(q);
      const tagMatch = action.tags.some((tag) => tag.toLowerCase().includes(q));
      return nameMatch || descMatch || tagMatch;
    });
  }
}
