import type { Skill, Skills, SkillType, ItemQuality } from './types.ts';

// === Skill Constants ===

export const SKILL_TYPES: SkillType[] = [
  'unarmed',
  'knife',
  'spear',
  'archery',
  'throwing',
  'shield',
  'crafting',
  'butchering',
  'skinning',
];

export const COMBAT_SKILLS: SkillType[] = [
  'unarmed',
  'knife',
  'spear',
  'archery',
  'throwing',
  'shield',
];

export const CRAFTING_SKILLS: SkillType[] = ['crafting'];

export const HARVESTING_SKILLS: SkillType[] = ['butchering', 'skinning'];

// XP scaling: XP needed = BASE_XP * level^XP_EXPONENT
const BASE_SKILL_XP = 50;
const SKILL_XP_EXPONENT = 1.3;

// === Skill Display Names ===

export const SKILL_NAMES: Record<SkillType, string> = {
  unarmed: 'Unarmed',
  knife: 'Knife',
  spear: 'Spear',
  archery: 'Archery',
  throwing: 'Throwing',
  shield: 'Shield',
  crafting: 'Crafting',
  butchering: 'Butchering',
  skinning: 'Skinning',
};

export const SKILL_DESCRIPTIONS: Record<SkillType, string> = {
  unarmed: 'Fighting with fists. Increases unarmed damage and hit chance.',
  knife: 'Skill with knives and daggers. Faster attacks, more crits.',
  spear: 'Mastery of spears and polearms. Higher damage and reach.',
  archery: 'Proficiency with bows. Better accuracy and damage at range.',
  throwing: 'Throwing weapons accurately. Rocks, javelins, etc.',
  shield: 'Shield blocking effectiveness. Better block chance and reduction.',
  crafting: 'General crafting ability. Better quality items, fewer failures.',
  butchering: 'Extracting meat from corpses. Higher yield and fewer failures.',
  skinning: 'Extracting hides from corpses. Higher yield and fewer failures.',
};

// === Skill Creation ===

export function createSkill(level: number = 0): Skill {
  return {
    level,
    xp: 0,
    xpToNextLevel: calculateSkillXpForLevel(level + 1),
    lastGainedAt: -1,
  };
}

export function createEmptySkills(): Skills {
  const skills = {} as Skills;
  for (const skillType of SKILL_TYPES) {
    skills[skillType] = createSkill(0);
  }
  return skills;
}

// === XP Calculations ===

export function calculateSkillXpForLevel(level: number): number {
  return Math.floor(BASE_SKILL_XP * Math.pow(level, SKILL_XP_EXPONENT));
}

export interface SkillGainResult {
  levelsGained: number;
  newLevel: number;
}

export function addSkillXp(skill: Skill, amount: number, turn: number = 0): SkillGainResult {
  skill.xp += amount;
  skill.lastGainedAt = turn;
  let levelsGained = 0;

  while (skill.xp >= skill.xpToNextLevel) {
    skill.xp -= skill.xpToNextLevel;
    skill.level++;
    skill.xpToNextLevel = calculateSkillXpForLevel(skill.level + 1);
    levelsGained++;
  }

  return { levelsGained, newLevel: skill.level };
}

// === Skill Bonuses ===

// Combat skill bonuses (per skill level)
// These are additive bonuses to ratings, not percentages

// Attack Rating bonus: +1 AR per skill level
export function getSkillAttackRating(skillLevel: number): number {
  return skillLevel;
}

// Damage bonus: 1% per level (multiplicative)
export function getSkillDamageBonus(skillLevel: number): number {
  return skillLevel * 0.01;
}

// Dodge Rating bonus for shield skill: +1 DR per skill level
export function getSkillDodgeRating(skillLevel: number): number {
  return skillLevel;
}

// === Crafting Skill Effects ===

// Crafting failure chance based on skill level (diminishing returns)
// At level 0: 25% failure chance
// Uses formula: baseFailure / (1 + skillLevel / 50)
// Level 50: ~8.3%, Level 100: ~8.3%, Level 200: ~5%
export function getCraftingFailureChance(skillLevel: number): number {
  const baseFailure = 0.25;
  return baseFailure / (1 + skillLevel / 50);
}

// === Harvesting Skill Effects ===

// Harvesting failure chance based on skill level (diminishing returns)
// At level 0: 30% failure chance
// Uses same diminishing returns formula as crafting
export function getHarvestingFailureChance(skillLevel: number): number {
  const baseFailure = 0.3;
  return baseFailure / (1 + skillLevel / 50);
}

// Harvesting yield bonus based on skill level (diminishing returns)
// At level 0: 0% bonus
// At level 100: 50% bonus, level 200: 67%, approaches 100% asymptotically
export function getHarvestingYieldBonus(skillLevel: number): number {
  return skillLevel / (skillLevel + 100);
}

// Quality roll based on crafting skill (diminishing returns)
// Returns the quality tier for a crafted item
export function rollCraftingQuality(skillLevel: number): ItemQuality {
  const roll = Math.random() * 100;

  // Use diminishing returns: t approaches 1 as skill increases
  // t = skillLevel / (skillLevel + 100)
  // At level 0: t=0, level 100: t=0.5, level 200: t=0.67, level 400: t=0.8
  const t = skillLevel / (skillLevel + 100);

  // Thresholds for each quality (cumulative)
  // Poor: 60% -> 0% as t -> 1
  // Normal: 35% -> 15% as t -> 1
  // Good: 4% -> 50% as t -> 1
  // Excellent: 0.9% -> 28% as t -> 1
  // Masterwork: 0.1% -> 7% as t -> 1
  const poorThreshold = 60 * (1 - t);
  const normalThreshold = poorThreshold + 35 - 20 * t;
  const goodThreshold = normalThreshold + 4 + 46 * t;
  const excellentThreshold = goodThreshold + 0.9 + 27.1 * t;

  if (roll < poorThreshold) return 'poor';
  if (roll < normalThreshold) return 'normal';
  if (roll < goodThreshold) return 'good';
  if (roll < excellentThreshold) return 'excellent';
  return 'masterwork';
}

// === Skill XP Awards ===

// XP gained per action type
export const SKILL_XP_AWARDS = {
  // Combat XP per attack
  combatHit: 10,
  combatMiss: 3,
  combatBlock: 8,

  // Crafting XP
  craftSuccess: 15,
  craftFailure: 5, // Still learn from failures

  // Harvesting XP
  harvestSuccess: 12,
  harvestFailure: 4, // Still learn from failures
};

// Map weapon types to skills
export function getWeaponSkill(weaponId: string | undefined): SkillType {
  if (!weaponId) return 'unarmed';

  // Map weapon IDs to skill types
  const weaponSkillMap: Record<string, SkillType> = {
    stoneKnife: 'knife',
    ironKnife: 'knife',
    steelKnife: 'knife',
    stoneSpear: 'spear',
    ironSpear: 'spear',
    steelSpear: 'spear',
    bow: 'archery',
    longbow: 'archery',
    crossbow: 'archery',
  };

  return weaponSkillMap[weaponId] || 'unarmed';
}
