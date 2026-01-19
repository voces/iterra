import type { ItemDef, ItemInstance, ItemQuality } from './types.ts';
import { QUALITY_NAMES, getQualityMultiplier, getQualityName, getQualityTier } from './types.ts';

// Item registry - all items in the game
export const items: Record<string, ItemDef> = {
  // Foraged items
  berries: {
    id: 'berries',
    name: 'Berries',
    description: 'Sweet, ripe berries. Can be eaten for sustenance.',
    stackable: true,
    tags: ['food', 'raw', 'foraged'],
    weight: 0.1,
    saturationGain: 4,
  },
  sticks: {
    id: 'sticks',
    name: 'Sticks',
    description: 'Dry wooden sticks. Useful for crafting or as a makeshift weapon.',
    stackable: true,
    tags: ['material', 'wood', 'foraged', 'weapon'],
    weight: 0.5,
    equipSlot: 'mainHand',
    minDamage: 1,
    maxDamage: 4,
    strengthScaling: 0.3,
    agilityScaling: 0.2,
    accuracy: 0, // Baseline
  },
  rocks: {
    id: 'rocks',
    name: 'Rocks',
    description: 'Sturdy rocks. Can be thrown or used for crafting.',
    stackable: true,
    tags: ['material', 'stone', 'foraged', 'throwable'],
    weight: 2.0,
  },
  fiber: {
    id: 'fiber',
    name: 'Fiber',
    description: 'Plant fiber from tall grass. Used for crafting rope and bindings.',
    stackable: true,
    tags: ['material', 'foraged'],
    weight: 0.2,
  },

  // Meat
  rawMeat: {
    id: 'rawMeat',
    name: 'Raw Meat',
    description: 'Raw meat from a slain creature. Should be cooked before eating.',
    stackable: true,
    tags: ['food', 'raw', 'meat'],
    weight: 1.0,
    saturationGain: 2,
  },
  cookedMeat: {
    id: 'cookedMeat',
    name: 'Cooked Meat',
    description: 'Well-cooked meat. Nutritious and filling.',
    stackable: true,
    tags: ['food', 'cooked', 'meat'],
    weight: 1.0,
    saturationGain: 8,
  },

  // Enemy drops
  rawLeather: {
    id: 'rawLeather',
    name: 'Raw Leather',
    description: 'Untreated animal hide. Must be processed at a campfire with a knife.',
    stackable: true,
    tags: ['material', 'loot'],
    weight: 2.0,
  },
  venomGland: {
    id: 'venomGland',
    name: 'Venom Gland',
    description: 'A gland filled with potent venom. Handle with care.',
    stackable: true,
    tags: ['material', 'loot', 'poison'],
    weight: 0.3,
  },

  // Crafted materials
  leather: {
    id: 'leather',
    name: 'Leather',
    description: 'Treated leather, ready for crafting armor.',
    stackable: true,
    tags: ['material', 'crafted'],
    weight: 1.5,
  },
  arrow: {
    id: 'arrow',
    name: 'Arrow',
    description: 'A simple arrow. Requires a bow to use.',
    stackable: true,
    tags: ['ammo', 'crafted'],
    weight: 0.1,
  },

  // Weapons
  stoneKnife: {
    id: 'stoneKnife',
    name: 'Stone Knife',
    description: 'A sharp flint knife. Good for combat and processing leather.',
    stackable: false,
    tags: ['weapon', 'tool', 'crafted'],
    weight: 1.0,
    equipSlot: 'mainHand',
    minDamage: 3,
    maxDamage: 8,
    strengthScaling: 0.5,
    agilityScaling: 1.0, // Fast weapon benefits from agility
    accuracy: 15, // Fast, easy to land hits
  },
  stoneSpear: {
    id: 'stoneSpear',
    name: 'Stone Spear',
    description: 'A spear with a stone tip. Decent reach and damage.',
    stackable: false,
    tags: ['weapon', 'crafted'],
    weight: 2.5,
    equipSlot: 'mainHand',
    minDamage: 5,
    maxDamage: 12,
    strengthScaling: 1.0, // Power weapon benefits from strength
    agilityScaling: 0.5,
    accuracy: 5, // Reach helps, but slower
  },
  bow: {
    id: 'bow',
    name: 'Bow',
    description: 'A wooden bow. Requires arrows. Effective against fleeing enemies.',
    stackable: false,
    tags: ['weapon', 'ranged', 'crafted'],
    weight: 1.5,
    equipSlot: 'mainHand',
    twoHanded: true,
    minDamage: 4,
    maxDamage: 10,
    precisionScaling: 1.0, // Ranged weapon benefits from precision
    agilityScaling: 0.3, // Some benefit from agility for draw speed
    rangedBonus: 15, // Bonus vs fleeing, reduces incoming damage
    accuracy: 20, // Ranged precision weapon
  },

  // Shields
  woodenShield: {
    id: 'woodenShield',
    name: 'Wooden Shield',
    description: 'A crude wooden shield. Block attacks to reduce damage.',
    stackable: false,
    tags: ['armor', 'shield', 'crafted'],
    weight: 3.0,
    equipSlot: 'offHand',
    armorBonus: 5,
    blockBonus: 25, // Block rating bonus
  },

  // Armor - Leather set (light armor, minimal dodge penalty)
  leatherHelm: {
    id: 'leatherHelm',
    name: 'Leather Helm',
    description: 'A hardened leather helmet.',
    stackable: false,
    tags: ['armor', 'crafted'],
    weight: 1.0,
    equipSlot: 'head',
    armorBonus: 3,
    dodgePenalty: 2,
  },
  leatherChest: {
    id: 'leatherChest',
    name: 'Leather Chest',
    description: 'A leather chestpiece offering decent protection.',
    stackable: false,
    tags: ['armor', 'crafted'],
    weight: 3.0,
    equipSlot: 'chest',
    armorBonus: 6,
    dodgePenalty: 5,
  },
  leatherLegs: {
    id: 'leatherLegs',
    name: 'Leather Leggings',
    description: 'Leather leg protection.',
    stackable: false,
    tags: ['armor', 'crafted'],
    weight: 2.0,
    equipSlot: 'legs',
    armorBonus: 4,
    dodgePenalty: 3,
  },
  leatherBoots: {
    id: 'leatherBoots',
    name: 'Leather Boots',
    description: 'Sturdy leather boots.',
    stackable: false,
    tags: ['armor', 'crafted'],
    weight: 1.5,
    equipSlot: 'feet',
    armorBonus: 2,
    dodgePenalty: 1,
  },

  // Structures (portable)
  campfire: {
    id: 'campfire',
    name: 'Campfire',
    description: 'A portable campfire kit. Place it to cook meat.',
    stackable: false,
    tags: ['structure', 'crafted'],
    weight: 5.0,
  },
};

export function getItem(id: string): ItemDef | undefined {
  return items[id];
}

export function isEdible(item: ItemDef): boolean {
  return item.tags.includes('food') && item.saturationGain !== undefined;
}

export function getItemsByTag(tag: string): ItemDef[] {
  return Object.values(items).filter((item) => item.tags.includes(tag));
}

// === Item Instance Creation ===

// Create an item instance with continuous quality value (0-100)
export function createItemInstanceWithQuality(itemId: string, qualityValue: number): ItemInstance {
  const baseDef = getItem(itemId);
  if (!baseDef) {
    throw new Error(`Unknown item: ${itemId}`);
  }

  const multiplier = getQualityMultiplier(qualityValue);
  const tier = getQualityTier(qualityValue);

  // Map tier to legacy quality type for backwards compatibility
  const legacyQuality: ItemQuality = tier === 'broken' ? 'poor' : tier as ItemQuality;

  const instance: ItemInstance = {
    itemId,
    quality: legacyQuality,
    qualityValue,
  };

  // Apply quality multiplier to numeric stats
  if (baseDef.minDamage !== undefined) {
    instance.minDamage = Math.max(1, Math.floor(baseDef.minDamage * multiplier));
  }
  if (baseDef.maxDamage !== undefined) {
    instance.maxDamage = Math.max(1, Math.floor(baseDef.maxDamage * multiplier));
  }
  if (baseDef.armorBonus !== undefined) {
    instance.armorBonus = Math.max(1, Math.floor(baseDef.armorBonus * multiplier));
  }
  if (baseDef.blockBonus !== undefined) {
    instance.blockBonus = Math.max(1, Math.floor(baseDef.blockBonus * multiplier));
  }
  if (baseDef.accuracy !== undefined) {
    // Accuracy can be negative for some items, so handle differently
    instance.accuracy = Math.floor(baseDef.accuracy * multiplier);
  }

  return instance;
}

// Legacy: Create an item instance with discrete quality tier
export function createItemInstance(itemId: string, quality: ItemQuality): ItemInstance {
  // Convert legacy quality to continuous value
  const qualityValueMap: Record<ItemQuality, number> = {
    poor: 15,
    normal: 37,
    good: 62,
    excellent: 82,
    masterwork: 95,
  };
  const qualityValue = qualityValueMap[quality];
  const instance = createItemInstanceWithQuality(itemId, qualityValue);
  instance.quality = quality; // Override to keep exact legacy quality
  return instance;
}

// Get display name for an item instance (includes quality prefix)
export function getItemInstanceName(instance: ItemInstance): string {
  const baseDef = getItem(instance.itemId);
  if (!baseDef) return 'Unknown Item';

  // Use continuous quality value if available
  if (instance.qualityValue !== undefined) {
    const qualityName = getQualityName(instance.qualityValue);
    if (qualityName === 'Normal') {
      return baseDef.name;
    }
    return `${qualityName} ${baseDef.name}`;
  }

  // Fallback to legacy quality
  if (instance.quality === 'normal') {
    return baseDef.name;
  }

  return `${QUALITY_NAMES[instance.quality]} ${baseDef.name}`;
}

// Get full item info combining base def and instance stats
export function getItemInstanceStats(instance: ItemInstance): {
  name: string;
  minDamage?: number;
  maxDamage?: number;
  armorBonus?: number;
  blockBonus?: number;
  accuracy?: number;
} {
  const baseDef = getItem(instance.itemId);

  return {
    name: getItemInstanceName(instance),
    minDamage: instance.minDamage ?? baseDef?.minDamage,
    maxDamage: instance.maxDamage ?? baseDef?.maxDamage,
    armorBonus: instance.armorBonus ?? baseDef?.armorBonus,
    blockBonus: instance.blockBonus ?? baseDef?.blockBonus,
    accuracy: instance.accuracy ?? baseDef?.accuracy,
  };
}

// Check if an item can have quality variation (equipment only)
export function canHaveQuality(itemId: string): boolean {
  const item = getItem(itemId);
  if (!item) return false;

  // Equipment items can have quality
  return (
    item.equipSlot !== undefined ||
    item.tags.includes('weapon') ||
    item.tags.includes('armor') ||
    item.tags.includes('shield')
  );
}
