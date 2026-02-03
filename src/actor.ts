import type { Actor, Action, Inventory, Equipment, EquipSlot, Stats, Skills, EquipmentInstances, MaterialQualities, WeaponBackSlots } from './types.ts';
import { MAX_TWO_HANDED_BACK } from './types.ts';
import {
  createLevelInfo,
  getMaxHealthBonus,
  getMaxSaturationBonus,
  getSpeedBonus,
} from './stats.ts';
import { createEmptySkills } from './skills.ts';

export function createActor(
  id: string,
  name: string,
  options: {
    maxTicks?: number;
    speed?: number;
    carryCapacity?: number;
    maxHealth?: number;
    damage?: number;
    saturation?: number;
    maxSaturation?: number;
    inventory?: Inventory;
    materialQualities?: MaterialQualities;
    equipment?: Equipment;
    equipmentInstances?: EquipmentInstances;
    actions?: Action[];
    level?: number;
    stats?: Partial<Stats>;
    skills?: Skills;
    backSlots?: WeaponBackSlots;
  } = {}
): Actor {
  const {
    maxTicks = 10000,
    speed = 100,
    carryCapacity = 30, // Default carry capacity in weight units
    maxHealth = 100,
    damage = 10,
    saturation = 10, // Start at nominal max
    maxSaturation = 20, // Can store extra for healing
    inventory = {},
    materialQualities = {},
    equipment = {},
    equipmentInstances = {},
    actions = [],
    level = 1,
    stats,
    skills,
    backSlots = [null, null, null],  // Fixed 3 back slots, all empty
  } = options;

  const levelInfo = createLevelInfo(level, stats);

  // Apply stat bonuses to base values
  const effectiveMaxHealth = maxHealth + getMaxHealthBonus(levelInfo.stats);
  const effectiveMaxSaturation = maxSaturation + getMaxSaturationBonus(levelInfo.stats);

  return {
    id,
    name,
    ticks: maxTicks,
    maxTicks,
    speed,
    carryCapacity,
    health: effectiveMaxHealth,
    maxHealth: effectiveMaxHealth,
    damage,
    saturation,
    maxSaturation: effectiveMaxSaturation,
    inventory: { ...inventory },
    materialQualities: { ...materialQualities },
    equipment: { ...equipment },
    equipmentInstances: { ...equipmentInstances },
    actions: [...actions],
    levelInfo,
    skills: skills ?? createEmptySkills(),
    backSlots: [...backSlots],
  };
}

// Recalculate derived stats after stat changes
export function recalculateStats(actor: Actor, baseMaxHealth: number = 100, baseMaxSaturation: number = 20): void {
  const stats = actor.levelInfo.stats;
  const oldMaxHealth = actor.maxHealth;

  actor.maxHealth = baseMaxHealth + getMaxHealthBonus(stats);
  actor.maxSaturation = baseMaxSaturation + getMaxSaturationBonus(stats);

  // If max health increased, heal by the difference
  if (actor.maxHealth > oldMaxHealth) {
    actor.health += actor.maxHealth - oldMaxHealth;
  }

  // Cap current values
  actor.health = Math.min(actor.health, actor.maxHealth);
  actor.saturation = Math.min(actor.saturation, actor.maxSaturation);
}

export function canAffordAction(actor: Actor, action: Action): boolean {
  return actor.ticks >= action.tickCost;
}

export function addTicks(actor: Actor, amount: number): void {
  actor.ticks = Math.min(actor.ticks + amount, actor.maxTicks);
}

export function spendTicks(actor: Actor, amount: number): boolean {
  if (actor.ticks < amount) {
    return false;
  }
  actor.ticks -= amount;
  return true;
}

export function dealDamage(target: Actor, amount: number): void {
  target.health = Math.max(0, target.health - amount);
}

export function heal(actor: Actor, amount: number): void {
  actor.health = Math.min(actor.maxHealth, actor.health + amount);
}

export function isAlive(actor: Actor): boolean {
  return actor.health > 0;
}

export function addSaturation(actor: Actor, amount: number): void {
  actor.saturation = Math.min(actor.maxSaturation, actor.saturation + amount);
}

export function drainSaturation(actor: Actor, amount: number): void {
  actor.saturation = Math.max(0, actor.saturation - amount);
}

// Saturation thresholds:
// - 0: starving, takes damage
// - 1-10: nominal, no effects
// - Above 10: overfull, allows healing
const SATURATION_OVERFULL_THRESHOLD = 10;

export function isOverfull(actor: Actor): boolean {
  return actor.saturation > SATURATION_OVERFULL_THRESHOLD;
}

export function isStarving(actor: Actor): boolean {
  return actor.saturation <= 0;
}

export function getStarvationDamage(_actor: Actor): number {
  // Fixed damage when starving (saturation = 0)
  return 5;
}

export function addAction(actor: Actor, action: Action): void {
  if (!actor.actions.some((a) => a.id === action.id)) {
    actor.actions.push(action);
  }
}

export function removeAction(actor: Actor, actionId: string): void {
  actor.actions = actor.actions.filter((a) => a.id !== actionId);
}

// Inventory helpers
export function getItemCount(actor: Actor, itemId: string): number {
  return actor.inventory[itemId] ?? 0;
}

export function addItem(actor: Actor, itemId: string, amount: number): void {
  actor.inventory[itemId] = (actor.inventory[itemId] ?? 0) + amount;
}

// Add item with quality tracking
export function addItemWithQuality(actor: Actor, itemId: string, amount: number, quality: number): void {
  actor.inventory[itemId] = (actor.inventory[itemId] ?? 0) + amount;

  // Initialize quality array if needed
  if (!actor.materialQualities[itemId]) {
    actor.materialQualities[itemId] = [];
  }

  // Add quality values for each item
  for (let i = 0; i < amount; i++) {
    actor.materialQualities[itemId].push(quality);
  }

  // Keep sorted by quality (lowest first for consumption)
  actor.materialQualities[itemId].sort((a, b) => a - b);
}

export function removeItem(actor: Actor, itemId: string, amount: number): boolean {
  const current = actor.inventory[itemId] ?? 0;
  if (current < amount) {
    return false;
  }
  actor.inventory[itemId] = current - amount;

  // Also remove quality values (lowest first)
  if (actor.materialQualities[itemId]) {
    actor.materialQualities[itemId].splice(0, amount);
    if (actor.materialQualities[itemId].length === 0) {
      delete actor.materialQualities[itemId];
    }
  }

  return true;
}

// Remove items and return their quality values (lowest quality first)
export function removeItemsWithQuality(actor: Actor, itemId: string, amount: number): number[] | null {
  const current = actor.inventory[itemId] ?? 0;
  if (current < amount) {
    return null;
  }

  actor.inventory[itemId] = current - amount;

  // Get quality values being removed (lowest first)
  const qualities: number[] = [];
  if (actor.materialQualities[itemId]) {
    for (let i = 0; i < amount && actor.materialQualities[itemId].length > 0; i++) {
      qualities.push(actor.materialQualities[itemId].shift()!);
    }
    if (actor.materialQualities[itemId].length === 0) {
      delete actor.materialQualities[itemId];
    }
  } else {
    // No quality tracking for this item, return default quality (50)
    for (let i = 0; i < amount; i++) {
      qualities.push(50);
    }
  }

  return qualities;
}

// Get average quality of an item in inventory
export function getAverageQuality(actor: Actor, itemId: string): number {
  const qualities = actor.materialQualities[itemId];
  if (!qualities || qualities.length === 0) {
    return 50; // Default quality if not tracked
  }
  return qualities.reduce((sum, q) => sum + q, 0) / qualities.length;
}

export function hasItem(actor: Actor, itemId: string, amount: number = 1): boolean {
  return (actor.inventory[itemId] ?? 0) >= amount;
}

export function transferInventory(from: Actor, to: Actor): void {
  for (const [itemId, amount] of Object.entries(from.inventory)) {
    if (amount > 0) {
      addItem(to, itemId, amount);
    }
  }
}

// Weight system
import { getItem } from './items.ts';

export function getTotalWeight(actor: Actor): number {
  let total = 0;
  for (const [itemId, count] of Object.entries(actor.inventory)) {
    if (count > 0) {
      const item = getItem(itemId);
      if (item) {
        total += item.weight * count;
      }
    }
  }
  return total;
}

export function getLoadFactor(actor: Actor): number {
  return getTotalWeight(actor) / actor.carryCapacity;
}

// Speed modifier based on load:
// - Light load (0-50%): bonus up to +20 speed
// - Normal load (50-100%): 0 modifier, linearly decreasing
// - Overloaded (>100%): penalty of -25 per 50% over capacity
export function getSpeedModifier(actor: Actor): number {
  const loadFactor = getLoadFactor(actor);

  if (loadFactor <= 0.5) {
    // Light load: +20 at 0%, +0 at 50%
    return 20 * (1 - loadFactor * 2);
  } else if (loadFactor <= 1.0) {
    // Normal to full: 0 modifier (linear from +0 at 50% to 0 at 100%)
    return 0;
  } else {
    // Overloaded: -50 speed per 100% over capacity
    const overload = loadFactor - 1.0;
    return -50 * overload;
  }
}

export function getEffectiveSpeed(actor: Actor): number {
  const statBonus = getSpeedBonus(actor.levelInfo.stats);
  return Math.max(10, actor.speed + getSpeedModifier(actor) + statBonus); // Min speed of 10
}

// Equipment helpers
export function getEquippedItem(actor: Actor, slot: EquipSlot): string | undefined {
  return actor.equipment[slot];
}

export function equipItem(actor: Actor, itemId: string, slot: EquipSlot): boolean {
  const item = getItem(itemId);
  if (!item || !item.equipSlot) return false;

  // Check if we have the item in inventory or back slots
  const hasInInventory = getItemCount(actor, itemId) > 0;
  const inBackSlots = actor.backSlots.includes(itemId);
  if (!hasInInventory && !inBackSlots) return false;

  // Handle two-handed weapons
  if (item.twoHanded) {
    // Unequip both hands first
    unequipSlot(actor, 'mainHand');
    unequipSlot(actor, 'offHand');
    actor.equipment.mainHand = itemId;
    actor.equipment.offHand = itemId; // Both slots point to same item
  } else {
    // Unequip existing item in slot
    unequipSlot(actor, slot);
    actor.equipment[slot] = itemId;
  }

  // Remove from inventory or back slots
  if (hasInInventory) {
    removeItem(actor, itemId, 1);
  } else if (inBackSlots) {
    removeFromBackSlots(actor, itemId);
  }
  return true;
}

export function unequipSlot(actor: Actor, slot: EquipSlot): boolean {
  const itemId = actor.equipment[slot];
  if (!itemId) return false;

  const item = getItem(itemId);

  // Handle two-handed weapons - only add to inventory once
  if (item?.twoHanded && slot === 'mainHand') {
    delete actor.equipment.mainHand;
    delete actor.equipment.offHand;
    addItem(actor, itemId, 1);
  } else if (item?.twoHanded && slot === 'offHand') {
    // Already handled by mainHand unequip
    delete actor.equipment.mainHand;
    delete actor.equipment.offHand;
    addItem(actor, itemId, 1);
  } else {
    delete actor.equipment[slot];
    addItem(actor, itemId, 1);
  }

  return true;
}

export function canEquipInSlot(itemId: string, slot: EquipSlot): boolean {
  const item = getItem(itemId);
  if (!item || !item.equipSlot) return false;

  if (item.twoHanded) {
    return slot === 'mainHand' || slot === 'offHand';
  }

  return item.equipSlot === slot;
}

// Get total equipment bonuses
// Uses item instance stats if available (for quality variation)
export function getEquipmentArmorBonus(actor: Actor): number {
  let bonus = 0;
  const counted = new Set<string>();

  for (const [slot, itemId] of Object.entries(actor.equipment)) {
    if (itemId && !counted.has(itemId)) {
      counted.add(itemId);

      // Check for item instance with quality-modified stats
      const instance = actor.equipmentInstances[slot as EquipSlot];
      if (instance && instance.armorBonus !== undefined) {
        bonus += instance.armorBonus;
      } else {
        const item = getItem(itemId);
        if (item?.armorBonus) {
          bonus += item.armorBonus;
        }
      }
    }
  }

  return bonus;
}

export function getEquipmentRangedBonus(actor: Actor): number {
  let bonus = 0;
  const counted = new Set<string>();

  for (const itemId of Object.values(actor.equipment)) {
    if (itemId && !counted.has(itemId)) {
      counted.add(itemId);
      const item = getItem(itemId);
      if (item?.rangedBonus) {
        bonus += item.rangedBonus;
      }
    }
  }

  return bonus;
}

// Unarmed damage range (fists)
const UNARMED_MIN_DAMAGE = 1;
const UNARMED_MAX_DAMAGE = 3;

export interface DamageRange {
  min: number;
  max: number;
}

// Get weapon's intrinsic damage range, or unarmed if no weapon
// Uses item instance stats if available (for quality variation)
export function getWeaponDamageRange(actor: Actor): DamageRange {
  const mainHandId = actor.equipment.mainHand;
  if (!mainHandId) {
    return { min: UNARMED_MIN_DAMAGE, max: UNARMED_MAX_DAMAGE };
  }

  // Check for item instance with quality-modified stats
  const instance = actor.equipmentInstances.mainHand;
  if (instance && instance.minDamage !== undefined && instance.maxDamage !== undefined) {
    return { min: instance.minDamage, max: instance.maxDamage };
  }

  // Fall back to base item stats
  const item = getItem(mainHandId);
  if (item?.minDamage !== undefined && item?.maxDamage !== undefined) {
    return { min: item.minDamage, max: item.maxDamage };
  }

  // Fallback to unarmed if weapon doesn't have damage range
  return { min: UNARMED_MIN_DAMAGE, max: UNARMED_MAX_DAMAGE };
}

// Get stat bonus from weapon scaling
export function getWeaponStatBonus(actor: Actor): number {
  const mainHandId = actor.equipment.mainHand;
  const stats = actor.levelInfo.stats;

  if (!mainHandId) {
    // Unarmed: small str + agi scaling
    return Math.floor(stats.strength * 0.5 + stats.agility * 0.3);
  }

  const item = getItem(mainHandId);
  if (!item) {
    return Math.floor(stats.strength * 0.5 + stats.agility * 0.3);
  }

  // Calculate bonus from weapon's stat scaling
  let bonus = 0;
  if (item.strengthScaling) {
    bonus += stats.strength * item.strengthScaling;
  }
  if (item.agilityScaling) {
    bonus += stats.agility * item.agilityScaling;
  }
  if (item.precisionScaling) {
    bonus += stats.precision * item.precisionScaling;
  }

  return Math.floor(bonus);
}

// Get the full damage range including stat bonuses from weapon scaling
export function getDamageRange(actor: Actor): DamageRange {
  const weaponRange = getWeaponDamageRange(actor);
  const statBonus = getWeaponStatBonus(actor);

  return {
    min: weaponRange.min + statBonus,
    max: weaponRange.max + statBonus,
  };
}

// Roll damage using weapon range + stat bonus (scaling is defined on weapon)
export function rollDamage(actor: Actor): number {
  const range = getDamageRange(actor);
  // Roll between min and max (inclusive)
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
}

// Legacy function - returns average damage for display purposes
export function getEffectiveDamage(actor: Actor): number {
  const range = getDamageRange(actor);
  return Math.floor((range.min + range.max) / 2);
}

// Reduces incoming damage based on armor
export function applyArmor(damage: number, armor: number): number {
  // Each point of armor reduces damage by ~5%, diminishing returns
  const reduction = armor / (armor + 20);
  return Math.max(1, Math.floor(damage * (1 - reduction)));
}

// Get weapon accuracy bonus for AR calculation
// Uses item instance stats if available (for quality variation)
export function getWeaponAccuracy(actor: Actor): number {
  const mainHandId = actor.equipment.mainHand;
  if (!mainHandId) return 0;

  // Check for item instance with quality-modified stats
  const instance = actor.equipmentInstances.mainHand;
  if (instance && instance.accuracy !== undefined) {
    return instance.accuracy;
  }

  const item = getItem(mainHandId);
  return item?.accuracy ?? 0;
}

// Get total armor dodge penalty
export function getArmorDodgePenalty(actor: Actor): number {
  let penalty = 0;
  const counted = new Set<string>();

  for (const itemId of Object.values(actor.equipment)) {
    if (itemId && !counted.has(itemId)) {
      counted.add(itemId);
      const item = getItem(itemId);
      if (item?.dodgePenalty) {
        penalty += item.dodgePenalty;
      }
    }
  }

  return penalty;
}

// Get shield block bonus (0 if no shield)
// Uses item instance stats if available (for quality variation)
export function getShieldBlockBonus(actor: Actor): number {
  const offHandId = actor.equipment.offHand;
  if (!offHandId) return 0;

  // Check for item instance with quality-modified stats
  const instance = actor.equipmentInstances.offHand;
  if (instance && instance.blockBonus !== undefined) {
    return instance.blockBonus;
  }

  const item = getItem(offHandId);
  // Only count as shield if it has blockBonus
  return item?.blockBonus ?? 0;
}

// Get shield armor value for block damage reduction
// Uses item instance stats if available (for quality variation)
export function getShieldArmor(actor: Actor): number {
  const offHandId = actor.equipment.offHand;
  if (!offHandId) return 0;

  // Check for item instance with quality-modified stats
  const instance = actor.equipmentInstances.offHand;
  if (instance && instance.armorBonus !== undefined) {
    return instance.armorBonus;
  }

  const item = getItem(offHandId);
  // Shield armor used for block reduction
  if (item?.blockBonus) {
    return item.armorBonus ?? 0;
  }
  return 0;
}

// === Weapon Back Slots System ===
// Allows carrying backup weapons on your back for quick switching in combat
// 3 slots total: max 2 two-handed weapons, max 1 one-handed weapon

// Check if an item is a weapon that can be added to back slots
export function isWeapon(itemId: string): boolean {
  const item = getItem(itemId);
  if (!item) return false;
  // Item must have an equipSlot of mainHand and have damage properties
  return item.equipSlot === 'mainHand' && (item.minDamage !== undefined || item.maxDamage !== undefined);
}

// Check if a weapon is two-handed
export function isTwoHanded(itemId: string): boolean {
  const item = getItem(itemId);
  return item?.twoHanded === true;
}

// Count weapons by type in back slots
export function countBackSlotWeapons(actor: Actor): { twoHanded: number; oneHanded: number } {
  let twoHanded = 0;
  let oneHanded = 0;

  for (const weaponId of actor.backSlots) {
    if (weaponId !== null) {
      if (isTwoHanded(weaponId)) {
        twoHanded++;
      } else {
        oneHanded++;
      }
    }
  }

  return { twoHanded, oneHanded };
}

// Check if a weapon can be added to back slots (respects type limits)
// Back can hold 3 weapons total, with at most 2 being two-handed
export function canAddToBackSlots(actor: Actor, itemId: string): boolean {
  if (!isWeapon(itemId)) return false;

  // Check if there's an empty slot
  const hasEmptySlot = actor.backSlots.some(slot => slot === null);
  if (!hasEmptySlot) return false;

  // Check if weapon is already in back slots
  if (actor.backSlots.includes(itemId)) return false;

  // Check two-handed limit (max 2 two-handed weapons on back)
  if (isTwoHanded(itemId)) {
    const counts = countBackSlotWeapons(actor);
    if (counts.twoHanded >= MAX_TWO_HANDED_BACK) return false;
  }
  // No limit on one-handed weapons (beyond the 3 total slot limit)

  return true;
}

// Get all weapons in back slots (returns fixed array with nulls for empty slots)
export function getBackSlotWeapons(actor: Actor): (string | null)[] {
  return actor.backSlots;
}

// Add a weapon to back slots (moves from hands or inventory)
// Optionally specify a slot index to add to a specific slot
export function addToBackSlots(actor: Actor, itemId: string, slotIndex?: number): boolean {
  if (!canAddToBackSlots(actor, itemId)) return false;

  // Check if player has the weapon in inventory or equipped
  const hasInInventory = getItemCount(actor, itemId) > 0;
  const hasEquippedMainHand = actor.equipment.mainHand === itemId;
  if (!hasInInventory && !hasEquippedMainHand) return false;

  // Find slot to use
  let targetSlot: number;
  if (slotIndex !== undefined && actor.backSlots[slotIndex] === null) {
    targetSlot = slotIndex;
  } else {
    // Find first empty slot
    targetSlot = actor.backSlots.findIndex(slot => slot === null);
    if (targetSlot === -1) return false;
  }

  // If equipped in hands, unequip first (move to back, not inventory)
  if (hasEquippedMainHand) {
    const item = getItem(itemId);
    if (item?.twoHanded) {
      delete actor.equipment.mainHand;
      delete actor.equipment.offHand;
    } else {
      delete actor.equipment.mainHand;
    }
  } else if (hasInInventory) {
    // Remove from inventory
    removeItem(actor, itemId, 1);
  }

  actor.backSlots[targetSlot] = itemId;
  return true;
}

// Remove a weapon from back slots (returns to inventory)
export function removeFromBackSlots(actor: Actor, itemId: string): boolean {
  const idx = actor.backSlots.findIndex(slot => slot === itemId);
  if (idx === -1) return false;

  actor.backSlots[idx] = null;
  addItem(actor, itemId, 1);  // Return to inventory
  return true;
}

// Switch to a weapon from back slots (swaps with currently equipped)
// Returns the previously equipped weapon (if any) that goes to back slots
export function switchToBackSlotWeapon(actor: Actor, itemId: string): string | null {
  // Check if weapon is in back slots
  const idx = actor.backSlots.findIndex(slot => slot === itemId);
  if (idx === -1) return null;

  const currentWeapon = actor.equipment.mainHand;

  // Clear the back slot (weapon is being drawn)
  actor.backSlots[idx] = null;

  // If we have a weapon equipped, put it in the same slot we just vacated
  if (currentWeapon && isWeapon(currentWeapon)) {
    actor.backSlots[idx] = currentWeapon;
  }

  // Equip the new weapon
  const newWeaponItem = getItem(itemId);
  if (newWeaponItem?.twoHanded) {
    actor.equipment.mainHand = itemId;
    actor.equipment.offHand = itemId;
  } else {
    actor.equipment.mainHand = itemId;
    // Keep offHand as is (shield, etc.) unless it was part of a two-handed weapon
    if (actor.equipment.offHand === currentWeapon) {
      delete actor.equipment.offHand;
    }
  }

  return currentWeapon ?? null;
}

