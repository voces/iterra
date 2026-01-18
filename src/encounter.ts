import type { Actor, Encounter, ActionResult } from './types.ts';
import { getRandomEnemy, getEnemyTemplate } from './enemies.ts';
import {
  dealDamage,
  isAlive,
  addTicks,
  getEffectiveSpeed,
  getEquipmentArmorBonus,
  getEquipmentRangedBonus,
  applyArmor,
} from './actor.ts';
import {
  getHitChance,
  getDodgeChance,
  getCritChance,
  getCritMultiplier,
  getMeleeDamageBonus,
} from './stats.ts';

export function createEncounter(enemy?: Actor, playerLevel: number = 1): Encounter {
  return {
    enemy: enemy ?? getRandomEnemy(playerLevel),
    playerFleeing: false,
    enemyFleeing: false,
    ended: false,
  };
}

export function endEncounter(
  encounter: Encounter,
  result: Encounter['result']
): void {
  encounter.ended = true;
  encounter.result = result;
}

export interface EnemyAction {
  type: 'attack' | 'flee' | 'chase';
  message: string;
  damage?: number;
  fled?: boolean;
  encounterEnded?: boolean;
}

export function getEnemyAction(
  encounter: Encounter,
  player: Actor
): EnemyAction {
  const enemy = encounter.enemy;
  const template = getEnemyTemplate(enemy);

  // If player is fleeing, enemy decides whether to chase
  if (encounter.playerFleeing) {
    return enemyChaseDecision(encounter, player);
  }

  // If enemy is fleeing, they continue to flee
  if (encounter.enemyFleeing) {
    return enemyFleeAttempt(encounter, player);
  }

  // Decide whether to attack or flee
  const healthPercent = enemy.health / enemy.maxHealth;
  const fleeThreshold = template?.fleeThreshold ?? 0.3;
  const aggressiveness = template?.aggressiveness ?? 0.5;

  // Consider fleeing if health is low
  if (healthPercent <= fleeThreshold) {
    // Higher aggressiveness = less likely to flee
    // Also less likely to flee if player has low HP
    const playerHealthPercent = player.health / player.maxHealth;
    const fleeChance = (1 - aggressiveness) * (1 - playerHealthPercent * 0.5);

    if (Math.random() < fleeChance) {
      return enemyStartFlee(encounter);
    }
  }

  // Default: attack
  return enemyAttack(encounter, player);
}

function enemyAttack(encounter: Encounter, player: Actor): EnemyAction {
  const enemy = encounter.enemy;
  const enemyStats = enemy.levelInfo.stats;
  const playerStats = player.levelInfo.stats;

  // Hit check
  const hitChance = getHitChance(enemyStats);
  if (Math.random() > hitChance) {
    return {
      type: 'attack',
      message: `The ${enemy.name} attacks but misses!`,
      damage: 0,
    };
  }

  // Dodge check
  const dodgeChance = getDodgeChance(playerStats);
  if (Math.random() < dodgeChance) {
    return {
      type: 'attack',
      message: `You dodge the ${enemy.name}'s attack!`,
      damage: 0,
    };
  }

  // Calculate damage
  let baseDamage = enemy.damage + getMeleeDamageBonus(enemyStats);

  // Critical hit check
  const critChance = getCritChance(enemyStats);
  const isCrit = Math.random() < critChance;
  if (isCrit) {
    baseDamage = Math.floor(baseDamage * getCritMultiplier(enemyStats));
  }

  // Apply armor reduction
  const playerArmor = getEquipmentArmorBonus(player);
  const playerRanged = getEquipmentRangedBonus(player);
  const effectiveArmor = playerArmor + Math.floor(playerRanged / 3);
  const damage = applyArmor(baseDamage, effectiveArmor);
  dealDamage(player, damage);

  const critText = isCrit ? ' Critical hit!' : '';

  if (!isAlive(player)) {
    return {
      type: 'attack',
      message: `The ${enemy.name} strikes you for ${damage} damage.${critText} You have been defeated!`,
      damage,
      encounterEnded: true,
    };
  }

  return {
    type: 'attack',
    message: `The ${enemy.name} strikes you for ${damage} damage.${critText} (${player.health}/${player.maxHealth} HP)`,
    damage,
  };
}

function enemyStartFlee(encounter: Encounter): EnemyAction {
  encounter.enemyFleeing = true;
  const enemy = encounter.enemy;

  return {
    type: 'flee',
    message: `The ${enemy.name} turns to flee!`,
    fled: false, // Not escaped yet, just started fleeing
  };
}

function enemyFleeAttempt(encounter: Encounter, player: Actor): EnemyAction {
  const enemy = encounter.enemy;
  const enemySpeed = getEffectiveSpeed(enemy);
  const playerSpeed = getEffectiveSpeed(player);
  const speedRatio = enemySpeed / playerSpeed;
  const baseChance = 0.4;
  const fleeChance = Math.min(0.9, baseChance * speedRatio);

  if (Math.random() < fleeChance) {
    return {
      type: 'flee',
      message: `The ${enemy.name} escapes!`,
      fled: true,
      encounterEnded: true,
    };
  }

  encounter.enemyFleeing = false;
  return {
    type: 'flee',
    message: `The ${enemy.name} fails to escape and turns to fight!`,
    fled: false,
  };
}

function enemyChaseDecision(encounter: Encounter, player: Actor): EnemyAction {
  const enemy = encounter.enemy;
  const template = getEnemyTemplate(enemy);
  const aggressiveness = template?.aggressiveness ?? 0.5;

  // More aggressive enemies chase more often
  // Also more likely to chase if player is low HP
  const playerHealthPercent = player.health / player.maxHealth;
  const chaseChance = aggressiveness + (1 - playerHealthPercent) * 0.3;

  if (Math.random() < chaseChance) {
    // Enemy chases
    const enemySpeed = getEffectiveSpeed(enemy);
    const playerSpeed = getEffectiveSpeed(player);
    const speedRatio = enemySpeed / playerSpeed;
    const catchChance = Math.min(0.85, 0.5 * speedRatio);

    if (Math.random() < catchChance) {
      encounter.playerFleeing = false;
      return {
        type: 'chase',
        message: `The ${enemy.name} catches up to you!`,
      };
    }

    // Player escapes
    return {
      type: 'chase',
      message: `The ${enemy.name} chases but you escape!`,
      encounterEnded: true,
    };
  }

  // Enemy lets player go
  return {
    type: 'chase',
    message: `The ${enemy.name} lets you flee.`,
    encounterEnded: true,
  };
}

export function processEnemyTurn(
  encounter: Encounter,
  player: Actor
): EnemyAction | null {
  const enemy = encounter.enemy;

  // Enemy gains ticks based on speed
  const tickGain = enemy.speed * 2; // Scale tick gain
  addTicks(enemy, tickGain);

  // Check if enemy has enough ticks to act (200 for an action)
  const actionCost = 200;
  if (enemy.ticks < actionCost) {
    return null;
  }

  enemy.ticks -= actionCost;
  return getEnemyAction(encounter, player);
}

export function handlePlayerActionResult(
  encounter: Encounter,
  result: ActionResult,
  _player: Actor
): void {
  if (result.fled === true) {
    encounter.playerFleeing = true;
  }

  if (result.encounterEnded) {
    if (!isAlive(encounter.enemy)) {
      endEncounter(encounter, 'victory');
    } else if (encounter.playerFleeing || result.fled) {
      endEncounter(encounter, 'player_escaped');
    } else if (encounter.enemyFleeing) {
      endEncounter(encounter, 'enemy_escaped');
    }
  }
}
