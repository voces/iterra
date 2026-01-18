import type { Actor } from './types.ts';
import { createActor } from './actor.ts';

export interface EnemyTemplate {
  id: string;
  name: string;
  maxHealth: number;
  damage: number;
  speed: number;
  fleeThreshold: number; // HP percentage at which enemy considers fleeing
  aggressiveness: number; // 0-1, higher = less likely to flee
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
  },
  {
    id: 'boar',
    name: 'Wild Boar',
    maxHealth: 80,
    damage: 15,
    speed: 90,
    fleeThreshold: 0.2,
    aggressiveness: 0.8,
  },
  {
    id: 'snake',
    name: 'Venomous Snake',
    maxHealth: 30,
    damage: 20,
    speed: 140,
    fleeThreshold: 0.5,
    aggressiveness: 0.4,
  },
  {
    id: 'bandit',
    name: 'Bandit',
    maxHealth: 70,
    damage: 14,
    speed: 100,
    fleeThreshold: 0.25,
    aggressiveness: 0.5,
  },
];

export function createEnemy(template: EnemyTemplate): Actor {
  return createActor(template.id, template.name, {
    maxHealth: template.maxHealth,
    damage: template.damage,
    speed: template.speed,
    maxTicks: 5000,
    actions: [],
  });
}

export function getRandomEnemy(): Actor {
  const template = enemyTemplates[Math.floor(Math.random() * enemyTemplates.length)];
  return createEnemy(template);
}

export function getEnemyTemplate(enemy: Actor): EnemyTemplate | undefined {
  return enemyTemplates.find((t) => t.id === enemy.id);
}
