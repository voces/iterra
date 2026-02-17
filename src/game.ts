import type { GameState, Action, LogEntry, EquipSlot, StatType, ActionTrackingRecord, ActionStateSnapshot, ActionWithPriority } from './types.ts';
import { createPlayer } from './player.ts';
import { saveGame, loadGame, clearSave, saveTrackingRecords, loadTrackingRecords, clearTrackingRecords as clearTrackingStorage } from './persistence.ts';
import {
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
  type PlayerActionInfo,
  calculateProjectileRecovery,
} from './encounter.ts';
import { getRandomEnemy, generateLoot, getXpReward, getEnemyTemplate, canButcher, canSkin } from './enemies.ts';
import { getResourceNode } from './resources.ts';
import { getItem } from './items.ts';
import {
  addXp,
  allocateStatPoint,
  getLootBonus,
  getHungerResistance,
  STAT_NAMES,
} from './stats.ts';
import { getLocation } from './locations.ts';
import {
  createEnterLocationAction,
  createWeaponAttackAction,
} from './actions.ts';
import {
  getBackSlotWeapons,
  addToBackSlots,
  removeFromBackSlots,
  canStoreOnBack,
  canAddToBackSlots,
} from './actor.ts';

export type GameEventType = 'turn' | 'log' | 'encounter-start' | 'encounter-end' | 'game-over' | 'level-up' | 'location-discovered' | 'location-entered' | 'location-exited' | 'exit-found' | 'save' | 'load';

export type GameEventCallback = (game: Game) => void;

const REGEN_AMOUNT = 2;
const REGEN_SATURATION_COST = 1;
const PASS_OUT_TICK_GAIN = 500;
const PASS_OUT_HEALTH_COST = 10;
const HUNGER_DECAY_CHANCE = 0.1; // 10% chance to lose 1 saturation per turn

export class Game {
  state: GameState;
  private listeners: Map<GameEventType, Set<GameEventCallback>> = new Map();
  private actionTrackingRecords: ActionTrackingRecord[] = [];
  private trackingEnabled: boolean = true;

  // Location cache to avoid repeated lookups
  private currentLocationCache: { id: string | null; name: string; isSafe: boolean } | null = null;
  private enterableLocationsCache: Array<{ id: string; name: string; entrances: number; closestDistance: number }> | null = null;

  constructor() {
    this.state = this.createInitialState();
    // Load persisted tracking records
    this.actionTrackingRecords = loadTrackingRecords();
  }

  private createInitialState(): GameState {
    return {
      player: createPlayer(),
      turn: 0,
      log: [],
      encounter: null,
      availableNodes: [], // Resource nodes with distance tracking
      structures: new Set(),
      pendingLoot: null,
      pendingCorpse: null,
      gameOver: false,
      // Location system
      currentLocation: null,
      locationStack: [],
      discoveredLocations: {},
      foundExit: false,
    };
  }

  restart(): void {
    // Clear saved game data when starting fresh
    clearSave();
    this.state = this.createInitialState();
    this.invalidateLocationCache();
    // Note: tracking records are NOT cleared on restart - they persist for analysis
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

    // Calculate effective cost (includes distance bonus)
    const effectiveCost = this.getEffectiveTickCost(action);

    if (player.ticks < effectiveCost) {
      this.log(
        `Not enough ticks for ${action.name}. Need ${effectiveCost}, have ${player.ticks}.`
      );
      return false;
    }

    // Record action for tracking (before state changes)
    this.recordAction(action);

    spendTicks(player, effectiveCost);

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

    // Process node and location drop-off when wandering (before adding new discoveries)
    if (action.id === 'wander' && !this.state.encounter) {
      this.processNodeDropOff();
      this.processLocationDropOff();
    }

    // Handle resource discovery (add new node with distance 0)
    if (result.foundResource) {
      const nodeId = result.foundResource;
      this.state.availableNodes.push({ nodeId, distance: 0 });
    }

    // Handle location discovery
    if (result.foundLocation) {
      this.discoverLocation(result.foundLocation);
    }

    // Handle exit discovery
    if (result.foundExit) {
      this.findExit();
    }

    // Handle location exit action
    if (action.id === 'exit-location' && result.success) {
      this.exitLocation();
    }

    // Handle location enter actions
    if (action.id.startsWith('enter-location-') && result.success) {
      const locationId = action.id.replace('enter-location-', '');
      this.enterLocation(locationId);
    }

    // Handle resource depletion after gathering
    if (action.tags.includes('gathering')) {
      this.processResourceDepletion(action.id);
    }

    // Handle corpse cleanup after harvesting
    if (action.tags.includes('harvesting')) {
      this.processCorpseCleanup(action.id);
    }

    // Handle encounter-specific results
    if (this.state.encounter) {
      // Determine action type for flee/chase/idle logic
      const isAttack = action.tags.includes('offensive');
      const isChase = action.id === 'chase';
      const isIdle = action.id === 'idle';
      const actionInfo: PlayerActionInfo = { isAttack, isChase, isIdle };

      handlePlayerActionResult(this.state.encounter, result, player, actionInfo);

      if (this.state.encounter.ended) {
        this.endCurrentEncounter();
      } else {
        // Enemy turn
        this.processEnemyTurns();
      }
    } else {
      // Random encounter chance - higher when wandering, small chance on any action
      if (action.id === 'wander' && !result.foundResource && !result.foundLocation && !result.foundExit) {
        this.checkForEncounter(0.25); // 25% when wandering without finding anything
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
    return available.some((action) => player.ticks >= this.getEffectiveTickCost(action));
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

    const nodeDef = getResourceNode(nodeId);
    if (!nodeDef) return;

    // Find the closest node of this type (lowest distance)
    const nodeIndex = this.state.availableNodes
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.nodeId === nodeId)
      .sort((a, b) => a.n.distance - b.n.distance)[0]?.i;

    if (nodeIndex === undefined) return;

    // Chance to deplete the node
    if (Math.random() < nodeDef.depletionChance) {
      this.state.availableNodes.splice(nodeIndex, 1);
    } else {
      // Reset distance to 0 since we walked to the node to gather
      this.state.availableNodes[nodeIndex].distance = 0;
    }
  }

  private processNodeDropOff(): void {
    // Each node instance has a chance to drop off when wandering
    // Nodes that don't drop off increase in distance
    const nodesToRemove: number[] = [];

    for (let i = 0; i < this.state.availableNodes.length; i++) {
      const node = this.state.availableNodes[i];
      const nodeDef = getResourceNode(node.nodeId);
      if (!nodeDef) continue;

      // Drop-off chance increases with distance
      const baseDropOffChance = nodeDef.dropOffChance;
      const distanceMultiplier = 1 + node.distance * 0.1; // 10% more per distance
      const dropOffChance = Math.min(0.5, baseDropOffChance * distanceMultiplier);

      if (Math.random() < dropOffChance) {
        nodesToRemove.push(i);
      } else {
        // Increase distance for nodes that survive
        node.distance++;
      }
    }

    // Remove dropped nodes (in reverse order to maintain indices)
    for (let i = nodesToRemove.length - 1; i >= 0; i--) {
      this.state.availableNodes.splice(nodesToRemove[i], 1);
    }
  }

  private processLocationDropOff(): void {
    // Each location entrance has a chance to drop off when wandering
    // Entrances that don't drop off increase in distance
    let modified = false;

    for (const [locationId, discovered] of Object.entries(this.state.discoveredLocations)) {
      const location = getLocation(locationId);
      if (!location) continue;

      // Only process locations accessible from current location
      const parentId = location.parentId ?? null;
      if (parentId !== this.state.currentLocation) continue;

      const entrancesToRemove: number[] = [];
      const baseDropOffChance = 0.08; // Base 8% chance to lose an entrance

      for (let i = 0; i < discovered.entrances.length; i++) {
        const entrance = discovered.entrances[i];
        // Drop-off chance increases with distance
        const distanceMultiplier = 1 + entrance.distance * 0.15; // 15% more per distance
        const dropOffChance = Math.min(0.4, baseDropOffChance * distanceMultiplier);

        if (Math.random() < dropOffChance) {
          entrancesToRemove.push(i);
          modified = true;
        } else {
          // Increase distance for entrances that survive
          entrance.distance++;
          modified = true;
        }
      }

      // Remove dropped entrances (in reverse order)
      for (let i = entrancesToRemove.length - 1; i >= 0; i--) {
        discovered.entrances.splice(entrancesToRemove[i], 1);
      }

      // Remove the location entirely if no entrances remain
      if (discovered.entrances.length === 0) {
        delete this.state.discoveredLocations[locationId];
      }
    }

    // Invalidate cache if any entrances were modified
    if (modified) {
      this.invalidateLocationCache();
    }
  }

  private processCorpseCleanup(actionId: string): void {
    const corpse = this.state.pendingCorpse;
    if (!corpse) return;

    // If leave-corpse was used, always clear
    if (actionId === 'leave-corpse') {
      this.state.pendingCorpse = null;
      return;
    }

    // Check if corpse is fully harvested
    const canBeButchered = canButcher(corpse.enemyId);
    const canBeSkinned = canSkin(corpse.enemyId);

    const butcheringDone = !canBeButchered || corpse.butchered;
    const skinningDone = !canBeSkinned || corpse.skinned;

    if (butcheringDone && skinningDone) {
      this.state.pendingCorpse = null;
    }
  }

  private checkForEncounter(chance: number = 0.25): void {
    // No encounters in safe locations
    const locationInfo = this.getCurrentLocation();
    if (locationInfo.isSafe) {
      return;
    }

    if (Math.random() < chance) {
      this.startEncounter();
    }
  }

  startEncounter(enemy?: ReturnType<typeof getRandomEnemy>): void {
    const playerLevel = this.state.player.levelInfo.level;
    const locationId = this.state.currentLocation;
    const encounter = createEncounter(enemy, playerLevel, locationId);
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

        this.handleEnemyDeath(enemy);
        this.recoverProjectiles();
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
        this.recoverProjectiles();
        break;
    }

    this.state.encounter = null;
    this.emit('encounter-end');
  }

  private handleEnemyDeath(enemy: typeof this.state.player): void {
    const template = getEnemyTemplate(enemy);

    // Bandits and enemies with inventory drop loot directly
    if (template?.usesInventory) {
      this.setPendingLoot(enemy);
      return;
    }

    // Animals/monsters leave a corpse for harvesting
    const canBeButchered = canButcher(enemy.id);
    const canBeSkinned = canSkin(enemy.id);

    if (canBeButchered || canBeSkinned) {
      this.state.pendingCorpse = {
        enemyId: enemy.id,
        enemyName: enemy.name,
        butchered: false,
        skinned: false,
      };

      const actions: string[] = [];
      if (canBeButchered) actions.push('butchered');
      if (canBeSkinned) actions.push('skinned');
      this.log(`The ${enemy.name}'s corpse can be ${actions.join(' and ')}.`);
    }
  }

  private recoverProjectiles(): void {
    if (!this.state.encounter) return;

    const recovery = calculateProjectileRecovery(this.state.encounter);
    const player = this.state.player;
    const messages: string[] = [];

    if (recovery.arrows > 0) {
      addItem(player, 'arrow', recovery.arrows);
      messages.push(`${recovery.arrows} arrow${recovery.arrows > 1 ? 's' : ''}`);
    }

    if (recovery.rocks > 0) {
      addItem(player, 'rocks', recovery.rocks);
      messages.push(`${recovery.rocks} rock${recovery.rocks > 1 ? 's' : ''}`);
    }

    if (messages.length > 0) {
      this.log(`Recovered: ${messages.join(', ')}`);
    }
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

  // === Weapon Back Slots Management ===

  addToBackSlots(itemId: string, fromEquipped: boolean = false): boolean {
    if (this.state.encounter) {
      this.log("Can't modify back slots during combat!");
      return false;
    }

    const player = this.state.player;

    if (!canStoreOnBack(itemId)) {
      this.log('That item cannot be stored on your back.');
      return false;
    }

    if (!canAddToBackSlots(player, itemId)) {
      const item = getItem(itemId);
      const alreadyOnBack = player.backSlots.includes(itemId);
      const slotsUsed = player.backSlots.filter(s => s !== null).length;
      if (alreadyOnBack) {
        this.log('That weapon is already on your back.');
      } else if (slotsUsed >= 3) {
        this.log('Back slots are full (max 3 weapons).');
      } else if (item?.twoHanded) {
        this.log('Cannot add more two-handed weapons (max 2).');
      } else {
        this.log('Cannot add weapon to back slots.');
      }
      return false;
    }

    if (addToBackSlots(player, itemId, undefined, fromEquipped)) {
      const item = getItem(itemId);
      this.log(`Added ${item?.name ?? itemId} to back slots.`);
      this.emit('turn');
      return true;
    }

    this.log('Cannot add weapon to back slots.');
    return false;
  }

  removeFromBackSlots(itemId: string): boolean {
    if (this.state.encounter) {
      this.log("Can't modify back slots during combat!");
      return false;
    }

    const player = this.state.player;

    if (removeFromBackSlots(player, itemId)) {
      const item = getItem(itemId);
      this.log(`Removed ${item?.name ?? itemId} from back slots.`);
      this.emit('turn');
      return true;
    }

    this.log('Weapon not found in back slots.');
    return false;
  }

  getBackSlotsInfo(): { weapons: (string | null)[]; equipped: string | undefined } {
    const player = this.state.player;
    return {
      weapons: player.backSlots,
      equipped: player.equipment.mainHand,
    };
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

    // Auto-save after turn events (state changes)
    if (event === 'turn') {
      this.autoSave();
    }
  }

  private autoSave(): void {
    saveGame(this.state);
    this.emit('save');
  }

  /**
   * Try to load game from saved state
   * Returns true if a save was loaded, false if no save exists
   */
  loadFromSave(): boolean {
    const savedState = loadGame();
    if (savedState) {
      this.state = savedState;
      this.invalidateLocationCache();
      this.emit('load');
      this.emit('turn'); // Trigger UI update
      return true;
    }
    return false;
  }

  /**
   * Clear saved game data
   */
  clearSaveData(): void {
    clearSave();
  }

  getAvailableActions(): Action[] {
    // Start with player's base actions
    let actions = [...this.state.player.actions];

    // Add dynamic enter location actions for discovered locations
    const enterableLocations = this.getEnterableLocations();
    for (const loc of enterableLocations) {
      actions.push(createEnterLocationAction(loc.id, loc.name));
    }

    const inCombat = this.state.encounter !== null;
    const enemyFleeing = this.state.encounter?.enemyFleeing ?? false;
    const player = this.state.player;

    // In combat, add weapon-specific attack actions
    if (inCombat) {
      // Add attack action for currently equipped weapon (no penalty)
      const equippedWeapon = player.equipment.mainHand;
      actions.push(createWeaponAttackAction(equippedWeapon, false));

      // Add attack actions for weapons in back slots (with penalty)
      const backSlotWeapons = getBackSlotWeapons(player);
      for (const weaponId of backSlotWeapons) {
        if (weaponId !== null && weaponId !== equippedWeapon) {
          actions.push(createWeaponAttackAction(weaponId, true));
        }
      }
    }

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

      // Can't flee if already fleeing (waiting for enemy response)
      if (action.id === 'flee' && this.state.encounter?.playerFleeing) {
        return false;
      }

      // Check gathering requirements (need at least one node of that type)
      const gatherNode = gatheringRequirements[action.id];
      if (gatherNode && !this.state.availableNodes.some((n) => n.nodeId === gatherNode)) {
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

      // Bow attacks require arrows (checked in action execute, but filter for UX)
      if (action.id === 'attack-bow' && getItemCount(player, 'arrow') <= 0) {
        return false;
      }

      // Can't wander with a placed campfire
      if (action.id === 'wander' && this.state.structures.has('campfire')) {
        return false;
      }

      // Check harvesting action requirements
      if (action.tags.includes('harvesting')) {
        const corpse = this.state.pendingCorpse;
        if (!corpse) {
          return false;
        }

        // Butcher requires corpse that can be butchered and hasn't been
        if (action.id === 'butcher') {
          if (!canButcher(corpse.enemyId) || corpse.butchered) {
            return false;
          }
        }

        // Skin requires corpse that can be skinned and hasn't been
        if (action.id === 'skin') {
          if (!canSkin(corpse.enemyId) || corpse.skinned) {
            return false;
          }
        }
      }

      // Exit location only available when in a location with found exit
      if (action.id === 'exit-location') {
        if (this.state.currentLocation === null || !this.state.foundExit) {
          return false;
        }
        // Can't exit with a placed campfire
        if (this.state.structures.has('campfire')) {
          return false;
        }
      }

      // Enter location actions require no campfire
      if (action.id.startsWith('enter-location-') && this.state.structures.has('campfire')) {
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
      // Weapon-specific attack actions - highest priority
      if (action.tags.includes('weapon-attack')) {
        score += 100;
        return score;
      }

      // Legacy generic attack (for backwards compatibility)
      if (action.id === 'attack') score += 100;
      if (action.id === 'flee') score += 80;

      if (action.id === 'throw-rock') score += 70;
      if (action.id === 'chase' && enemyFleeing) score += 90;
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

    // Harvesting actions when corpse available - high priority
    if (action.tags.includes('harvesting')) {
      if (action.id === 'butcher' || action.id === 'skin') {
        score += 90; // High priority to harvest before corpse decays
      } else if (action.id === 'leave-corpse') {
        score += 20; // Lower priority than actually harvesting
      }
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
      'Harvest': [],
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
      } else if (action.id === 'exit-location' || action.id.startsWith('enter-location-')) {
        categories['Explore'].push(action);
      } else if (action.tags.includes('harvesting')) {
        categories['Harvest'].push(action);
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

  // === Action Tracking System ===

  // Create a snapshot of current state for tracking
  private createStateSnapshot(): ActionStateSnapshot {
    const player = this.state.player;
    const encounter = this.state.encounter;

    return {
      turn: this.state.turn,
      ticks: player.ticks,
      maxTicks: player.maxTicks,
      health: player.health,
      maxHealth: player.maxHealth,
      saturation: player.saturation,
      maxSaturation: player.maxSaturation,
      inCombat: encounter !== null,
      enemyName: encounter?.enemy.name,
      enemyHealth: encounter?.enemy.health,
      enemyMaxHealth: encounter?.enemy.maxHealth,
      enemyFleeing: encounter?.enemyFleeing,
      playerFleeing: encounter?.playerFleeing,
      availableNodes: this.state.availableNodes.map(n => n.nodeId),
      hasCorpse: this.state.pendingCorpse !== null,
      inventory: {
        berries: getItemCount(player, 'berries'),
        rawMeat: getItemCount(player, 'raw-meat'),
        cookedMeat: getItemCount(player, 'cooked-meat'),
        arrows: getItemCount(player, 'arrow'),
        rocks: getItemCount(player, 'rock'),
      },
      mainHand: player.equipment.mainHand ?? null,
      offHand: player.equipment.offHand ?? null,
      hasCampfire: getItemCount(player, 'campfire') > 0,
      campfirePlaced: this.state.structures.has('campfire'),
      currentLocation: this.state.currentLocation,
      foundExit: this.state.foundExit,
    };
  }

  // Record an action that was taken
  private recordAction(action: Action): void {
    if (!this.trackingEnabled) return;

    const availableActions = this.getAvailableActions();
    const sortedActions = this.sortActionsByPriority(availableActions);
    const suggestedIds = sortedActions.slice(0, 3).map(a => a.id);

    const actionsWithPriority: ActionWithPriority[] = sortedActions.map(a => ({
      id: a.id,
      name: a.name,
      tickCost: a.tickCost,
      effectiveCost: this.getEffectiveTickCost(a),
      priority: this.getActionPriority(a),
      tags: a.tags,
    }));

    const record: ActionTrackingRecord = {
      timestamp: Date.now(),
      state: this.createStateSnapshot(),
      availableActions: actionsWithPriority,
      suggestedActions: suggestedIds,
      takenAction: action.id,
      wasSuggested: suggestedIds.includes(action.id),
    };

    this.actionTrackingRecords.push(record);

    // Persist to localStorage (auto-trims to max size)
    saveTrackingRecords(this.actionTrackingRecords);
  }

  // Get all tracking records
  getTrackingRecords(): ActionTrackingRecord[] {
    return this.actionTrackingRecords;
  }

  // Clear tracking records
  clearTrackingRecords(): void {
    this.actionTrackingRecords = [];
    clearTrackingStorage();
  }

  // Enable/disable tracking
  setTrackingEnabled(enabled: boolean): void {
    this.trackingEnabled = enabled;
  }

  isTrackingEnabled(): boolean {
    return this.trackingEnabled;
  }

  // Export tracking data as JSON string
  exportTrackingData(): string {
    const data = {
      exportedAt: new Date().toISOString(),
      recordCount: this.actionTrackingRecords.length,
      records: this.actionTrackingRecords,
    };
    return JSON.stringify(data, null, 2);
  }

  // Get tracking summary statistics
  getTrackingSummary(): {
    totalActions: number;
    suggestedFollowed: number;
    suggestedIgnored: number;
    followRate: number;
    actionBreakdown: Record<string, number>;
  } {
    const records = this.actionTrackingRecords;
    const totalActions = records.length;
    const suggestedFollowed = records.filter(r => r.wasSuggested).length;
    const suggestedIgnored = totalActions - suggestedFollowed;
    const followRate = totalActions > 0 ? suggestedFollowed / totalActions : 0;

    const actionBreakdown: Record<string, number> = {};
    for (const record of records) {
      actionBreakdown[record.takenAction] = (actionBreakdown[record.takenAction] || 0) + 1;
    }

    return {
      totalActions,
      suggestedFollowed,
      suggestedIgnored,
      followRate,
      actionBreakdown,
    };
  }

  // === Location System ===

  // Discover a new location (add to discovered but don't enter)
  discoverLocation(locationId: string): void {
    const location = getLocation(locationId);
    if (!location) return;

    if (!this.state.discoveredLocations[locationId]) {
      this.state.discoveredLocations[locationId] = {
        locationId,
        entrances: [{ distance: 0 }],
      };
    } else {
      // Add a new entrance with distance 0
      this.state.discoveredLocations[locationId].entrances.push({ distance: 0 });
    }

    this.invalidateLocationCache();
    this.log(location.discoveryMessage);
    this.emit('location-discovered');
  }

  // Enter a discovered location
  enterLocation(locationId: string): boolean {
    const location = getLocation(locationId);
    if (!location) {
      this.log('Unknown location.');
      return false;
    }

    const discovered = this.state.discoveredLocations[locationId];
    if (!discovered || discovered.entrances.length === 0) {
      this.log(`You haven't found an entrance to ${location.name}.`);
      return false;
    }

    // Check if this location's parent matches current location
    if (location.parentId !== (this.state.currentLocation ?? undefined)) {
      this.log(`You can't reach ${location.name} from here.`);
      return false;
    }

    // Use up the closest entrance (lowest distance)
    discovered.entrances.sort((a, b) => a.distance - b.distance);
    discovered.entrances.shift(); // Remove the first (closest) entrance

    if (discovered.entrances.length === 0) {
      delete this.state.discoveredLocations[locationId];
    }

    // Push current location to stack (if not wilderness)
    if (this.state.currentLocation !== null) {
      this.state.locationStack.push(this.state.currentLocation);
    }

    this.state.currentLocation = locationId;
    this.state.foundExit = false;
    // Clear resource nodes when entering new location
    this.state.availableNodes = [];

    this.invalidateLocationCache();
    this.log(`You enter ${location.name}.`);
    this.emit('location-entered');
    return true;
  }

  // Exit the current location (requires having found an exit)
  exitLocation(): boolean {
    if (this.state.currentLocation === null) {
      this.log('You are already in the wilderness.');
      return false;
    }

    if (!this.state.foundExit) {
      this.log("You haven't found a way out yet. Keep exploring!");
      return false;
    }

    const currentLocation = getLocation(this.state.currentLocation);
    const previousLocation = this.state.locationStack.pop() ?? null;

    this.state.currentLocation = previousLocation;
    this.state.foundExit = false;
    // Clear resource nodes when exiting
    this.state.availableNodes = [];

    this.invalidateLocationCache();
    if (previousLocation === null) {
      this.log(`You exit ${currentLocation?.name ?? 'the location'} and return to the wilderness.`);
    } else {
      const prevLoc = getLocation(previousLocation);
      this.log(`You exit ${currentLocation?.name ?? 'the location'} and return to ${prevLoc?.name ?? 'the previous area'}.`);
    }

    this.emit('location-exited');
    return true;
  }

  // Mark that an exit has been found in the current location
  findExit(): void {
    if (this.state.currentLocation === null) {
      return; // Can't find exit from wilderness
    }

    this.state.foundExit = true;
    const location = getLocation(this.state.currentLocation);
    this.log(`You find an exit from ${location?.name ?? 'this location'}!`);
    this.emit('exit-found');
  }

  // Invalidate location caches - call when location state changes
  private invalidateLocationCache(): void {
    this.currentLocationCache = null;
    this.enterableLocationsCache = null;
  }

  // Get current location info (cached)
  getCurrentLocation(): { id: string | null; name: string; isSafe: boolean } {
    if (this.currentLocationCache !== null) {
      return this.currentLocationCache;
    }

    if (this.state.currentLocation === null) {
      this.currentLocationCache = { id: null, name: 'Wilderness', isSafe: false };
      return this.currentLocationCache;
    }

    const location = getLocation(this.state.currentLocation);
    this.currentLocationCache = {
      id: this.state.currentLocation,
      name: location?.name ?? 'Unknown',
      isSafe: location?.isSafe ?? false,
    };
    return this.currentLocationCache;
  }

  // Get info about available resource nodes
  getAvailableNodeInfo(nodeId: string): { count: number; closestDistance: number } | null {
    const nodes = this.state.availableNodes.filter((n) => n.nodeId === nodeId);
    if (nodes.length === 0) return null;

    const closestDistance = Math.min(...nodes.map((n) => n.distance));
    return { count: nodes.length, closestDistance };
  }

  // Calculate effective tick cost for an action (includes distance bonus)
  getEffectiveTickCost(action: Action): number {
    const baseCost = action.tickCost;
    const costPerDistance = 50; // Extra ticks per distance unit

    // Map gathering actions to their resource nodes
    const gatheringNodes: Record<string, string> = {
      'gather-berries': 'berryBush',
      'gather-sticks': 'fallenBranches',
      'gather-rocks': 'rockyOutcrop',
      'gather-fiber': 'tallGrass',
    };

    // Check if this is a gathering action
    const nodeId = gatheringNodes[action.id];
    if (nodeId) {
      const nodeInfo = this.getAvailableNodeInfo(nodeId);
      if (nodeInfo) {
        return baseCost + nodeInfo.closestDistance * costPerDistance;
      }
    }

    // Check if this is an enter location action
    if (action.id.startsWith('enter-location-')) {
      const locationId = action.id.replace('enter-location-', '');
      const enterableLocations = this.getEnterableLocations();
      const location = enterableLocations.find((l) => l.id === locationId);
      if (location) {
        return baseCost + location.closestDistance * costPerDistance;
      }
    }

    return baseCost;
  }

  // Get list of locations that can be entered from current position (cached)
  getEnterableLocations(): Array<{ id: string; name: string; entrances: number; closestDistance: number }> {
    if (this.enterableLocationsCache !== null) {
      return this.enterableLocationsCache;
    }

    const result: Array<{ id: string; name: string; entrances: number; closestDistance: number }> = [];

    for (const [locationId, discovered] of Object.entries(this.state.discoveredLocations)) {
      if (discovered.entrances.length === 0) continue;

      const location = getLocation(locationId);
      if (!location) continue;

      // Check if this location can be entered from current position
      const parentId = location.parentId ?? null;
      if (parentId !== this.state.currentLocation) continue;

      // Find the closest entrance
      const closestDistance = Math.min(...discovered.entrances.map((e) => e.distance));

      result.push({
        id: locationId,
        name: location.name,
        entrances: discovered.entrances.length,
        closestDistance,
      });
    }

    this.enterableLocationsCache = result;
    return result;
  }
}
