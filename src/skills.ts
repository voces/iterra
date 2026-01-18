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

// XP scaling: XP needed = BASE_XP * level^XP_EXPONENT
const BASE_SKILL_XP = 50;
const SKILL_XP_EXPONENT = 1.3;
const MAX_SKILL_LEVEL = 100;

// === Skill Display Names ===

export const SKILL_NAMES: Record<SkillType, string> = {
  unarmed: 'Unarmed',
  knife: 'Knife',
  spear: 'Spear',
  archery: 'Archery',
  throwing: 'Throwing',
  shield: 'Shield',
  crafting: 'Crafting',
};

export const SKILL_DESCRIPTIONS: Record<SkillType, string> = {
  unarmed: 'Fighting with fists. Increases unarmed damage and hit chance.',
  knife: 'Skill with knives and daggers. Faster attacks, more crits.',
  spear: 'Mastery of spears and polearms. Higher damage and reach.',
  archery: 'Proficiency with bows. Better accuracy and damage at range.',
  throwing: 'Throwing weapons accurately. Rocks, javelins, etc.',
  shield: 'Shield blocking effectiveness. Better block chance and reduction.',
  crafting: 'General crafting ability. Better quality items, fewer failures.',
};

// === Skill Creation ===

export function createSkill(level: number = 0): Skill {
  return {
    level,
    xp: 0,
    xpToNextLevel: calculateSkillXpForLevel(level + 1),
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

export function addSkillXp(skill: Skill, amount: number): SkillGainResult {
  if (skill.level >= MAX_SKILL_LEVEL) {
    return { levelsGained: 0, newLevel: skill.level };
  }

  skill.xp += amount;
  let levelsGained = 0;

  while (skill.xp >= skill.xpToNextLevel && skill.level < MAX_SKILL_LEVEL) {
    skill.xp -= skill.xpToNextLevel;
    skill.level++;
    skill.xpToNextLevel = calculateSkillXpForLevel(skill.level + 1);
    levelsGained++;
  }

  // Cap at max level
  if (skill.level >= MAX_SKILL_LEVEL) {
    skill.level = MAX_SKILL_LEVEL;
    skill.xp = 0;
    skill.xpToNextLevel = 0;
  }

  return { levelsGained, newLevel: skill.level };
}

// === Skill Bonuses ===

// Combat skill bonuses (per skill level)
// These are additive bonuses based on skill level

// Hit chance bonus: 0.5% per level (up to 50% at level 100)
export function getSkillHitBonus(skillLevel: number): number {
  return skillLevel * 0.005;
}

// Damage bonus: 1% per level (up to 100% at level 100)
export function getSkillDamageBonus(skillLevel: number): number {
  return skillLevel * 0.01;
}

// Block bonus: 0.3% per level (up to 30% at level 100)
export function getSkillBlockBonus(skillLevel: number): number {
  return skillLevel * 0.003;
}

// === Crafting Skill Effects ===

// Crafting failure chance based on skill level
// At level 0: 25% failure chance
// At level 100: 0% failure chance
export function getCraftingFailureChance(skillLevel: number): number {
  const baseFailure = 0.25;
  const reduction = skillLevel / 100; // 0 at level 0, 1 at level 100
  return Math.max(0, baseFailure * (1 - reduction));
}

// Quality roll based on crafting skill
// Returns the quality tier for a crafted item
export function rollCraftingQuality(skillLevel: number): ItemQuality {
  const roll = Math.random() * 100;

  // Base chances at level 0:
  // Poor: 60%, Normal: 35%, Good: 4%, Excellent: 0.9%, Masterwork: 0.1%

  // At level 100:
  // Poor: 0%, Normal: 20%, Good: 50%, Excellent: 25%, Masterwork: 5%

  // Interpolate based on skill level
  const t = skillLevel / 100; // 0 at level 0, 1 at level 100

  // Thresholds for each quality (cumulative)
  const poorThreshold = 60 * (1 - t); // 60 -> 0
  const normalThreshold = poorThreshold + 35 - 15 * t; // 35 -> 20
  const goodThreshold = normalThreshold + 4 + 46 * t; // 4 -> 50
  const excellentThreshold = goodThreshold + 0.9 + 24.1 * t; // 0.9 -> 25

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
