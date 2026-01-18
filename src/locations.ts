import type { LocationDef } from './types.ts';

// Location registry - all discoverable locations
export const locations: Record<string, LocationDef> = {
  // === Wilderness locations (found while in no location) ===
  cave: {
    id: 'cave',
    name: 'Dark Cave',
    description: 'A dark cave entrance yawns before you.',
    discoveryChance: 0.08,
    discoveryMessage: 'You discover the entrance to a dark cave!',
    exitDiscoveryChance: 0.15,
    availableEnemies: ['wolf', 'snake', 'bandit'],
    availableResources: ['rockyOutcrop'],
    childLocations: ['cavern'],
  },
  forest: {
    id: 'forest',
    name: 'Dense Forest',
    description: 'A dense forest with towering trees.',
    discoveryChance: 0.1,
    discoveryMessage: 'You find a path leading into a dense forest!',
    exitDiscoveryChance: 0.12,
    availableEnemies: ['rabbit', 'deer', 'wolf', 'boar'],
    availableResources: ['berryBush', 'fallenBranches', 'tallGrass'],
    childLocations: ['clearing'],
  },
  ruins: {
    id: 'ruins',
    name: 'Ancient Ruins',
    description: 'Crumbling stone structures from a forgotten age.',
    discoveryChance: 0.05,
    discoveryMessage: 'You stumble upon ancient ruins hidden in the landscape!',
    exitDiscoveryChance: 0.1,
    availableEnemies: ['snake', 'bandit'],
    availableResources: ['rockyOutcrop'],
    childLocations: ['ruinsCrypt'],
  },
  village: {
    id: 'village',
    name: 'Abandoned Village',
    description: 'An eerily quiet abandoned village.',
    discoveryChance: 0.04,
    discoveryMessage: 'You discover an abandoned village!',
    exitDiscoveryChance: 0.2,
    availableEnemies: ['bandit'],
    availableResources: ['fallenBranches'],
    childLocations: ['villageWell'],
    isSafe: false, // Bandits make it unsafe
  },

  // === Nested locations (found inside other locations) ===
  cavern: {
    id: 'cavern',
    name: 'Deep Cavern',
    description: 'A vast underground cavern with dripping stalactites.',
    discoveryChance: 0.1, // Found while exploring cave
    discoveryMessage: 'You find a passage leading deeper into the cavern!',
    exitDiscoveryChance: 0.12,
    availableEnemies: ['snake', 'bandit'],
    availableResources: ['rockyOutcrop'],
    parentId: 'cave',
  },
  clearing: {
    id: 'clearing',
    name: 'Forest Clearing',
    description: 'A peaceful clearing in the forest.',
    discoveryChance: 0.12,
    discoveryMessage: 'You emerge into a sunlit clearing!',
    exitDiscoveryChance: 0.25,
    availableEnemies: ['rabbit', 'deer'],
    availableResources: ['berryBush', 'tallGrass'],
    parentId: 'forest',
    isSafe: true, // No aggressive enemies
  },
  ruinsCrypt: {
    id: 'ruinsCrypt',
    name: 'Ancient Crypt',
    description: 'A dusty crypt beneath the ruins.',
    discoveryChance: 0.08,
    discoveryMessage: 'You find stairs descending into a crypt!',
    exitDiscoveryChance: 0.1,
    availableEnemies: ['snake', 'bandit'],
    availableResources: ['rockyOutcrop'],
    parentId: 'ruins',
  },
  villageWell: {
    id: 'villageWell',
    name: 'Village Well',
    description: 'An old well in the village center.',
    discoveryChance: 0.15,
    discoveryMessage: 'You notice an old well in the village!',
    exitDiscoveryChance: 0.3,
    availableEnemies: ['snake'],
    availableResources: ['rockyOutcrop'],
    parentId: 'village',
  },
};

export function getLocation(id: string): LocationDef | undefined {
  return locations[id];
}

export function getAllLocations(): LocationDef[] {
  return Object.values(locations);
}

// Get locations that can be discovered from the current location (or wilderness)
export function getDiscoverableLocations(currentLocationId: string | null): LocationDef[] {
  if (currentLocationId === null) {
    // In wilderness - return top-level locations (no parentId)
    return getAllLocations().filter((loc) => !loc.parentId);
  }

  const currentLocation = getLocation(currentLocationId);
  if (!currentLocation || !currentLocation.childLocations) {
    return [];
  }

  return currentLocation.childLocations
    .map((id) => getLocation(id))
    .filter((loc): loc is LocationDef => loc !== undefined);
}

// Roll for location discovery while wandering
export function rollForLocationDiscovery(currentLocationId: string | null): LocationDef | null {
  const discoverable = getDiscoverableLocations(currentLocationId);

  for (const location of discoverable) {
    if (Math.random() < location.discoveryChance) {
      return location;
    }
  }

  return null;
}

// Roll for exit discovery while wandering inside a location
export function rollForExitDiscovery(currentLocationId: string | null): boolean {
  if (currentLocationId === null) {
    return false; // Can't find an exit from wilderness
  }

  const location = getLocation(currentLocationId);
  if (!location) {
    return false;
  }

  return Math.random() < location.exitDiscoveryChance;
}

// Get the full location path as a readable string
export function getLocationPath(locationStack: string[], currentLocationId: string | null): string {
  if (currentLocationId === null) {
    return 'Wilderness';
  }

  const path = [...locationStack];
  if (currentLocationId && !path.includes(currentLocationId)) {
    path.push(currentLocationId);
  }

  return path
    .map((id) => getLocation(id)?.name ?? id)
    .join(' → ');
}
