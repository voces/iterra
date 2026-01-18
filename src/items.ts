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
    description: 'Dry wooden sticks. Useful for crafting.',
    stackable: true,
    tags: ['material', 'wood', 'foraged'],
    weight: 0.5,
  },
  rocks: {
    id: 'rocks',
    name: 'Rocks',
    description: 'Sturdy rocks. Useful for crafting and building.',
    stackable: true,
    tags: ['material', 'stone', 'foraged'],
    weight: 2.0,
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
