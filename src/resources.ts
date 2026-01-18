import type { ResourceNodeDef } from './types.ts';

// Resource node registry - things you can find and gather from
export const resourceNodes: Record<string, ResourceNodeDef> = {
  berryBush: {
    id: 'berryBush',
    name: 'Berry Bush',
    description: 'A bush laden with ripe berries.',
    gatherActionId: 'gather-berries',
    discoveryChance: 0.2,
    discoveryMessage: 'You stumble upon a bush laden with ripe berries!',
    depletionChance: 0.6,
  },
  fallenBranches: {
    id: 'fallenBranches',
    name: 'Fallen Branches',
    description: 'Some fallen branches on the ground.',
    gatherActionId: 'gather-sticks',
    discoveryChance: 0.2,
    discoveryMessage: 'You find some fallen branches on the ground.',
    depletionChance: 0.5,
  },
  rockyOutcrop: {
    id: 'rockyOutcrop',
    name: 'Rocky Outcrop',
    description: 'Some useful rocks jutting from the ground.',
    gatherActionId: 'gather-rocks',
    discoveryChance: 0.15,
    discoveryMessage: 'You notice some useful rocks nearby.',
    depletionChance: 0.4,
  },
};

export function getResourceNode(id: string): ResourceNodeDef | undefined {
  return resourceNodes[id];
}

export function getAllResourceNodes(): ResourceNodeDef[] {
  return Object.values(resourceNodes);
}

// Roll for resource discovery while wandering
export function rollForResourceDiscovery(): ResourceNodeDef | null {
  const nodes = getAllResourceNodes();
  let cumulative = 0;
  const roll = Math.random();

  for (const node of nodes) {
    cumulative += node.discoveryChance;
    if (roll < cumulative) {
      return node;
    }
  }

  return null;
}
