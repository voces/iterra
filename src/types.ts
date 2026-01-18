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
  // Consumable properties
  saturationGain?: number;
  healthGain?: number;
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
  speed: number;
  health: number;
  maxHealth: number;
  damage: number;
  saturation: number;
  maxSaturation: number;
  inventory: Inventory;
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
  gameOver: boolean;
}

export interface LogEntry {
  turn: number;
  message: string;
}
