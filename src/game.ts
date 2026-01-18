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
  addItem,
  getItemCount,
  equipItem,
  unequipSlot,
} from './actor.ts';
import type { EquipSlot } from './types.ts';
import {
  createEncounter,
  processEnemyTurn,
  handlePlayerActionResult,
  endEncounter,
} from './encounter.ts';
import { getRandomEnemy, generateLoot } from './enemies.ts';
import { getResourceNode } from './resources.ts';
import { getItem } from './items.ts';

export type GameEventType = 'turn' | 'log' | 'encounter-start' | 'encounter-end' | 'game-over';

export type GameEventCallback = (game: Game) => void;

const REGEN_AMOUNT = 2;
const REGEN_SATURATION_COST = 1;
const PASS_OUT_TICK_GAIN = 500;
const PASS_OUT_HEALTH_COST = 10;
const HUNGER_DECAY_CHANCE = 0.1; // 10% chance to lose 1 saturation per turn

export class Game {
  state: GameState;
  private listeners: Map<GameEventType, Set<GameEventCallback>> = new Map();

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): GameState {
    return {
      player: createPlayer(),
      turn: 0,
      log: [],
      encounter: null,
      availableNodes: new Set(),
      structures: new Set(),
      pendingLoot: null,
      gameOver: false,
    };
  }

  restart(): void {
    this.state = this.createInitialState();
    this.log('A new journey begins...');
    this.emit('turn');
  }

  start(): void {
    this.log('Welcome to Iterra.');
  }

  performAction(action: Action): boolean {
    // Cannot act when dead
    if (this.state.gameOver) {
      return false;
    }

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
    if (result.foundResource) {
      this.state.availableNodes.add(result.foundResource);
    }

    // Handle resource depletion after gathering
    if (action.tags.includes('gathering')) {
      this.processResourceDepletion(action.id);
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

    // Hunger decay
    this.processHunger();

    // Health regeneration when overfull
    this.processRegen();

    // Starvation damage when saturation is 0
    this.processStarvation();

    // Pass out if can't afford any action
    this.processPassOut();

    this.emit('turn');
    return true;
  }

  private processHunger(): void {
    if (Math.random() < HUNGER_DECAY_CHANCE) {
      drainSaturation(this.state.player, 1);
    }
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
        this.triggerGameOver();
      }
    }
  }

  private canAffordAnyAction(): boolean {
    const available = this.getAvailableActions();
    const player = this.state.player;
    return available.some((action) => canAffordAction(player, action));
  }

  private processPassOut(): void {
    if (this.state.gameOver) return;
    if (this.canAffordAnyAction()) return;

    const player = this.state.player;

    // Player passes out from exhaustion
    this.log('You collapse from exhaustion...');
    dealDamage(player, PASS_OUT_HEALTH_COST);
    addTicks(player, PASS_OUT_TICK_GAIN);
    this.state.turn++;

    this.log(
      `You wake up weakened. (-${PASS_OUT_HEALTH_COST} HP, +${PASS_OUT_TICK_GAIN} ticks)`
    );

    if (!isAlive(player)) {
      this.log('You never wake up...');
      this.triggerGameOver();
      return;
    }

    // During combat, enemy gets a free attack while you're passed out
    if (this.state.encounter && !this.state.encounter.ended) {
      this.log(`The ${this.state.encounter.enemy.name} attacks while you're vulnerable!`);
      this.processEnemyTurns();
    }

    this.emit('turn');
  }

  private triggerGameOver(): void {
    this.state.gameOver = true;
    this.log('GAME OVER');
    this.emit('game-over');
  }

  private processResourceDepletion(actionId: string): void {
    // Map action IDs to resource node IDs
    const actionToNode: Record<string, string> = {
      'gather-berries': 'berryBush',
      'gather-sticks': 'fallenBranches',
      'gather-rocks': 'rockyOutcrop',
      'gather-fiber': 'tallGrass',
    };

    const nodeId = actionToNode[actionId];
    if (!nodeId) return;

    const node = getResourceNode(nodeId);
    if (!node) return;

    if (Math.random() < node.depletionChance) {
      this.state.availableNodes.delete(nodeId);
      this.log(`The ${node.name.toLowerCase()} is now depleted.`);
    }
  }

  private checkForEncounter(): void {
    const encounterChance = 0.25; // 25% when wandering without finding resources
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
        this.setPendingLoot(enemy);
        break;
      case 'defeat':
        this.log('You have been defeated...');
        this.state.encounter = null;
        this.triggerGameOver();
        return;
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

  private setPendingLoot(enemy: typeof this.state.player): void {
    const loot = generateLoot(enemy);

    // Filter out zero-quantity items
    const filteredLoot: Record<string, number> = {};
    for (const [itemId, amount] of Object.entries(loot)) {
      if (amount > 0) {
        filteredLoot[itemId] = amount;
      }
    }

    if (Object.keys(filteredLoot).length > 0) {
      this.state.pendingLoot = filteredLoot;
      const lootMessages = Object.entries(filteredLoot).map(([itemId, amount]) => {
        const item = getItem(itemId);
        return `${amount} ${item?.name ?? itemId}`;
      });
      this.log(`Loot available: ${lootMessages.join(', ')}`);
    }
  }

  takeLoot(itemId: string, amount: number = 1): boolean {
    if (!this.state.pendingLoot || !this.state.pendingLoot[itemId]) {
      return false;
    }

    const available = this.state.pendingLoot[itemId];
    const toTake = Math.min(amount, available);

    addItem(this.state.player, itemId, toTake);
    this.state.pendingLoot[itemId] -= toTake;

    if (this.state.pendingLoot[itemId] <= 0) {
      delete this.state.pendingLoot[itemId];
    }

    // Clear pendingLoot if empty
    if (Object.keys(this.state.pendingLoot).length === 0) {
      this.state.pendingLoot = null;
    }

    const item = getItem(itemId);
    this.log(`Took ${toTake} ${item?.name ?? itemId}.`);
    this.emit('turn');
    return true;
  }

  takeAllLoot(): void {
    if (!this.state.pendingLoot) return;

    for (const [itemId, amount] of Object.entries(this.state.pendingLoot)) {
      addItem(this.state.player, itemId, amount);
    }

    this.log('Took all loot.');
    this.state.pendingLoot = null;
    this.emit('turn');
  }

  leaveLoot(): void {
    if (!this.state.pendingLoot) return;

    this.log('Left the loot behind.');
    this.state.pendingLoot = null;
    this.emit('turn');
  }

  dropItem(itemId: string, amount: number = 1): boolean {
    const player = this.state.player;
    const count = getItemCount(player, itemId);

    if (count <= 0) {
      return false;
    }

    const toDrop = Math.min(amount, count);
    player.inventory[itemId] -= toDrop;

    if (player.inventory[itemId] <= 0) {
      delete player.inventory[itemId];
    }

    const item = getItem(itemId);
    this.log(`Dropped ${toDrop} ${item?.name ?? itemId}.`);
    this.emit('turn');
    return true;
  }

  equip(itemId: string, slot: EquipSlot): boolean {
    if (this.state.encounter) {
      this.log("Can't change equipment during combat!");
      return false;
    }

    const player = this.state.player;
    const item = getItem(itemId);

    if (!item) {
      return false;
    }

    if (equipItem(player, itemId, slot)) {
      this.log(`Equipped ${item.name}.`);
      this.emit('turn');
      return true;
    }

    this.log(`Cannot equip ${item.name}.`);
    return false;
  }

  unequip(slot: EquipSlot): boolean {
    if (this.state.encounter) {
      this.log("Can't change equipment during combat!");
      return false;
    }

    const player = this.state.player;
    const itemId = player.equipment[slot];

    if (!itemId) {
      return false;
    }

    const item = getItem(itemId);

    if (unequipSlot(player, slot)) {
      this.log(`Unequipped ${item?.name ?? itemId}.`);
      this.emit('turn');
      return true;
    }

    return false;
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
    const player = this.state.player;

    // Map gathering actions to their required resource nodes
    const gatheringRequirements: Record<string, string> = {
      'gather-berries': 'berryBush',
      'gather-sticks': 'fallenBranches',
      'gather-rocks': 'rockyOutcrop',
      'gather-fiber': 'tallGrass',
    };

    // Map consumption actions to their required items
    const consumptionRequirements: Record<string, string> = {
      'eat-berries': 'berries',
      'eat-cooked-meat': 'cookedMeat',
      'eat-raw-meat': 'rawMeat',
    };

    // Map crafting actions to their requirements
    const craftingRequirements: Record<string, {
      requiresCampfire?: boolean;
      requiresNoCampfire?: boolean;
      requiresItems?: Record<string, number>;
    }> = {
      'craft-campfire': { requiresItems: { sticks: 5, rocks: 3 } },
      'place-campfire': { requiresNoCampfire: true, requiresItems: { campfire: 1 } },
      'pickup-campfire': { requiresCampfire: true },
      'cook-meat': { requiresCampfire: true, requiresItems: { rawMeat: 1 } },
      'craft-stone-knife': { requiresItems: { rocks: 2, sticks: 1 } },
      'craft-stone-spear': { requiresItems: { rocks: 1, sticks: 3, fiber: 2 } },
      'craft-bow': { requiresItems: { sticks: 3, fiber: 5 } },
      'craft-arrows': { requiresItems: { sticks: 2, rocks: 1 } },
      'craft-wooden-shield': { requiresItems: { sticks: 6, fiber: 3 } },
      'process-leather': { requiresCampfire: true, requiresItems: { rawLeather: 2 } },
      'craft-leather-helm': { requiresItems: { leather: 2 } },
      'craft-leather-chest': { requiresItems: { leather: 4 } },
      'craft-leather-legs': { requiresItems: { leather: 3 } },
      'craft-leather-boots': { requiresItems: { leather: 2 } },
    };

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

      // Check gathering requirements
      const gatherNode = gatheringRequirements[action.id];
      if (gatherNode && !this.state.availableNodes.has(gatherNode)) {
        return false;
      }

      // Check consumption requirements
      const consumeItem = consumptionRequirements[action.id];
      if (consumeItem && getItemCount(player, consumeItem) <= 0) {
        return false;
      }

      // Check crafting requirements
      const craftReqs = craftingRequirements[action.id];
      if (craftReqs) {
        if (craftReqs.requiresCampfire && !this.state.structures.has('campfire')) {
          return false;
        }
        if (craftReqs.requiresNoCampfire && this.state.structures.has('campfire')) {
          return false;
        }
        if (craftReqs.requiresItems) {
          for (const [itemId, needed] of Object.entries(craftReqs.requiresItems)) {
            if (getItemCount(player, itemId) < needed) {
              return false;
            }
          }
        }
      }

      // Check combat action requirements
      if (action.id === 'throw-rock' && getItemCount(player, 'rocks') <= 0) {
        return false;
      }
      if (action.id === 'ranged-attack') {
        if (player.equipment.mainHand !== 'bow' || getItemCount(player, 'arrow') <= 0) {
          return false;
        }
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
