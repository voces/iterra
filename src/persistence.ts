/**
 * Game state persistence module
 *
 * Handles saving and loading game state to/from localStorage.
 * Designed to be resilient to schema changes during active development:
 * - Version tracking for future migrations
 * - Defensive deserialization with fallback defaults
 * - Excludes non-serializable data (functions) and re-attaches on load
 */

import type {
  GameState,
  Actor,
  Encounter,
  LogEntry,
  DiscoveredNode,
  DiscoveredLocation,
  PendingCorpse,
  Inventory,
  Skills,
  LevelInfo,
  Equipment,
  EquipmentInstances,
  MaterialQualities,
} from './types.ts';
import { initialPlayerActions } from './actions.ts';
import { recalculateStats } from './actor.ts';
import { createEmptySkills, calculateSkillXpForLevel } from './skills.ts';
import { calculateXpForLevel } from './stats.ts';
// Enemies don't have actions (they use AI behavior), so we just return empty array

// Increment this when making breaking changes to the save format
const SAVE_VERSION = 1;
const STORAGE_KEY = 'iterra_save';

/**
 * Serializable version of Actor (without function references)
 */
interface SerializedActor {
  id: string;
  name: string;
  ticks: number;
  maxTicks: number;
  speed: number;
  carryCapacity: number;
  health: number;
  maxHealth: number;
  damage: number;
  saturation: number;
  maxSaturation: number;
  inventory: Inventory;
  materialQualities: MaterialQualities;
  equipment: Equipment;
  equipmentInstances: EquipmentInstances;
  levelInfo: LevelInfo;
  skills: Skills;
  // actions are excluded - re-attached on load
}

/**
 * Serializable version of Encounter
 */
interface SerializedEncounter {
  enemy: SerializedActor;
  playerFleeing: boolean;
  enemyFleeing: boolean;
  aggressiveness: number;
  ended: boolean;
  result?: 'victory' | 'defeat' | 'player_escaped' | 'enemy_escaped';
  projectilesUsed: Encounter['projectilesUsed'];
}

/**
 * Serializable version of GameState
 */
interface SerializedGameState {
  version: number;
  savedAt: number; // timestamp
  player: SerializedActor;
  turn: number;
  log: LogEntry[];
  encounter: SerializedEncounter | null;
  availableNodes: DiscoveredNode[];
  structures: string[]; // Set converted to array
  pendingLoot: Inventory | null;
  pendingCorpse: PendingCorpse | null;
  gameOver: boolean;
  currentLocation: string | null;
  locationStack: string[];
  discoveredLocations: Record<string, DiscoveredLocation>;
  foundExit: boolean;
}

/**
 * Serialize an actor (removes non-serializable function references)
 */
function serializeActor(actor: Actor): SerializedActor {
  return {
    id: actor.id,
    name: actor.name,
    ticks: actor.ticks,
    maxTicks: actor.maxTicks,
    speed: actor.speed,
    carryCapacity: actor.carryCapacity,
    health: actor.health,
    maxHealth: actor.maxHealth,
    damage: actor.damage,
    saturation: actor.saturation,
    maxSaturation: actor.maxSaturation,
    inventory: { ...actor.inventory },
    materialQualities: { ...actor.materialQualities },
    equipment: { ...actor.equipment },
    equipmentInstances: { ...actor.equipmentInstances },
    levelInfo: { ...actor.levelInfo, stats: { ...actor.levelInfo.stats }, statUsage: { ...actor.levelInfo.statUsage } },
    skills: { ...actor.skills },
  };
}

/**
 * Deserialize an actor and re-attach actions
 */
function deserializeActor(data: SerializedActor, isPlayer: boolean): Actor {
  // Re-attach actions based on actor type
  // Player gets initialPlayerActions, enemies have empty actions (they use AI behavior)
  const actions = isPlayer ? [...initialPlayerActions] : [];

  // Ensure skills have proper structure (handle old saves missing skills)
  const skills = ensureValidSkills(data.skills);

  // Ensure levelInfo has proper structure
  const levelInfo = ensureValidLevelInfo(data.levelInfo);

  const actor: Actor = {
    id: data.id,
    name: data.name,
    ticks: data.ticks,
    maxTicks: data.maxTicks,
    speed: data.speed,
    carryCapacity: data.carryCapacity ?? 30,
    health: data.health,
    maxHealth: data.maxHealth,
    damage: data.damage,
    saturation: data.saturation,
    maxSaturation: data.maxSaturation,
    inventory: data.inventory ?? {},
    materialQualities: data.materialQualities ?? {},
    equipment: data.equipment ?? {},
    equipmentInstances: data.equipmentInstances ?? {},
    levelInfo,
    skills,
    actions,
  };

  // Recalculate derived stats to ensure consistency
  if (isPlayer) {
    recalculateStats(actor);
  }

  return actor;
}

/**
 * Ensure skills object has all required skill types
 */
function ensureValidSkills(skills: Partial<Skills> | undefined): Skills {
  const emptySkills = createEmptySkills();

  if (!skills) {
    return emptySkills;
  }

  // Merge with empty skills to ensure all fields exist
  const result: Skills = { ...emptySkills };

  for (const [key, skill] of Object.entries(skills)) {
    if (skill && typeof skill === 'object') {
      result[key as keyof Skills] = {
        level: skill.level ?? 0,
        xp: skill.xp ?? 0,
        xpToNextLevel: calculateSkillXpForLevel((skill.level ?? 0) + 1),
        lastGainedAt: skill.lastGainedAt ?? -1,
      };
    }
  }

  return result;
}

/**
 * Ensure levelInfo has all required fields
 */
function ensureValidLevelInfo(levelInfo: Partial<LevelInfo> | undefined): LevelInfo {
  const defaultStats = {
    vitality: 5,
    strength: 5,
    agility: 5,
    precision: 5,
    endurance: 3,
    arcane: 0,
    luck: 2,
  };

  const defaultStatUsage = {
    vitality: 0,
    strength: 0,
    agility: 0,
    precision: 0,
    endurance: 0,
    arcane: 0,
    luck: 0,
  };

  if (!levelInfo) {
    return {
      level: 1,
      xp: 0,
      xpToNextLevel: calculateXpForLevel(2),
      freeStatPoints: 0,
      stats: defaultStats,
      statUsage: defaultStatUsage,
    };
  }

  return {
    level: levelInfo.level ?? 1,
    xp: levelInfo.xp ?? 0,
    xpToNextLevel: calculateXpForLevel((levelInfo.level ?? 1) + 1),
    freeStatPoints: levelInfo.freeStatPoints ?? 0,
    stats: { ...defaultStats, ...levelInfo.stats },
    statUsage: { ...defaultStatUsage, ...levelInfo.statUsage },
  };
}

/**
 * Serialize encounter
 */
function serializeEncounter(encounter: Encounter): SerializedEncounter {
  return {
    enemy: serializeActor(encounter.enemy),
    playerFleeing: encounter.playerFleeing,
    enemyFleeing: encounter.enemyFleeing,
    aggressiveness: encounter.aggressiveness,
    ended: encounter.ended,
    result: encounter.result,
    projectilesUsed: { ...encounter.projectilesUsed },
  };
}

/**
 * Deserialize encounter
 */
function deserializeEncounter(data: SerializedEncounter): Encounter {
  return {
    enemy: deserializeActor(data.enemy, false),
    playerFleeing: data.playerFleeing,
    enemyFleeing: data.enemyFleeing,
    aggressiveness: data.aggressiveness,
    ended: data.ended,
    result: data.result,
    projectilesUsed: data.projectilesUsed ?? {
      arrows: { hit: 0, dodged: 0, blocked: 0, missed: 0 },
      rocks: { hit: 0, dodged: 0, blocked: 0, missed: 0 },
    },
  };
}

/**
 * Serialize the entire game state
 */
export function serializeState(state: GameState): SerializedGameState {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    player: serializeActor(state.player),
    turn: state.turn,
    log: state.log.slice(0, 50), // Keep last 50 log entries to save space
    encounter: state.encounter ? serializeEncounter(state.encounter) : null,
    availableNodes: [...state.availableNodes],
    structures: Array.from(state.structures), // Set to array
    pendingLoot: state.pendingLoot ? { ...state.pendingLoot } : null,
    pendingCorpse: state.pendingCorpse ? { ...state.pendingCorpse } : null,
    gameOver: state.gameOver,
    currentLocation: state.currentLocation,
    locationStack: [...state.locationStack],
    discoveredLocations: { ...state.discoveredLocations },
    foundExit: state.foundExit,
  };
}

/**
 * Deserialize into a full game state
 */
export function deserializeState(data: SerializedGameState): GameState {
  // Future: Add migration logic here based on data.version

  return {
    player: deserializeActor(data.player, true),
    turn: data.turn ?? 0,
    log: data.log ?? [],
    encounter: data.encounter ? deserializeEncounter(data.encounter) : null,
    availableNodes: data.availableNodes ?? [],
    structures: new Set(data.structures ?? []), // Array back to Set
    pendingLoot: data.pendingLoot ?? null,
    pendingCorpse: data.pendingCorpse ?? null,
    gameOver: data.gameOver ?? false,
    currentLocation: data.currentLocation ?? null,
    locationStack: data.locationStack ?? [],
    discoveredLocations: data.discoveredLocations ?? {},
    foundExit: data.foundExit ?? false,
  };
}

/**
 * Save game state to localStorage
 */
export function saveGame(state: GameState): boolean {
  try {
    const serialized = serializeState(state);
    const json = JSON.stringify(serialized);
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch (error) {
    console.error('Failed to save game:', error);
    return false;
  }
}

/**
 * Load game state from localStorage
 * Returns null if no save exists or if load fails
 */
export function loadGame(): GameState | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) {
      return null;
    }

    const data = JSON.parse(json) as SerializedGameState;

    // Basic validation
    if (!data || typeof data !== 'object' || !data.player) {
      console.warn('Invalid save data structure');
      return null;
    }

    return deserializeState(data);
  } catch (error) {
    console.error('Failed to load game:', error);
    return null;
  }
}

/**
 * Check if a saved game exists
 */
export function hasSaveGame(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Clear saved game data
 */
export function clearSave(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get save metadata without loading full state
 */
export function getSaveInfo(): { savedAt: number; turn: number; level: number } | null {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;

    const data = JSON.parse(json) as SerializedGameState;
    return {
      savedAt: data.savedAt ?? 0,
      turn: data.turn ?? 0,
      level: data.player?.levelInfo?.level ?? 1,
    };
  } catch {
    return null;
  }
}

// === Action Tracking Persistence ===

import type { ActionTrackingRecord } from './types.ts';

const TRACKING_STORAGE_KEY = 'iterra_tracking';
const MAX_TRACKING_RECORDS = 500;

/**
 * Save tracking records to localStorage
 * Automatically trims to max size
 */
export function saveTrackingRecords(records: ActionTrackingRecord[]): boolean {
  try {
    // Keep only the most recent records if over limit
    const trimmedRecords = records.length > MAX_TRACKING_RECORDS
      ? records.slice(-MAX_TRACKING_RECORDS)
      : records;

    const json = JSON.stringify(trimmedRecords);
    localStorage.setItem(TRACKING_STORAGE_KEY, json);
    return true;
  } catch (error) {
    console.error('Failed to save tracking records:', error);
    return false;
  }
}

/**
 * Load tracking records from localStorage
 */
export function loadTrackingRecords(): ActionTrackingRecord[] {
  try {
    const json = localStorage.getItem(TRACKING_STORAGE_KEY);
    if (!json) return [];

    const data = JSON.parse(json) as ActionTrackingRecord[];
    if (!Array.isArray(data)) return [];

    return data;
  } catch (error) {
    console.error('Failed to load tracking records:', error);
    return [];
  }
}

/**
 * Clear tracking records from localStorage
 */
export function clearTrackingRecords(): void {
  localStorage.removeItem(TRACKING_STORAGE_KEY);
}

/**
 * Get tracking record count without loading full data
 */
export function getTrackingRecordCount(): number {
  try {
    const json = localStorage.getItem(TRACKING_STORAGE_KEY);
    if (!json) return 0;

    const data = JSON.parse(json) as ActionTrackingRecord[];
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}
