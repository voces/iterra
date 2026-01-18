import type { GameState, Action, LogEntry, EquipSlot, StatType } from './types.ts';
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
  recalculateStats,
} from './actor.ts';
import {
  createEncounter,
  processEnemyTurn,
  handlePlayerActionResult,
  endEncounter,
} from './encounter.ts';
import { getRandomEnemy, generateLoot, getXpReward } from './enemies.ts';
import { getResourceNode } from './resources.ts';
import { getItem } from './items.ts';
import {
  addXp,
  allocateStatPoint,
  getLootBonus,
  getHungerResistance,
  STAT_NAMES,
} from './stats.ts';

export type GameEventType = 'turn' | 'log' | 'encounter-start' | 'encounter-end' | 'game-over' | 'level-up';

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
      availableNodes: {}, // Node type ID -> count
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

    // Handle resource discovery (increment count)
    if (result.foundResource) {
      const nodeId = result.foundResource;
      this.state.availableNodes[nodeId] = (this.state.availableNodes[nodeId] ?? 0) + 1;
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
      // Process node drop-off when wandering
      if (action.id === 'wander') {
        this.processNodeDropOff();
      }

      // Random encounter chance - higher when wandering, small chance on any action
      if (action.id === 'wander' && !result.foundResource) {
        this.checkForEncounter(0.25); // 25% when wandering without finding resources
      } else if (!action.tags.includes('combat')) {
        this.checkForEncounter(0.03); // 3% on any other non-combat action
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
    const player = this.state.player;
    const resistance = getHungerResistance(player.levelInfo.stats);

    // Hunger decay chance reduced by endurance
    if (Math.random() < HUNGER_DECAY_CHANCE * (1 - resistance)) {
      drainSaturation(player, 1);
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

    const count = this.state.availableNodes[nodeId] ?? 0;
    if (count <= 0) return;

    if (Math.random() < node.depletionChance) {
      this.state.availableNodes[nodeId] = count - 1;
      if (this.state.availableNodes[nodeId] <= 0) {
        delete this.state.availableNodes[nodeId];
      }
    }
  }

  private processNodeDropOff(): void {
    // Each node instance has a chance to drop off when wandering
    for (const [nodeId, count] of Object.entries(this.state.availableNodes)) {
      if (count <= 0) continue;

      const node = getResourceNode(nodeId);
      if (!node) continue;

      // Check each instance independently
      let lost = 0;
      for (let i = 0; i < count; i++) {
        if (Math.random() < node.dropOffChance) {
          lost++;
        }
      }

      if (lost > 0) {
        const newCount = count - lost;
        if (newCount <= 0) {
          delete this.state.availableNodes[nodeId];
        } else {
          this.state.availableNodes[nodeId] = newCount;
        }
      }
    }
  }

  private checkForEncounter(chance: number = 0.25): void {
    if (Math.random() < chance) {
      this.startEncounter();
    }
  }

  startEncounter(enemy?: ReturnType<typeof getRandomEnemy>): void {
    const playerLevel = this.state.player.levelInfo.level;
    const encounter = createEncounter(enemy, playerLevel);
    this.state.encounter = encounter;

    const enemyLevel = encounter.enemy.levelInfo.level;
    const levelDisplay = enemyLevel > 1 ? ` (Lv.${enemyLevel})` : '';
    this.log(`A wild ${encounter.enemy.name}${levelDisplay} appears!`);
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
    const player = this.state.player;

    switch (result) {
      case 'victory':
        this.log(`You defeated the ${enemy.name}!`);

        // Grant XP
        const xp = getXpReward(enemy, player.levelInfo.level);
        const { levelsGained, autoStats } = addXp(player.levelInfo, xp);
        this.log(`+${xp} XP`);

        // Handle level ups
        if (levelsGained > 0) {
          recalculateStats(player);
          this.log(`LEVEL UP! You are now level ${player.levelInfo.level}!`);

          // Show auto-assigned stats
          if (autoStats.length > 0) {
            const statCounts: Record<string, number> = {};
            for (const stat of autoStats) {
              statCounts[stat] = (statCounts[stat] || 0) + 1;
            }
            const statList = Object.entries(statCounts)
              .map(([stat, count]) => `+${count} ${STAT_NAMES[stat as StatType]}`)
              .join(', ');
            this.log(`Auto stats: ${statList}`);
          }

          if (player.levelInfo.freeStatPoints > 0) {
            this.log(`You have ${player.levelInfo.freeStatPoints} stat points to allocate!`);
          }

          this.emit('level-up');
        }

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
    const luckBonus = getLootBonus(this.state.player.levelInfo.stats);
    const loot = generateLoot(enemy, luckBonus);

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

  allocateStat(stat: StatType): boolean {
    const player = this.state.player;

    if (allocateStatPoint(player.levelInfo, stat)) {
      recalculateStats(player);
      this.log(`+1 ${STAT_NAMES[stat]}!`);
      this.emit('turn');
      return true;
    }

    this.log('No stat points available.');
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
      'smother-campfire': { requiresCampfire: true },
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

      // Check gathering requirements (need at least one node)
      const gatherNode = gatheringRequirements[action.id];
      if (gatherNode && (this.state.availableNodes[gatherNode] ?? 0) <= 0) {
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

      // Can't wander with a placed campfire
      if (action.id === 'wander' && this.state.structures.has('campfire')) {
        return false;
      }

      return true;
    });
  }

  filterActions(query: string): Action[] {
    const available = this.getAvailableActions();
    const q = query.toLowerCase().trim();

    let filtered = available;
    if (q) {
      filtered = available.filter((action) => {
        const nameMatch = action.name.toLowerCase().includes(q);
        const descMatch = action.description.toLowerCase().includes(q);
        const tagMatch = action.tags.some((tag) => tag.toLowerCase().includes(q));
        return nameMatch || descMatch || tagMatch;
      });
    }

    // Sort by priority score
    return this.sortActionsByPriority(filtered);
  }

  // Score actions by contextual relevance
  private getActionPriority(action: Action): number {
    const player = this.state.player;
    const inCombat = this.state.encounter !== null;
    const enemyFleeing = this.state.encounter?.enemyFleeing ?? false;
    let score = 0;

    // Combat actions in combat get high base priority
    if (inCombat) {
      if (action.id === 'attack') score += 100;
      if (action.id === 'flee') score += 80;
      if (action.id === 'ranged-attack' && player.equipment.mainHand === 'bow') score += 95;
      if (action.id === 'throw-rock') score += 70;
      if (action.id === 'chase' && enemyFleeing) score += 90;
      if (action.id === 'let-go' && enemyFleeing) score += 60;
      return score;
    }

    // Non-combat prioritization
    const satPercent = player.saturation / player.maxSaturation;

    // Food when hungry (saturation < 50%)
    if (action.tags.includes('consumption')) {
      if (satPercent < 0.3) score += 100;
      else if (satPercent < 0.5) score += 80;
      else score += 30;
    }

    // Idle/wander are common exploration actions
    if (action.id === 'idle') {
      score += 40;
      // Much higher priority when low on ticks (not in combat)
      const tickPercent = player.ticks / player.maxTicks;
      if (tickPercent < 0.1) score += 80; // Critical - top priority
      else if (tickPercent < 0.2) score += 50;
      else if (tickPercent < 0.3) score += 30;
    }
    if (action.id === 'wander') score += 60;

    // Gathering when resources available
    if (action.tags.includes('gathering')) {
      score += 50;
    }

    // Crafting priorities based on progression
    if (action.tags.includes('crafting')) {
      // Arrows are high priority if you have a bow
      if (action.id === 'craft-arrows' && player.equipment.mainHand === 'bow') {
        const arrowCount = getItemCount(player, 'arrow');
        if (arrowCount < 5) score += 85;
        else if (arrowCount < 15) score += 60;
        else score += 25;
      }
      // Cooking is good if you have raw meat and campfire
      else if (action.id === 'cook-meat') {
        score += 70;
      }
      // Leather processing
      else if (action.id === 'process-leather') {
        score += 55;
      }
      // Weapon crafting (lower priority once you have weapons)
      else if (action.id === 'craft-stone-knife' || action.id === 'craft-stone-spear' || action.id === 'craft-bow') {
        if (!player.equipment.mainHand) score += 75;
        else score += 25;
      }
      // Armor crafting
      else if (action.id.startsWith('craft-leather-')) {
        score += 45;
      }
      // Shield crafting
      else if (action.id === 'craft-wooden-shield') {
        if (!player.equipment.offHand) score += 55;
        else score += 20;
      }
      // Campfire actions
      else if (action.id === 'craft-campfire') {
        // Only if you don't have one
        if (getItemCount(player, 'campfire') === 0 && !this.state.structures.has('campfire')) {
          score += 50;
        } else {
          score += 5; // Very low if you have one
        }
      }
      else if (action.id === 'place-campfire') {
        score += 55;
      }
      else if (action.id === 'pickup-campfire') {
        score += 15;
      }
      else if (action.id === 'smother-campfire') {
        score += 10; // Last resort - usually want to pick up instead
      }
      else {
        score += 30;
      }
    }

    return score;
  }

  private sortActionsByPriority(actions: Action[]): Action[] {
    return [...actions].sort((a, b) => {
      const scoreA = this.getActionPriority(a);
      const scoreB = this.getActionPriority(b);
      return scoreB - scoreA; // Higher score first
    });
  }

  // Get actions grouped by category for UI
  getGroupedActions(): { category: string; actions: Action[] }[] {
    const available = this.sortActionsByPriority(this.getAvailableActions());
    const inCombat = this.state.encounter !== null;

    if (inCombat) {
      return [{ category: 'Combat', actions: available }];
    }

    // Categorize actions
    const categories: Record<string, Action[]> = {
      'Suggested': [],
      'Explore': [],
      'Gather': [],
      'Eat': [],
      'Craft': [],
      'Other': [],
    };

    // Top 3 highest priority go to Suggested
    const suggested = available.slice(0, 3);
    categories['Suggested'] = suggested;

    for (const action of available) {
      if (action.id === 'idle' || action.id === 'wander') {
        categories['Explore'].push(action);
      } else if (action.tags.includes('gathering')) {
        categories['Gather'].push(action);
      } else if (action.tags.includes('consumption')) {
        categories['Eat'].push(action);
      } else if (action.tags.includes('crafting')) {
        categories['Craft'].push(action);
      } else {
        categories['Other'].push(action);
      }
    }

    // Return non-empty categories
    return Object.entries(categories)
      .filter(([_, actions]) => actions.length > 0)
      .map(([category, actions]) => ({ category, actions }));
  }
}
