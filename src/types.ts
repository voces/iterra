export interface Action {
  id: string;
  name: string;
  description: string;
  tickCost: number;
  tickGain?: number;
  tags: string[];
  execute: (actor: Actor, context?: ActionContext) => ActionResult;
}

export interface ActionContext {
  encounter?: Encounter;
  game?: GameState;
}

export interface ActionResult {
  success: boolean;
  message: string;
  encounterEnded?: boolean;
  fled?: boolean;
  foundResource?: string;
}

// Inventory is a flexible map of item IDs to quantities
export type Inventory = Record<string, number>;

// Equipment slots
export type EquipSlot = 'mainHand' | 'offHand' | 'head' | 'chest' | 'legs' | 'feet';

export type Equipment = Partial<Record<EquipSlot, string>>; // slot -> itemId

export interface LootTable {
  [itemId: string]: { min: number; max: number; chance: number };
}

// Item definitions
export interface ItemDef {
  id: string;
  name: string;
  description: string;
  stackable: boolean;
  maxStack?: number;
  tags: string[];
  weight: number; // Weight per unit
  // Consumable properties
  saturationGain?: number;
  healthGain?: number;
  // Equipment properties
  equipSlot?: EquipSlot;
  twoHanded?: boolean; // Takes both hand slots
  damageBonus?: number;
  armorBonus?: number; // Reduces damage taken
  rangedBonus?: number; // Bonus vs fleeing enemies, reduces damage taken
}

// Resource node definitions (things you can find and gather from)
export interface ResourceNodeDef {
  id: string;
  name: string;
  description: string;
  gatherActionId: string;
  discoveryChance: number; // Chance to find while wandering
  discoveryMessage: string;
  depletionChance: number; // Chance node depletes after gathering
}

// Crafting recipe definitions
export interface RecipeDef {
  id: string;
  name: string;
  description: string;
  inputs: Record<string, number>; // itemId -> quantity needed
  outputs: Record<string, number>; // itemId -> quantity produced
  tickCost: number;
  requiresCampfire?: boolean;
  unlocks?: string; // ID of something this unlocks (e.g., 'campfire')
}

// Structures the player can build
export interface StructureDef {
  id: string;
  name: string;
  description: string;
}

export interface Actor {
  id: string;
  name: string;
  ticks: number;
  maxTicks: number;
  speed: number; // Base speed
  carryCapacity: number; // Max weight before penalties
  health: number;
  maxHealth: number;
  damage: number; // Base damage
  saturation: number;
  maxSaturation: number;
  inventory: Inventory;
  equipment: Equipment;
  actions: Action[];
}

export interface Encounter {
  enemy: Actor;
  playerFleeing: boolean;
  enemyFleeing: boolean;
  ended: boolean;
  result?: 'victory' | 'defeat' | 'player_escaped' | 'enemy_escaped';
}

export interface GameState {
  player: Actor;
  turn: number;
  log: LogEntry[];
  encounter: Encounter | null;
  availableNodes: Set<string>; // IDs of resource nodes currently available to gather
  structures: Set<string>; // IDs of structures the player has built
  pendingLoot: Inventory | null; // Loot waiting to be picked up
  gameOver: boolean;
}

export interface LogEntry {
  turn: number;
  message: string;
}
