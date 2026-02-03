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
  foundLocation?: string; // Location ID discovered
  foundExit?: boolean; // Found exit from current location
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

// Quality is a continuous value from 0-100
// Text descriptors for quality ranges
export type QualityTier = 'broken' | 'poor' | 'normal' | 'good' | 'excellent' | 'masterwork';

// Quality thresholds (value must be >= threshold to reach tier)
export const QUALITY_THRESHOLDS: { tier: QualityTier; minValue: number }[] = [
  { tier: 'masterwork', minValue: 90 },
  { tier: 'excellent', minValue: 75 },
  { tier: 'good', minValue: 50 },
  { tier: 'normal', minValue: 25 },
  { tier: 'poor', minValue: 10 },
  { tier: 'broken', minValue: 0 },
];

// Breakage threshold - items below this quality break during crafting
export const QUALITY_BREAKAGE_THRESHOLD = 10;

// Display names for quality tiers
export const QUALITY_TIER_NAMES: Record<QualityTier, string> = {
  broken: 'Shoddy',
  poor: 'Poor',
  normal: 'Normal',
  good: 'Good',
  excellent: 'Excellent',
  masterwork: 'Masterwork',
};

// Get quality tier from numeric value
export function getQualityTier(value: number): QualityTier {
  for (const { tier, minValue } of QUALITY_THRESHOLDS) {
    if (value >= minValue) return tier;
  }
  return 'broken';
}

// Get quality multiplier from numeric value (linear interpolation)
// 0 quality = 0.5x, 50 quality = 1.0x, 100 quality = 1.5x
export function getQualityMultiplier(value: number): number {
  return 0.5 + (value / 100) * 1.0;
}

// Get display name for quality value
export function getQualityName(value: number): string {
  const tier = getQualityTier(value);
  return QUALITY_TIER_NAMES[tier];
}

// Legacy discrete quality type (kept for backwards compatibility)
export type ItemQuality = 'poor' | 'normal' | 'good' | 'excellent' | 'masterwork';

// Legacy quality multipliers (for backwards compatibility)
export const QUALITY_MULTIPLIERS: Record<ItemQuality, number> = {
  poor: 0.7,
  normal: 1.0,
  good: 1.15,
  excellent: 1.3,
  masterwork: 1.5,
};

// Legacy display names (for backwards compatibility)
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
  quality: ItemQuality; // Legacy discrete quality
  qualityValue: number; // New continuous quality (0-100)
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

// Material quality tracking - stores quality values for each item in inventory
// Each entry is an array of quality values (one per item unit)
// When consuming materials, lowest quality items are used first
export type MaterialQualities = Record<string, number[]>;

// Equipment slots
export type EquipSlot = 'mainHand' | 'offHand' | 'head' | 'chest' | 'legs' | 'feet';

export type Equipment = Partial<Record<EquipSlot, string>>; // slot -> itemId

// Weapon back slots - carry backup weapons for quick switching in combat
// 3 back slots total with constraints:
// - Max 2 two-handed weapons
// - No limit on one-handed weapons
export const MAX_BACK_SLOTS = 3;
export const MAX_TWO_HANDED_BACK = 2;

// Fixed-size array of 3 back slots, each can be a weapon ID or null (empty)
export type WeaponBackSlots = [string | null, string | null, string | null];

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
  materialQualities: MaterialQualities; // Quality values for materials
  equipment: Equipment;
  equipmentInstances: EquipmentInstances; // Item instances with quality
  actions: Action[];
  // Leveling and stats
  levelInfo: LevelInfo;
  // Skills
  skills: Skills;
  // Weapon back slots - quick weapon switching in combat
  backSlots: WeaponBackSlots; // Up to MAX_BACK_SLOTS weapons with type limits
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
  aggressiveness: number; // Dynamic aggressiveness (0-1), increases on attacks, decreases on idle
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
  availableNodes: DiscoveredNode[]; // Resource nodes with distance tracking
  structures: Set<string>; // IDs of structures the player has built
  pendingLoot: Inventory | null; // Loot waiting to be picked up (for bandits, etc.)
  pendingCorpse: PendingCorpse | null; // Corpse waiting to be harvested
  gameOver: boolean;
  // Location system
  currentLocation: string | null; // Current location ID (null = wilderness)
  locationStack: string[]; // Path of nested locations (for exiting back up)
  discoveredLocations: Record<string, DiscoveredLocation>; // Locations found
  foundExit: boolean; // Whether an exit from current location has been found
}

export interface LogEntry {
  turn: number;
  message: string;
}

// === Location System ===

// Locations are nestable areas (dungeons, towns, caves, etc.)
export interface LocationDef {
  id: string;
  name: string;
  description: string;
  // Discovery while wandering in parent location (or wilderness if no parent)
  discoveryChance: number;
  discoveryMessage: string;
  // Chance to find exit while wandering inside this location
  exitDiscoveryChance: number;
  // Optional filter for which enemies can spawn here (empty = use parent's or all)
  availableEnemies?: string[];
  // Optional filter for which resources can be found here (empty = use parent's or all)
  availableResources?: string[];
  // Locations that can be discovered inside this one
  childLocations?: string[];
  // The parent location ID (null/undefined = wilderness)
  parentId?: string;
  // Is this location considered "safe" (no random encounters)?
  isSafe?: boolean;
}

// Tracks a discovered location instance
export interface DiscoveredLocation {
  locationId: string;
  // Each entrance tracks its own distance (wanderings since discovery)
  entrances: { distance: number }[];
}

// Tracks a discovered resource node instance
export interface DiscoveredNode {
  nodeId: string;
  // Distance from discovery (wanderings since found)
  distance: number;
}

// === Action Tracking System ===
// Records action decisions for analysis and improvement

// Snapshot of relevant state when an action is taken
export interface ActionStateSnapshot {
  turn: number;
  // Player state
  ticks: number;
  maxTicks: number;
  health: number;
  maxHealth: number;
  saturation: number;
  maxSaturation: number;
  // Combat state
  inCombat: boolean;
  enemyName?: string;
  enemyHealth?: number;
  enemyMaxHealth?: number;
  enemyFleeing?: boolean;
  playerFleeing?: boolean;
  // Resources
  availableNodes: string[]; // Node IDs
  hasCorpse: boolean;
  // Key inventory counts
  inventory: {
    berries: number;
    rawMeat: number;
    cookedMeat: number;
    arrows: number;
    rocks: number;
  };
  // Equipment
  mainHand: string | null;
  offHand: string | null;
  hasCampfire: boolean;
  campfirePlaced: boolean;
  // Location
  currentLocation: string | null;
  foundExit: boolean;
}

// Action with its computed priority
export interface ActionWithPriority {
  id: string;
  name: string;
  tickCost: number;
  effectiveCost: number; // After distance bonus
  priority: number;
  tags: string[];
}

// A single tracked action decision
export interface ActionTrackingRecord {
  timestamp: number;
  state: ActionStateSnapshot;
  availableActions: ActionWithPriority[];
  suggestedActions: string[]; // IDs of top 3 suggested
  takenAction: string; // ID of action that was taken
  wasSuggested: boolean; // Whether taken action was in suggested
}
