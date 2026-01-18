import type { Stats, StatType, StatUsage, LevelInfo, Actor } from './types.ts';

// === Constants ===

export const STAT_TYPES: StatType[] = [
  'vitality',
  'strength',
  'agility',
  'precision',
  'endurance',
  'arcane',
  'luck',
];

// XP scaling: XP needed = BASE_XP * level^XP_EXPONENT
const BASE_XP = 100;
const XP_EXPONENT = 1.5;

// Stats gained per level
const AUTO_STATS_PER_LEVEL = 3; // Based on usage
const FREE_STATS_PER_LEVEL = 2; // Player choice

// === Stat Creation ===

export function createEmptyStats(): Stats {
  return {
    vitality: 0,
    strength: 0,
    agility: 0,
    precision: 0,
    endurance: 0,
    arcane: 0,
    luck: 0,
  };
}

export function createEmptyStatUsage(): StatUsage {
  return {
    vitality: 0,
    strength: 0,
    agility: 0,
    precision: 0,
    endurance: 0,
    arcane: 0,
    luck: 0,
  };
}

export function createLevelInfo(level: number = 1, stats?: Partial<Stats>): LevelInfo {
  const baseStats = createEmptyStats();
  if (stats) {
    Object.assign(baseStats, stats);
  }

  return {
    level,
    xp: 0,
    xpToNextLevel: calculateXpForLevel(level + 1),
    freeStatPoints: 0,
    stats: baseStats,
    statUsage: createEmptyStatUsage(),
  };
}

// === XP and Leveling ===

export function calculateXpForLevel(level: number): number {
  return Math.floor(BASE_XP * Math.pow(level, XP_EXPONENT));
}

export function addXp(levelInfo: LevelInfo, amount: number): { levelsGained: number; autoStats: StatType[] } {
  levelInfo.xp += amount;
  let levelsGained = 0;
  const autoStats: StatType[] = [];

  while (levelInfo.xp >= levelInfo.xpToNextLevel) {
    levelInfo.xp -= levelInfo.xpToNextLevel;
    levelInfo.level++;
    levelInfo.xpToNextLevel = calculateXpForLevel(levelInfo.level + 1);
    levelInfo.freeStatPoints += FREE_STATS_PER_LEVEL;
    levelsGained++;

    // Auto-assign stats based on usage
    const assigned = autoAssignStats(levelInfo, AUTO_STATS_PER_LEVEL);
    autoStats.push(...assigned);
  }

  return { levelsGained, autoStats };
}

// Auto-assign stats based on usage patterns with some randomness
function autoAssignStats(levelInfo: LevelInfo, count: number): StatType[] {
  const assigned: StatType[] = [];
  const usage = levelInfo.statUsage;

  // Calculate weights based on usage
  const totalUsage = Object.values(usage).reduce((a, b) => a + b, 0);

  for (let i = 0; i < count; i++) {
    let stat: StatType;

    if (totalUsage === 0 || Math.random() < 0.3) {
      // 30% chance of random stat, or if no usage data
      stat = STAT_TYPES[Math.floor(Math.random() * STAT_TYPES.length)];
    } else {
      // Weighted by usage
      let roll = Math.random() * totalUsage;
      stat = 'vitality'; // Default

      for (const [key, value] of Object.entries(usage)) {
        roll -= value;
        if (roll <= 0) {
          stat = key as StatType;
          break;
        }
      }
    }

    levelInfo.stats[stat]++;
    assigned.push(stat);
  }

  // Reset usage after level up
  Object.keys(levelInfo.statUsage).forEach((key) => {
    levelInfo.statUsage[key as StatType] = 0;
  });

  return assigned;
}

export function allocateStatPoint(levelInfo: LevelInfo, stat: StatType): boolean {
  if (levelInfo.freeStatPoints <= 0) return false;

  levelInfo.freeStatPoints--;
  levelInfo.stats[stat]++;
  return true;
}

// Track stat usage based on actions
export function trackStatUsage(levelInfo: LevelInfo, stat: StatType, amount: number = 1): void {
  levelInfo.statUsage[stat] += amount;
}

// === Derived Stats Calculations ===
// These functions calculate the effective values based on stats

// Max HP: base + vitality*5 + endurance*2
export function getMaxHealthBonus(stats: Stats): number {
  return stats.vitality * 5 + stats.endurance * 2;
}

// Melee damage: strength + (strength * agility * 0.05) synergy
export function getMeleeDamageBonus(stats: Stats): number {
  const base = stats.strength;
  const synergy = Math.floor(stats.strength * stats.agility * 0.05);
  return base + synergy;
}

// Ranged damage: precision + (precision * agility * 0.05) synergy
export function getRangedDamageBonus(stats: Stats): number {
  const base = stats.precision;
  const synergy = Math.floor(stats.precision * stats.agility * 0.05);
  return base + synergy;
}

// Attack Rating: precision*5 + agility*3 + level*2 + weaponAccuracy
export function getAttackRating(stats: Stats, level: number, weaponAccuracy: number = 0): number {
  return stats.precision * 5 + stats.agility * 3 + level * 2 + weaponAccuracy + 10; // +10 base
}

// Dodge Rating: agility*5 + luck*2 + level*2 - armorPenalty
export function getDodgeRating(stats: Stats, level: number, armorPenalty: number = 0): number {
  return Math.max(0, stats.agility * 5 + stats.luck * 2 + level * 2 + 10 - armorPenalty); // +10 base
}

// Block Rating: strength*3 + agility*2 + shieldBonus
// Blocking is for shields - higher chance than dodge but reduces damage instead of avoiding
export function getBlockRating(stats: Stats, level: number, shieldBlockBonus: number = 0): number {
  if (shieldBlockBonus === 0) return 0; // No shield = can't block
  return stats.strength * 3 + stats.agility * 2 + level * 2 + shieldBlockBonus;
}

// Block damage reduction: strength * 2 + shieldArmor
// Returns the flat damage reduction when blocking
export function getBlockDamageReduction(stats: Stats, shieldArmor: number = 0): number {
  return stats.strength * 2 + shieldArmor;
}

// Calculate block chance: similar formula to hit chance but separate from dodge
export function calculateBlockChance(blockRating: number, attackerAR: number): number {
  if (blockRating === 0) return 0;
  // Block is easier than dodge (more reliable with shield)
  return blockRating / (blockRating + attackerAR * 0.7);
}

// Hit chance formula (D2-style): AR / (AR + DR) * levelFactor
export function calculateHitChance(
  attackerAR: number,
  defenderDR: number,
  attackerLevel: number,
  defenderLevel: number
): number {
  // Level factor: 2 * alvl / (alvl + dlvl)
  // This gives 1.0 when levels equal, higher when attacker > defender
  const levelFactor = (2 * attackerLevel) / (attackerLevel + defenderLevel);

  // Base AR vs DR calculation
  const baseChance = attackerAR / (attackerAR + defenderDR);

  // Apply level factor
  return baseChance * levelFactor;
}

// Legacy functions for backward compatibility (will compute based on stats only)
export function getHitChance(stats: Stats): number {
  // Rough approximation when we don't have full context
  const ar = getAttackRating(stats, 1, 0);
  return ar / (ar + 20);
}

export function getDodgeChance(stats: Stats): number {
  // Rough approximation when we don't have full context
  const dr = getDodgeRating(stats, 1, 0);
  return dr / (dr + 40);
}

// Speed bonus: agility * 2
export function getSpeedBonus(stats: Stats): number {
  return stats.agility * 2;
}

// Max saturation bonus: endurance
export function getMaxSaturationBonus(stats: Stats): number {
  return stats.endurance;
}

// Hunger decay reduction: 1% per endurance point (chance to skip decay)
export function getHungerResistance(stats: Stats): number {
  return Math.min(0.50, stats.endurance * 0.01); // Cap at 50%
}

// Critical hit chance: luck*1.5% + precision*0.5%
export function getCritChance(stats: Stats): number {
  return Math.min(0.30, stats.luck * 0.015 + stats.precision * 0.005); // Cap at 30%
}

// Critical damage multiplier: 1.5 + luck*0.02
export function getCritMultiplier(stats: Stats): number {
  return 1.5 + stats.luck * 0.02;
}

// Loot bonus: luck * 5% extra loot quantity
export function getLootBonus(stats: Stats): number {
  return stats.luck * 0.05;
}

// Magic capacity (for future): arcane * 10
export function getMagicCapacity(stats: Stats): number {
  return stats.arcane * 10;
}

// === Combat Calculations ===

export interface AttackResult {
  hit: boolean;
  dodged: boolean;
  blocked: boolean;
  critical: boolean;
  damage: number;
  message: string;
}

export interface AttackOptions {
  attackerWeaponAccuracy?: number;
  defenderArmorPenalty?: number;
  defenderBlockBonus?: number;
  defenderShieldArmor?: number;
  isRanged?: boolean;
}

export function calculateAttack(
  attacker: Actor,
  defender: Actor,
  baseDamage: number,
  options: AttackOptions = {}
): AttackResult {
  const {
    attackerWeaponAccuracy = 0,
    defenderArmorPenalty = 0,
    defenderBlockBonus = 0,
    defenderShieldArmor = 0,
    isRanged = false,
  } = options;

  const attackerStats = attacker.levelInfo.stats;
  const defenderStats = defender.levelInfo.stats;
  const attackerLevel = attacker.levelInfo.level;
  const defenderLevel = defender.levelInfo.level;

  // Calculate Attack Rating
  const attackerAR = getAttackRating(attackerStats, attackerLevel, attackerWeaponAccuracy);

  // Calculate damage first (needed for block calculations)
  let damage = baseDamage;
  if (isRanged) {
    damage += getRangedDamageBonus(attackerStats);
  } else {
    damage += getMeleeDamageBonus(attackerStats);
  }

  // Critical hit check (done early to apply to blocked damage too)
  const critChance = getCritChance(attackerStats);
  const isCritical = Math.random() < critChance;
  if (isCritical) {
    const critMult = getCritMultiplier(attackerStats);
    damage = Math.floor(damage * critMult);
  }

  // If defender has a shield, check for block first
  // Block reduces damage but doesn't avoid it entirely
  if (defenderBlockBonus > 0) {
    const blockRating = getBlockRating(defenderStats, defenderLevel, defenderBlockBonus);
    const blockChance = calculateBlockChance(blockRating, attackerAR);

    if (Math.random() < blockChance) {
      // Blocked! Reduce damage based on strength and shield armor
      const blockReduction = getBlockDamageReduction(defenderStats, defenderShieldArmor);
      const blockedDamage = Math.max(1, damage - blockReduction); // Minimum 1 damage
      return {
        hit: true,
        dodged: false,
        blocked: true,
        critical: isCritical,
        damage: blockedDamage,
        message: isCritical ? 'blocked critical' : 'blocked',
      };
    }
  }

  // No shield or didn't block - check dodge
  const defenderDR = getDodgeRating(defenderStats, defenderLevel, defenderArmorPenalty);
  const hitChance = calculateHitChance(attackerAR, defenderDR, attackerLevel, defenderLevel);

  // Roll for hit/dodge
  const hitRoll = Math.random();

  if (hitRoll > hitChance) {
    // Miss or dodge - we combine them into one roll
    // If close to hit chance, call it a dodge; if far, call it a miss
    const isDodge = hitRoll < hitChance + 0.15;
    return {
      hit: false,
      dodged: isDodge,
      blocked: false,
      critical: false,
      damage: 0,
      message: isDodge ? 'dodged' : 'missed',
    };
  }

  // Hit landed
  return {
    hit: true,
    dodged: false,
    blocked: false,
    critical: isCritical,
    damage,
    message: isCritical ? 'critical' : 'hit',
  };
}

// === Enemy Stat Scaling ===

export function generateEnemyStats(
  baseLevel: number,
  playerLevel: number
): { level: number; stats: Stats } {
  // Enemy level scales with player, with some variance
  const levelOffset = Math.floor((playerLevel - 1) * 0.4);
  const randomVariance = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
  const level = Math.max(1, baseLevel + levelOffset + randomVariance);

  const stats = createEmptyStats();

  // Enemies don't use all stats equally - depends on enemy type
  // This is a base function, specific enemies override in enemies.ts

  return { level, stats };
}

// Calculate XP reward for killing an enemy
export function calculateXpReward(
  enemyLevel: number,
  playerLevel: number,
  baseXp: number
): number {
  // Level difference modifier
  const levelDiff = enemyLevel - playerLevel;
  let modifier = 1;

  if (levelDiff > 0) {
    // Bonus for higher level enemies
    modifier = 1 + levelDiff * 0.1;
  } else if (levelDiff < 0) {
    // Penalty for lower level enemies (min 10%)
    modifier = Math.max(0.1, 1 + levelDiff * 0.15);
  }

  // Apply luck bonus
  return Math.floor(baseXp * enemyLevel * modifier);
}

// === Stat Names for UI ===

export const STAT_NAMES: Record<StatType, string> = {
  vitality: 'Vitality',
  strength: 'Strength',
  agility: 'Agility',
  precision: 'Precision',
  endurance: 'Endurance',
  arcane: 'Arcane',
  luck: 'Luck',
};

export const STAT_DESCRIPTIONS: Record<StatType, string> = {
  vitality: '+5 Max HP per point',
  strength: '+1 Melee damage, +3 Block Rating, block damage reduction',
  agility: '+5 Dodge Rating, +3 Attack Rating, +2 Speed',
  precision: '+5 Attack Rating, +1 Ranged damage',
  endurance: '+1 Max Saturation, reduces hunger decay',
  arcane: 'Magic capacity (future)',
  luck: '+2 Dodge Rating, crit chance, loot bonus',
};
