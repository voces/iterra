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
  getWeaponAccuracy,
  getArmorDodgePenalty,
  getShieldBlockBonus,
  getShieldArmor,
} from './actor.ts';
import { calculateAttack, getMeleeDamageBonus } from './stats.ts';

// Roll enemy damage based on their base damage value
// Creates a ±30% variance around base damage, plus stat bonuses
function rollEnemyDamage(enemy: Actor): number {
  const baseDamage = enemy.damage;
  const variance = Math.floor(baseDamage * 0.3);
  const minDamage = Math.max(1, baseDamage - variance);
  const maxDamage = baseDamage + variance;
  const statBonus = getMeleeDamageBonus(enemy.levelInfo.stats);
  return minDamage + statBonus + Math.floor(Math.random() * (maxDamage - minDamage + 1));
}

export function createEncounter(enemy?: Actor, playerLevel: number = 1): Encounter {
  const actualEnemy = enemy ?? getRandomEnemy(playerLevel);
  const template = getEnemyTemplate(actualEnemy);
  const baseAggressiveness = template?.aggressiveness ?? 0.5;

  return {
    enemy: actualEnemy,
    playerFleeing: false,
    enemyFleeing: false,
    aggressiveness: baseAggressiveness,
    ended: false,
    projectilesUsed: {
      arrows: { hit: 0, dodged: 0, blocked: 0, missed: 0 },
      rocks: { hit: 0, dodged: 0, blocked: 0, missed: 0 },
    },
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
  const aggressiveness = encounter.aggressiveness;

  // If player is fleeing, enemy decides whether to chase
  if (encounter.playerFleeing) {
    return enemyChaseDecision(encounter, player);
  }

  // If enemy is fleeing, they continue to flee
  if (encounter.enemyFleeing) {
    return enemyFleeAttempt(encounter, player);
  }

  // Passive creatures (low aggressiveness) don't attack unprovoked
  // They just watch and wait
  if (aggressiveness < 0.2) {
    return {
      type: 'attack',
      message: `The ${enemy.name} watches you cautiously.`,
      damage: 0,
    };
  }

  // Decide whether to attack or flee
  const healthPercent = enemy.health / enemy.maxHealth;
  const fleeThreshold = template?.fleeThreshold ?? 0.3;

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
  const baseDamage = rollEnemyDamage(enemy);

  // Get enemy weapon accuracy (enemies usually have none)
  const enemyWeaponAccuracy = getWeaponAccuracy(enemy);

  // Get player's defensive stats
  const playerDodgePenalty = getArmorDodgePenalty(player);
  const playerBlockBonus = getShieldBlockBonus(player);
  const playerShieldArmor = getShieldArmor(player);

  // Use new AR vs DR combat system with blocking support
  const result = calculateAttack(enemy, player, baseDamage, {
    attackerWeaponAccuracy: enemyWeaponAccuracy,
    defenderArmorPenalty: playerDodgePenalty,
    defenderBlockBonus: playerBlockBonus,
    defenderShieldArmor: playerShieldArmor,
    isRanged: false,
  });

  // Miss
  if (!result.hit && !result.blocked) {
    const msg = result.dodged
      ? `You dodge the ${enemy.name}'s attack!`
      : `The ${enemy.name} attacks but misses!`;
    return {
      type: 'attack',
      message: msg,
      damage: 0,
    };
  }

  // Blocked (still takes some damage)
  if (result.blocked) {
    const playerArmor = getEquipmentArmorBonus(player);
    const playerRanged = getEquipmentRangedBonus(player);
    const effectiveArmor = playerArmor + Math.floor(playerRanged / 3);
    const damage = applyArmor(result.damage, effectiveArmor);
    dealDamage(player, damage);

    const critText = result.critical ? ' (crit blocked!)' : '';

    if (!isAlive(player)) {
      return {
        type: 'attack',
        message: `You block the ${enemy.name}'s attack but take ${damage} damage.${critText} You have been defeated!`,
        damage,
        encounterEnded: true,
      };
    }

    return {
      type: 'attack',
      message: `You block the ${enemy.name}'s attack, taking ${damage} damage.${critText} (${player.health}/${player.maxHealth} HP)`,
      damage,
    };
  }

  // Hit landed
  const playerArmor = getEquipmentArmorBonus(player);
  const playerRanged = getEquipmentRangedBonus(player);
  const effectiveArmor = playerArmor + Math.floor(playerRanged / 3);
  const damage = applyArmor(result.damage, effectiveArmor);
  dealDamage(player, damage);

  const critText = result.critical ? ' Critical hit!' : '';

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
  const aggressiveness = encounter.aggressiveness;

  // Passive creatures (low aggressiveness) let player flee without contention
  if (aggressiveness < 0.2) {
    return {
      type: 'chase',
      message: `The ${enemy.name} lets you go.`,
      encounterEnded: true,
    };
  }

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

export interface PlayerActionInfo {
  isAttack: boolean;
  isChase: boolean;
  isIdle: boolean;
}

// How much aggressiveness changes per action
const AGGRESSION_INCREASE_ON_ATTACK = 0.3;
const AGGRESSION_DECREASE_ON_IDLE = 0.1;

export function handlePlayerActionResult(
  encounter: Encounter,
  result: ActionResult,
  _player: Actor,
  actionInfo?: PlayerActionInfo
): void {
  if (result.fled === true) {
    encounter.playerFleeing = true;
  }

  // Adjust aggressiveness based on player action
  if (actionInfo?.isAttack) {
    encounter.aggressiveness = Math.min(1, encounter.aggressiveness + AGGRESSION_INCREASE_ON_ATTACK);
  } else if (actionInfo?.isIdle) {
    encounter.aggressiveness = Math.max(0, encounter.aggressiveness - AGGRESSION_DECREASE_ON_IDLE);
  }

  // Track projectile usage for recovery calculation
  if (result.projectileUsed) {
    const { type, outcome } = result.projectileUsed;
    if (type === 'arrow') {
      encounter.projectilesUsed.arrows[outcome]++;
    } else if (type === 'rock') {
      encounter.projectilesUsed.rocks[outcome]++;
    }
  }

  // If enemy is fleeing and player didn't use chase, enemy auto-escapes
  // (unless the attack was a kill shot)
  if (encounter.enemyFleeing && !actionInfo?.isChase && !result.encounterEnded) {
    endEncounter(encounter, 'enemy_escaped');
    return;
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

// Recovery chances based on projectile outcome
// Hit: 100% of base (retrievable from enemy)
// Blocked: 90% of base (might be slightly damaged)
// Dodged: 70% of base (went past, might be found)
// Missed: 60% of base (harder to locate)
const OUTCOME_RECOVERY_MULTIPLIER = {
  hit: 1.0,
  blocked: 0.9,
  dodged: 0.7,
  missed: 0.6,
};

// Base recovery chances
const ROCK_BASE_RECOVERY = 0.95; // 95% base recovery for rocks
const ARROW_BASE_RECOVERY = 0.60; // 60% base recovery for arrows
const ENEMY_ESCAPED_ARROW_PENALTY = 0.25; // Arrows drop by 75% if enemy escapes

export interface ProjectileRecovery {
  arrows: number;
  rocks: number;
}

/**
 * Calculate how many projectiles can be recovered after combat.
 * Recovery depends on whether the enemy was defeated or escaped,
 * and on the outcome of each shot (hit, dodged, blocked, missed).
 */
export function calculateProjectileRecovery(encounter: Encounter): ProjectileRecovery {
  const enemyEscaped = encounter.result === 'enemy_escaped';
  const { arrows, rocks } = encounter.projectilesUsed;

  let recoveredArrows = 0;
  let recoveredRocks = 0;

  // Calculate arrow recovery
  for (const [outcome, count] of Object.entries(arrows) as [keyof typeof OUTCOME_RECOVERY_MULTIPLIER, number][]) {
    if (count <= 0) continue;
    let recoveryChance = ARROW_BASE_RECOVERY * OUTCOME_RECOVERY_MULTIPLIER[outcome];

    // If enemy escaped, arrow recovery is much harder
    if (enemyEscaped) {
      recoveryChance *= ENEMY_ESCAPED_ARROW_PENALTY;
    }

    // Roll for each arrow
    for (let i = 0; i < count; i++) {
      if (Math.random() < recoveryChance) {
        recoveredArrows++;
      }
    }
  }

  // Calculate rock recovery (not affected by enemy escaping - rocks are easier to find)
  for (const [outcome, count] of Object.entries(rocks) as [keyof typeof OUTCOME_RECOVERY_MULTIPLIER, number][]) {
    if (count <= 0) continue;
    const recoveryChance = ROCK_BASE_RECOVERY * OUTCOME_RECOVERY_MULTIPLIER[outcome];

    // Roll for each rock
    for (let i = 0; i < count; i++) {
      if (Math.random() < recoveryChance) {
        recoveredRocks++;
      }
    }
  }

  return { arrows: recoveredArrows, rocks: recoveredRocks };
}
