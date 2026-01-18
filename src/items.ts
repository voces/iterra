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
    saturationGain: 4,
  },
  sticks: {
    id: 'sticks',
    name: 'Sticks',
    description: 'Dry wooden sticks. Useful for crafting.',
    stackable: true,
    tags: ['material', 'wood', 'foraged'],
  },
  rocks: {
    id: 'rocks',
    name: 'Rocks',
    description: 'Sturdy rocks. Useful for crafting and building.',
    stackable: true,
    tags: ['material', 'stone', 'foraged'],
  },

  // Meat
  rawMeat: {
    id: 'rawMeat',
    name: 'Raw Meat',
    description: 'Raw meat from a slain creature. Should be cooked before eating.',
    stackable: true,
    tags: ['food', 'raw', 'meat'],
    saturationGain: 2, // Can eat raw but not very filling
  },
  cookedMeat: {
    id: 'cookedMeat',
    name: 'Cooked Meat',
    description: 'Well-cooked meat. Nutritious and filling.',
    stackable: true,
    tags: ['food', 'cooked', 'meat'],
    saturationGain: 8,
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
