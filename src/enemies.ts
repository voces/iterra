import type { Actor, LootTable, Inventory } from './types.ts';
import { createActor } from './actor.ts';

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
}

export const enemyTemplates: EnemyTemplate[] = [
  {
    id: 'wolf',
    name: 'Wolf',
    maxHealth: 60,
    damage: 12,
    speed: 120,
    fleeThreshold: 0.3,
    aggressiveness: 0.6,
    loot: {
      rawMeat: { min: 1, max: 2, chance: 0.9 },
      rawLeather: { min: 1, max: 2, chance: 0.7 },
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

export function createEnemy(template: EnemyTemplate): Actor {
  const inventory = template.usesInventory ? generateBanditInventory() : {};

  return createActor(template.id, template.name, {
    maxHealth: template.maxHealth,
    damage: template.damage,
    speed: template.speed,
    maxTicks: 5000,
    inventory,
    actions: [],
  });
}

export function generateLoot(enemy: Actor): Inventory {
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
      const amount = Math.floor(Math.random() * (drop.max - drop.min + 1)) + drop.min;
      loot[itemId] = amount;
    }
  }
  return loot;
}

export function getRandomEnemy(): Actor {
  const template = enemyTemplates[Math.floor(Math.random() * enemyTemplates.length)];
  return createEnemy(template);
}

export function getEnemyTemplate(enemy: Actor): EnemyTemplate | undefined {
  return enemyTemplates.find((t) => t.id === enemy.id);
}
