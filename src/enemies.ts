import type { Actor, LootTable, Inventory, Stats, EnemyStatGrowth } from './types.ts';
import { createActor } from './actor.ts';
import { createEmptyStats } from './stats.ts';

export interface EnemyTemplate {
  id: string;
  name: string;
  maxHealth: number;
  damage: number;
  speed: number;
  fleeThreshold: number; // HP percentage at which enemy considers fleeing
  aggressiveness: number; // 0-1, higher = less likely to flee
  loot: LootTable;
  usesInventory?: boolean; // If true, drops its inventory instead of loot table
  // Stat growth per level
  statGrowth: EnemyStatGrowth;
}

export const enemyTemplates: EnemyTemplate[] = [
  // === Passive/Weak creatures (good for early game) ===
  {
    id: 'rabbit',
    name: 'Rabbit',
    maxHealth: 15,
    damage: 2,
    speed: 150, // Very fast, hard to catch
    fleeThreshold: 0.9, // Flees almost immediately
    aggressiveness: 0.05, // Almost never fights
    loot: {
      rawMeat: { min: 1, max: 1, chance: 1.0 },
    },
    statGrowth: {
      vitality: 0.5,
      strength: 0.2,
      agility: 3, // Very agile
      precision: 0.5,
      baseLevel: 1,
      xpReward: 8,
    },
  },
  {
    id: 'deer',
    name: 'Deer',
    maxHealth: 35,
    damage: 6,
    speed: 130,
    fleeThreshold: 0.8, // Flees when hurt
    aggressiveness: 0.1, // Rarely fights back
    loot: {
      rawMeat: { min: 2, max: 3, chance: 1.0 },
      rawLeather: { min: 1, max: 2, chance: 0.9 },
    },
    statGrowth: {
      vitality: 1,
      strength: 0.5,
      agility: 2,
      precision: 0.5,
      baseLevel: 1,
      xpReward: 15,
    },
  },
  // === Aggressive creatures ===
  {
    id: 'wolf',
    name: 'Wolf',
    maxHealth: 50, // Reduced from 60
    damage: 10, // Reduced from 12
    speed: 120,
    fleeThreshold: 0.3,
    aggressiveness: 0.6,
    loot: {
      rawMeat: { min: 1, max: 2, chance: 0.9 },
      rawLeather: { min: 1, max: 2, chance: 0.7 },
    },
    statGrowth: {
      vitality: 1.5, // Reduced from 2
      strength: 1, // Reduced from 1.5
      agility: 1.5, // Reduced from 2
      precision: 1,
      baseLevel: 1,
      xpReward: 25,
    },
  },
  {
    id: 'boar',
    name: 'Wild Boar',
    maxHealth: 80,
    damage: 15,
    speed: 90,
    fleeThreshold: 0.2,
    aggressiveness: 0.8,
    loot: {
      rawMeat: { min: 2, max: 4, chance: 1.0 },
      rawLeather: { min: 1, max: 3, chance: 0.8 },
    },
    statGrowth: {
      vitality: 3, // Tanky
      strength: 2, // High damage growth
      agility: 0.5, // Slow
      precision: 1,
      baseLevel: 2,
      xpReward: 35,
    },
  },
  {
    id: 'snake',
    name: 'Venomous Snake',
    maxHealth: 30,
    damage: 20,
    speed: 140,
    fleeThreshold: 0.5,
    aggressiveness: 0.4,
    loot: {
      rawMeat: { min: 1, max: 1, chance: 0.5 },
      venomGland: { min: 1, max: 2, chance: 0.8 },
    },
    statGrowth: {
      vitality: 0.5, // Fragile
      strength: 2.5, // High damage (venomous)
      agility: 3, // Very fast and evasive
      precision: 2, // Accurate strikes
      baseLevel: 1,
      xpReward: 30,
    },
  },
  {
    id: 'bandit',
    name: 'Bandit',
    maxHealth: 70,
    damage: 14,
    speed: 100,
    fleeThreshold: 0.25,
    aggressiveness: 0.5,
    loot: {},
    usesInventory: true,
    statGrowth: {
      vitality: 1.5,
      strength: 1.5,
      agility: 1.5,
      precision: 1.5, // Balanced growth
      baseLevel: 2,
      xpReward: 40,
    },
  },
];

function generateBanditInventory(): Inventory {
  const inv: Inventory = {};

  if (Math.random() < 0.5) inv.berries = Math.floor(Math.random() * 4) + 1;
  if (Math.random() < 0.6) inv.sticks = Math.floor(Math.random() * 3) + 1;
  if (Math.random() < 0.4) inv.rocks = Math.floor(Math.random() * 2) + 1;
  if (Math.random() < 0.3) inv.rawMeat = Math.floor(Math.random() * 2) + 1;
  if (Math.random() < 0.2) inv.cookedMeat = 1;

  return inv;
}

// Calculate enemy level based on player level
export function calculateEnemyLevel(template: EnemyTemplate, playerLevel: number): number {
  const { baseLevel } = template.statGrowth;

  // Enemy level scales with player level, with variance
  const levelOffset = Math.floor((playerLevel - 1) * 0.4);

  // At low player levels, reduce variance to prevent unfair fights
  const maxVariance = playerLevel <= 2 ? 0 : 1;
  const randomVariance = Math.floor(Math.random() * (maxVariance * 2 + 1)) - maxVariance;

  // Enemy level can't exceed player level + 1
  const maxLevel = playerLevel + 1;
  return Math.min(maxLevel, Math.max(1, baseLevel + levelOffset + randomVariance));
}

// Generate enemy stats based on level and template
function generateEnemyStats(template: EnemyTemplate, level: number): Stats {
  const { statGrowth } = template;
  const stats = createEmptyStats();

  // Variance factor: 0.8 to 1.2 for each stat
  const variance = () => 0.8 + Math.random() * 0.4;

  // Stats scale with level above 1
  const levelBonus = Math.max(0, level - 1);

  stats.vitality = Math.floor(statGrowth.vitality * levelBonus * variance());
  stats.strength = Math.floor(statGrowth.strength * levelBonus * variance());
  stats.agility = Math.floor(statGrowth.agility * levelBonus * variance());
  stats.precision = Math.floor(statGrowth.precision * levelBonus * variance());

  // Enemies don't use endurance, arcane, or luck much
  stats.endurance = 0;
  stats.arcane = 0;
  stats.luck = Math.floor(Math.random() * 2); // Slight random luck

  return stats;
}

export function createEnemy(template: EnemyTemplate, playerLevel: number = 1): Actor {
  const inventory = template.usesInventory ? generateBanditInventory() : {};
  const level = calculateEnemyLevel(template, playerLevel);
  const stats = generateEnemyStats(template, level);

  // Base values scale slightly with level too
  const levelMultiplier = 1 + (level - 1) * 0.1;
  const scaledHealth = Math.floor(template.maxHealth * levelMultiplier);
  const scaledDamage = Math.floor(template.damage * levelMultiplier);

  return createActor(template.id, template.name, {
    maxHealth: scaledHealth,
    damage: scaledDamage,
    speed: template.speed,
    maxTicks: 5000,
    inventory,
    actions: [],
    level,
    stats,
  });
}

export function generateLoot(enemy: Actor, playerLuckBonus: number = 0): Inventory {
  const template = getEnemyTemplate(enemy);
  if (!template) return {};

  // Bandits drop their inventory
  if (template.usesInventory) {
    return { ...enemy.inventory };
  }

  // Other enemies use loot tables
  const loot: Inventory = {};
  for (const [itemId, drop] of Object.entries(template.loot)) {
    if (Math.random() < drop.chance) {
      // Base amount plus luck bonus
      const baseAmount = Math.floor(Math.random() * (drop.max - drop.min + 1)) + drop.min;
      const bonusAmount = Math.floor(baseAmount * playerLuckBonus);
      loot[itemId] = baseAmount + bonusAmount;
    }
  }
  return loot;
}

export function getRandomEnemy(playerLevel: number = 1): Actor {
  // Weight enemy selection based on player level
  // At level 1-2: favor passive creatures (rabbit, deer)
  // At level 3+: more balanced selection
  let weightedTemplates: EnemyTemplate[];

  if (playerLevel <= 2) {
    // Early game: 50% passive, 50% aggressive
    const passiveCreatures = enemyTemplates.filter(
      (t) => t.id === 'rabbit' || t.id === 'deer'
    );
    const aggressiveCreatures = enemyTemplates.filter(
      (t) => t.id !== 'rabbit' && t.id !== 'deer' && t.statGrowth.baseLevel <= playerLevel
    );

    if (Math.random() < 0.5 && passiveCreatures.length > 0) {
      weightedTemplates = passiveCreatures;
    } else if (aggressiveCreatures.length > 0) {
      weightedTemplates = aggressiveCreatures;
    } else {
      weightedTemplates = passiveCreatures.length > 0 ? passiveCreatures : enemyTemplates;
    }
  } else {
    // Later game: filter by base level
    weightedTemplates = enemyTemplates.filter(
      (t) => t.statGrowth.baseLevel <= playerLevel
    );
    if (weightedTemplates.length === 0) {
      weightedTemplates = enemyTemplates;
    }
  }

  const template = weightedTemplates[Math.floor(Math.random() * weightedTemplates.length)];
  return createEnemy(template, playerLevel);
}

// Get XP reward for killing an enemy
export function getXpReward(enemy: Actor, playerLevel: number): number {
  const template = getEnemyTemplate(enemy);
  if (!template) return 10;

  const baseXp = template.statGrowth.xpReward;
  const enemyLevel = enemy.levelInfo.level;

  // Level difference modifier
  const levelDiff = enemyLevel - playerLevel;
  let modifier = 1;

  if (levelDiff > 0) {
    // Bonus for higher level enemies (10% per level)
    modifier = 1 + levelDiff * 0.1;
  } else if (levelDiff < 0) {
    // Penalty for lower level enemies (min 10%)
    modifier = Math.max(0.1, 1 + levelDiff * 0.15);
  }

  return Math.floor(baseXp * enemyLevel * modifier);
}

export function getEnemyTemplate(enemy: Actor): EnemyTemplate | undefined {
  return enemyTemplates.find((t) => t.id === enemy.id);
}
