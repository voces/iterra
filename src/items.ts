import type { ItemDef } from './types.ts';

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
    damageBonus: 2,
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
    damageBonus: 5,
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
    damageBonus: 8,
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
    damageBonus: 6,
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
