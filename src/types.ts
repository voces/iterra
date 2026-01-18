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
  // Projectile outcome for recovery tracking
  projectileUsed?: {
    type: 'arrow' | 'rock';
    outcome: 'hit' | 'dodged' | 'blocked' | 'missed';
  };
}

// === Skills System ===

// Combat skills - improve with weapon/combat usage
export type CombatSkillType =
  | 'unarmed' // Fighting without weapons
  | 'knife' // Knives and daggers
  | 'spear' // Spears and polearms
  | 'archery' // Bows and crossbows
  | 'throwing' // Thrown weapons (rocks, javelins)
  | 'shield'; // Shield blocking

// Crafting skills - improve with crafting
export type CraftingSkillType =
  | 'crafting'; // General crafting (can subdivide later: weaponsmithing, armorsmithing, etc.)

// Harvesting skills - improve with harvesting corpses
export type HarvestingSkillType =
  | 'butchering' // Extracting meat from corpses
  | 'skinning'; // Extracting hides/leather from corpses

export type SkillType = CombatSkillType | CraftingSkillType | HarvestingSkillType;

export interface Skill {
  level: number; // 1-100
  xp: number;
  xpToNextLevel: number;
  lastGainedAt: number; // Turn number when XP was last gained (-1 if never)
}

export type Skills = Record<SkillType, Skill>;

// === Item Quality System ===

export type ItemQuality = 'poor' | 'normal' | 'good' | 'excellent' | 'masterwork';

// Quality multipliers for item stats
export const QUALITY_MULTIPLIERS: Record<ItemQuality, number> = {
  poor: 0.7,
  normal: 1.0,
  good: 1.15,
  excellent: 1.3,
  masterwork: 1.5,
};

// Display names for quality
export const QUALITY_NAMES: Record<ItemQuality, string> = {
  poor: 'Poor',
  normal: 'Normal',
  good: 'Good',
  excellent: 'Excellent',
  masterwork: 'Masterwork',
};

// Instance of an item with quality (for equipped/inventory items with variance)
export interface ItemInstance {
  itemId: string;
  quality: ItemQuality;
  // Actual stats after quality modifier applied
  minDamage?: number;
  maxDamage?: number;
  armorBonus?: number;
  blockBonus?: number;
  accuracy?: number;
}

// === Stats System ===

// Core stats that can be leveled
export type StatType =
  | 'vitality' // +5 max HP per point
  | 'strength' // +1 melee damage, synergy with agility
  | 'agility' // +5 dodge rating, +2 speed, +3 attack rating
  | 'precision' // +5 attack rating, +1 ranged damage
  | 'endurance' // +1 max saturation, reduces hunger decay
  | 'arcane' // Magic capacity (future)
  | 'luck'; // +2 dodge rating, crits, loot

export type Stats = Record<StatType, number>;

// Tracks which stats were used for auto-leveling
export type StatUsage = Record<StatType, number>;

export interface LevelInfo {
  level: number;
  xp: number;
  xpToNextLevel: number;
  freeStatPoints: number;
  stats: Stats;
  statUsage: StatUsage; // Tracks actions for auto-stat assignment
}

// Enemy stat growth per level (different for each enemy type)
export interface EnemyStatGrowth {
  vitality: number; // HP per level
  strength: number; // Damage per level
  agility: number; // Dodge/speed per level
  precision: number; // Hit chance per level
  baseLevel: number; // Minimum level for this enemy type
  xpReward: number; // Base XP, scaled by level
}

// Inventory is a flexible map of item IDs to quantities
export type Inventory = Record<string, number>;

// Equipment slots
export type EquipSlot = 'mainHand' | 'offHand' | 'head' | 'chest' | 'legs' | 'feet';

export type Equipment = Partial<Record<EquipSlot, string>>; // slot -> itemId

// Equipment with item instances (quality variation)
export type EquipmentInstances = Partial<Record<EquipSlot, ItemInstance>>;

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
  minDamage?: number; // Weapon min damage (replaces actor base damage)
  maxDamage?: number; // Weapon max damage
  // Stat scaling - damage bonus per point of stat
  strengthScaling?: number; // Melee weapons often scale with strength
  agilityScaling?: number; // Light/fast weapons scale with agility
  precisionScaling?: number; // Ranged weapons scale with precision
  armorBonus?: number; // Reduces damage taken
  rangedBonus?: number; // Bonus vs fleeing enemies, reduces damage taken
  accuracy?: number; // Weapon accuracy bonus/penalty to attack rating
  dodgePenalty?: number; // Armor penalty to dodge rating (heavy armor)
  blockBonus?: number; // Shield block rating bonus
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
  dropOffChance: number; // Chance to lose this node when wandering
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
  equipmentInstances: EquipmentInstances; // Item instances with quality
  actions: Action[];
  // Leveling and stats
  levelInfo: LevelInfo;
  // Skills
  skills: Skills;
}

// Tracks projectile usage during combat for recovery calculation
export interface ProjectileOutcome {
  hit: number;
  dodged: number;
  blocked: number;
  missed: number;
}

export interface ProjectileTracking {
  arrows: ProjectileOutcome;
  rocks: ProjectileOutcome;
}

export interface Encounter {
  enemy: Actor;
  playerFleeing: boolean;
  enemyFleeing: boolean;
  ended: boolean;
  result?: 'victory' | 'defeat' | 'player_escaped' | 'enemy_escaped';
  projectilesUsed: ProjectileTracking;
}

// Corpse that can be harvested for resources
export interface PendingCorpse {
  enemyId: string; // The template ID of the enemy
  enemyName: string; // Display name
  butchered: boolean; // Whether meat has been extracted
  skinned: boolean; // Whether hide has been extracted
}

export interface GameState {
  player: Actor;
  turn: number;
  log: LogEntry[];
  encounter: Encounter | null;
  availableNodes: Record<string, number>; // Node type ID -> count of available instances
  structures: Set<string>; // IDs of structures the player has built
  pendingLoot: Inventory | null; // Loot waiting to be picked up (for bandits, etc.)
  pendingCorpse: PendingCorpse | null; // Corpse waiting to be harvested
  gameOver: boolean;
}

export interface LogEntry {
  turn: number;
  message: string;
}
