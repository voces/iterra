import type { Action, EquipSlot, StatType } from './types.ts';
import type { Game } from './game.ts';
import {
  getTotalWeight,
  getSpeedModifier,
  getDamageRange,
  getEquipmentArmorBonus,
  getEquipmentRangedBonus,
} from './actor.ts';
import { getItem } from './items.ts';
import { STAT_NAMES, STAT_DESCRIPTIONS, STAT_TYPES } from './stats.ts';
import { SKILL_TYPES, SKILL_NAMES, SKILL_DESCRIPTIONS } from './skills.ts';

export class UI {
  private game: Game;
  private actionGroupState: Map<string, boolean> = new Map(); // Track action group expanded state (true = expanded)
  private elements: {
    levelCount: HTMLElement;
    xpCount: HTMLElement;
    xpNext: HTMLElement;
    tickCount: HTMLElement;
    turnCount: HTMLElement;
    healthCount: HTMLElement;
    maxHealth: HTMLElement;
    saturationCount: HTMLElement;
    maxSaturation: HTMLElement;
    weightCount: HTMLElement;
    maxWeight: HTMLElement;
    characterStatsList: HTMLElement;
    freePointsDisplay: HTMLElement;
    equipmentList: HTMLElement;
    inventoryList: HTMLElement;
    structuresPanel: HTMLElement;
    structuresList: HTMLElement;
    lootPanel: HTMLElement;
    lootList: HTMLElement;
    takeAllLoot: HTMLElement;
    leaveLoot: HTMLElement;
    actionSearch: HTMLInputElement;
    actionsList: HTMLElement;
    gameLog: HTMLElement;
    encounterPanel: HTMLElement;
    enemyName: HTMLElement;
    enemyHealth: HTMLElement;
    enemyMaxHealth: HTMLElement;
    encounterStatus: HTMLElement;
    gameOverPanel: HTMLElement;
    restartButton: HTMLElement;
    skillsList: HTMLElement;
    locationPanel: HTMLElement;
    locationIcon: HTMLElement;
    locationName: HTMLElement;
    locationDetails: HTMLElement;
    exitStatus: HTMLElement;
    discoveredLocations: HTMLElement;
    trackingIndicator: HTMLElement;
    trackingCount: HTMLElement;
    trackingSummary: HTMLElement;
    copyTracking: HTMLElement;
    clearTracking: HTMLElement;
    trackingEnabled: HTMLInputElement;
  };

  constructor(game: Game) {
    this.game = game;
    this.elements = {
      levelCount: document.getElementById('level-count')!,
      xpCount: document.getElementById('xp-count')!,
      xpNext: document.getElementById('xp-next')!,
      tickCount: document.getElementById('tick-count')!,
      turnCount: document.getElementById('turn-count')!,
      healthCount: document.getElementById('health-count')!,
      maxHealth: document.getElementById('max-health')!,
      saturationCount: document.getElementById('saturation-count')!,
      maxSaturation: document.getElementById('max-saturation')!,
      weightCount: document.getElementById('weight-count')!,
      maxWeight: document.getElementById('max-weight')!,
      characterStatsList: document.getElementById('character-stats-list')!,
      freePointsDisplay: document.getElementById('free-points-display')!,
      equipmentList: document.getElementById('equipment-list')!,
      inventoryList: document.getElementById('inventory-list')!,
      structuresPanel: document.getElementById('structures-panel')!,
      structuresList: document.getElementById('structures-list')!,
      lootPanel: document.getElementById('loot-panel')!,
      lootList: document.getElementById('loot-list')!,
      takeAllLoot: document.getElementById('take-all-loot')!,
      leaveLoot: document.getElementById('leave-loot')!,
      actionSearch: document.getElementById('action-search') as HTMLInputElement,
      actionsList: document.getElementById('actions-list')!,
      gameLog: document.getElementById('game-log')!,
      encounterPanel: document.getElementById('encounter-panel')!,
      enemyName: document.getElementById('enemy-name')!,
      enemyHealth: document.getElementById('enemy-health')!,
      enemyMaxHealth: document.getElementById('enemy-max-health')!,
      encounterStatus: document.getElementById('encounter-status')!,
      gameOverPanel: document.getElementById('game-over-panel')!,
      restartButton: document.getElementById('restart-button')!,
      skillsList: document.getElementById('skills-list')!,
      locationPanel: document.getElementById('location-panel')!,
      locationIcon: document.getElementById('location-icon')!,
      locationName: document.getElementById('location-name')!,
      locationDetails: document.getElementById('location-details')!,
      exitStatus: document.getElementById('exit-status')!,
      discoveredLocations: document.getElementById('discovered-locations')!,
      trackingIndicator: document.getElementById('tracking-indicator')!,
      trackingCount: document.getElementById('tracking-count')!,
      trackingSummary: document.getElementById('tracking-summary')!,
      copyTracking: document.getElementById('copy-tracking')!,
      clearTracking: document.getElementById('clear-tracking')!,
      trackingEnabled: document.getElementById('tracking-enabled') as HTMLInputElement,
    };

    this.setupEventListeners();
    this.subscribeToGame();
  }

  private setupEventListeners(): void {
    this.elements.actionSearch.addEventListener('input', () => {
      this.renderActions();
    });

    this.elements.restartButton.addEventListener('click', () => {
      this.game.restart();
      this.elements.gameOverPanel.classList.add('hidden');
      this.render();
    });

    this.elements.takeAllLoot.addEventListener('click', () => {
      this.game.takeAllLoot();
    });

    this.elements.leaveLoot.addEventListener('click', () => {
      this.game.leaveLoot();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== this.elements.actionSearch) {
        e.preventDefault();
        this.elements.actionSearch.focus();
      }
      if (e.key === 'Escape') {
        this.elements.actionSearch.blur();
        this.elements.actionSearch.value = '';
        this.renderActions();
      }
    });

    // Setup collapsible section headers
    document.querySelectorAll('.collapsible .section-header').forEach((header) => {
      header.addEventListener('click', () => {
        const section = header.closest('.collapsible');
        if (section) {
          const content = section.querySelector('.section-content') as HTMLElement;
          const isCollapsed = section.classList.toggle('collapsed');
          // Update toggle icon
          const icon = header.querySelector('.toggle-icon');
          if (icon) {
            icon.textContent = isCollapsed ? '▶' : '▼';
          }
          // Use inline style to override ID-based display rules
          if (content) {
            content.style.display = isCollapsed ? 'none' : '';
          }
        }
      });
    });

    // Initialize mobile-collapsed sections properly
    if (window.matchMedia('(max-width: 600px)').matches) {
      document.querySelectorAll('.collapsed-mobile').forEach((section) => {
        section.classList.add('collapsed');
        const content = section.querySelector('.section-content') as HTMLElement;
        const icon = section.querySelector('.toggle-icon');
        if (content) {
          content.style.display = 'none';
        }
        if (icon) {
          icon.textContent = '▶';
        }
      });
    }

    // Tracking panel event listeners
    this.elements.copyTracking.addEventListener('click', () => {
      const data = this.game.exportTrackingData();
      navigator.clipboard.writeText(data).then(() => {
        const btn = this.elements.copyTracking as HTMLButtonElement;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = originalText; }, 1500);
      });
    });

    this.elements.clearTracking.addEventListener('click', () => {
      this.game.clearTrackingRecords();
      this.renderTracking();
    });

    this.elements.trackingEnabled.addEventListener('change', () => {
      this.game.setTrackingEnabled(this.elements.trackingEnabled.checked);
      this.renderTracking();
    });
  }

  private subscribeToGame(): void {
    this.game.on('turn', () => {
      this.renderStatus();
      this.renderCharacterStats();
      this.renderSkills();
      this.renderTracking();
      this.renderEquipment();
      this.renderInventory();
      this.renderStructures();
      this.renderEncounter();
      this.renderLoot();
      this.renderLocation();
      this.renderActions();
    });
    this.game.on('log', () => this.renderLog());
    this.game.on('level-up', () => {
      this.renderStatus();
      this.renderCharacterStats();
    });
    this.game.on('encounter-start', () => {
      this.renderEncounter();
      this.renderActions();
    });
    this.game.on('encounter-end', () => {
      this.renderEncounter();
      this.renderActions();
    });
    this.game.on('game-over', () => {
      this.renderGameOver();
    });
    this.game.on('location-entered', () => {
      this.renderLocation();
      this.renderActions();
    });
    this.game.on('location-exited', () => {
      this.renderLocation();
      this.renderActions();
    });
    this.game.on('location-discovered', () => {
      this.renderLocation();
      this.renderActions();
    });
    this.game.on('exit-found', () => {
      this.renderLocation();
      this.renderActions();
    });
  }

  private renderGameOver(): void {
    this.elements.gameOverPanel.classList.remove('hidden');
  }

  render(): void {
    this.renderStatus();
    this.renderCharacterStats();
    this.renderSkills();
    this.renderTracking();
    this.renderEquipment();
    this.renderInventory();
    this.renderStructures();
    this.renderEncounter();
    this.renderLoot();
    this.renderLocation();
    this.renderActions();
    this.renderLog();
  }

  private renderStatus(): void {
    const player = this.game.state.player;
    const levelInfo = player.levelInfo;

    // Level and XP
    this.elements.levelCount.textContent = levelInfo.level.toString();
    this.elements.xpCount.textContent = levelInfo.xp.toString();
    this.elements.xpNext.textContent = levelInfo.xpToNextLevel.toString();

    this.elements.tickCount.textContent = player.ticks.toString();
    this.elements.turnCount.textContent = this.game.state.turn.toString();
    this.elements.healthCount.textContent = player.health.toString();
    this.elements.maxHealth.textContent = player.maxHealth.toString();
    this.elements.saturationCount.textContent = player.saturation.toString();
    this.elements.maxSaturation.textContent = player.maxSaturation.toString();

    // Weight display with speed modifier indicator
    const weight = getTotalWeight(player);
    const speedMod = getSpeedModifier(player);
    const speedIndicator = speedMod > 0 ? '+' : '';
    this.elements.weightCount.textContent = weight.toFixed(1);
    this.elements.maxWeight.textContent = `${player.carryCapacity} (${speedIndicator}${Math.round(speedMod)} spd)`;
  }

  private renderCharacterStats(): void {
    const player = this.game.state.player;
    const levelInfo = player.levelInfo;
    const stats = levelInfo.stats;
    const freePoints = levelInfo.freeStatPoints;
    const inCombat = this.game.state.encounter !== null;

    // Show free points in header
    if (freePoints > 0) {
      this.elements.freePointsDisplay.textContent = `(${freePoints} points)`;
      this.elements.freePointsDisplay.classList.add('has-points');
    } else {
      this.elements.freePointsDisplay.textContent = '';
      this.elements.freePointsDisplay.classList.remove('has-points');
    }

    let html = '';

    for (const stat of STAT_TYPES) {
      const value = stats[stat];
      const name = STAT_NAMES[stat];
      const desc = STAT_DESCRIPTIONS[stat];
      const canAllocate = freePoints > 0 && !inCombat;

      html += `
        <div class="stat-row">
          <span class="stat-name" title="${desc}">${name}</span>
          <span class="stat-value">${value}</span>
          ${canAllocate ? `<button class="allocate-btn" data-stat="${stat}" title="Allocate point">+</button>` : ''}
        </div>
      `;
    }

    this.elements.characterStatsList.innerHTML = html;

    // Add allocate button listeners
    this.elements.characterStatsList.querySelectorAll('.allocate-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const stat = (e.target as HTMLElement).getAttribute('data-stat') as StatType;
        if (stat) {
          this.game.allocateStat(stat);
        }
      });
    });
  }

  private renderSkills(): void {
    const player = this.game.state.player;
    const skills = player.skills;

    // Filter to skills that have been used (have XP or level > 0)
    // Sort by most recently gained XP (descending)
    const activeSkills = SKILL_TYPES
      .filter(skillType => {
        const skill = skills[skillType];
        return skill.level > 0 || skill.xp > 0;
      })
      .sort((a, b) => skills[b].lastGainedAt - skills[a].lastGainedAt);

    if (activeSkills.length === 0) {
      this.elements.skillsList.innerHTML = '<div class="no-skills">No skills yet. Fight or craft to gain skills!</div>';
      return;
    }

    let html = '';

    for (const skillType of activeSkills) {
      const skill = skills[skillType];
      const name = SKILL_NAMES[skillType];
      const desc = SKILL_DESCRIPTIONS[skillType];

      // Calculate progress percentage for XP bar
      const xpPercent = skill.xpToNextLevel > 0
        ? Math.floor((skill.xp / skill.xpToNextLevel) * 100)
        : 100;

      html += `
        <div class="skill-row" title="${desc}">
          <span class="skill-name">${name}</span>
          <span class="skill-level">${skill.level}</span>
          <div class="skill-xp-bar">
            <div class="skill-xp-fill" style="width: ${xpPercent}%"></div>
          </div>
          <span class="skill-xp">${skill.xp}/${skill.xpToNextLevel}</span>
        </div>
      `;
    }

    this.elements.skillsList.innerHTML = html;
  }

  private renderEquipment(): void {
    const player = this.game.state.player;
    const equipment = player.equipment;
    const inCombat = this.game.state.encounter !== null;

    const slots: { slot: EquipSlot; label: string }[] = [
      { slot: 'mainHand', label: 'Main Hand' },
      { slot: 'offHand', label: 'Off Hand' },
      { slot: 'head', label: 'Head' },
      { slot: 'chest', label: 'Chest' },
      { slot: 'legs', label: 'Legs' },
      { slot: 'feet', label: 'Feet' },
    ];

    // Get total bonuses for display
    const damageRange = getDamageRange(player);
    const armorBonus = getEquipmentArmorBonus(player);
    const rangedBonus = getEquipmentRangedBonus(player);

    const bonusDisplay = [];
    bonusDisplay.push(`${damageRange.min}-${damageRange.max} Dmg`);
    if (armorBonus > 0) bonusDisplay.push(`+${armorBonus} Armor`);
    if (rangedBonus > 0) bonusDisplay.push(`+${rangedBonus} Ranged`);

    let html = '';

    if (bonusDisplay.length > 0) {
      html += `<div class="equipment-bonuses">${bonusDisplay.join(' | ')}</div>`;
    }

    // Track two-handed items to avoid showing them twice
    const twoHandedItem = equipment.mainHand && equipment.mainHand === equipment.offHand
      ? equipment.mainHand
      : null;

    for (const { slot, label } of slots) {
      const itemId = equipment[slot];

      // Skip offHand display for two-handed weapons
      if (slot === 'offHand' && twoHandedItem) {
        continue;
      }

      const item = itemId ? getItem(itemId) : null;
      const itemName = item?.name ?? 'Empty';
      const isTwoHanded = item?.twoHanded;

      const slotLabel = isTwoHanded ? 'Both Hands' : label;

      html += `
        <div class="equipment-slot">
          <span class="slot-label">${slotLabel}:</span>
          <span class="slot-item">${itemName}</span>
          ${itemId && !inCombat ? `<button class="unequip-btn" data-slot="${slot}" title="Unequip">×</button>` : ''}
        </div>
      `;
    }

    this.elements.equipmentList.innerHTML = html;

    // Add unequip button listeners
    this.elements.equipmentList.querySelectorAll('.unequip-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const slot = (e.target as HTMLElement).getAttribute('data-slot') as EquipSlot;
        if (slot) {
          this.game.unequip(slot);
        }
      });
    });
  }

  private renderInventory(): void {
    const player = this.game.state.player;
    const inventory = player.inventory;
    const inCombat = this.game.state.encounter !== null;

    const items = Object.entries(inventory)
      .filter(([_, count]) => count > 0)
      .map(([itemId, count]) => {
        const item = getItem(itemId);
        const name = item?.name ?? itemId;
        const canEquip = item?.equipSlot && !inCombat;

        return `
          <div class="inventory-item">
            <span class="item-name">${name}: <span class="item-count">${count}</span></span>
            <div class="item-actions">
              ${canEquip ? `<button class="equip-btn" data-item-id="${itemId}" data-slot="${item.equipSlot}" title="Equip">E</button>` : ''}
              <button class="drop-btn" data-item-id="${itemId}" title="Drop 1">-</button>
            </div>
          </div>
        `;
      });

    if (items.length === 0) {
      this.elements.inventoryList.innerHTML = '<span class="inventory-empty">Empty</span>';
    } else {
      this.elements.inventoryList.innerHTML = items.join('');

      // Add equip button listeners
      this.elements.inventoryList.querySelectorAll('.equip-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const itemId = (e.target as HTMLElement).getAttribute('data-item-id');
          const slot = (e.target as HTMLElement).getAttribute('data-slot') as EquipSlot;
          if (itemId && slot) {
            this.game.equip(itemId, slot);
          }
        });
      });

      // Add drop button listeners
      this.elements.inventoryList.querySelectorAll('.drop-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const itemId = (e.target as HTMLElement).getAttribute('data-item-id');
          if (itemId) {
            this.game.dropItem(itemId, 1);
          }
        });
      });
    }
  }

  private renderStructures(): void {
    const structures = this.game.state.structures;

    if (structures.size === 0) {
      this.elements.structuresPanel.classList.add('hidden');
      return;
    }

    this.elements.structuresPanel.classList.remove('hidden');

    const structureNames: Record<string, string> = {
      campfire: 'Campfire',
    };

    const items = Array.from(structures).map((id) => {
      const name = structureNames[id] ?? id;
      return `<span class="structure-item">${name}</span>`;
    });

    this.elements.structuresList.innerHTML = items.join('');
  }

  private renderLocation(): void {
    const locationInfo = this.game.getCurrentLocation();
    const foundExit = this.game.state.foundExit;
    const enterableLocations = this.game.getEnterableLocations();

    // Update location name
    this.elements.locationName.textContent = locationInfo.name;

    // Update icon based on location type
    if (locationInfo.id === null) {
      this.elements.locationIcon.textContent = '🌲'; // Wilderness
    } else if (locationInfo.isSafe) {
      this.elements.locationIcon.textContent = '🏠'; // Safe location
    } else {
      this.elements.locationIcon.textContent = '⚔️'; // Dangerous location
    }

    // Show details if we're in a location or have discovered locations
    const hasDetails = locationInfo.id !== null || enterableLocations.length > 0;

    if (hasDetails) {
      this.elements.locationDetails.classList.remove('hidden');

      // Exit status
      if (locationInfo.id !== null) {
        if (foundExit) {
          this.elements.exitStatus.innerHTML = '<span class="exit-found">✓ Exit found</span>';
        } else {
          this.elements.exitStatus.innerHTML = '<span class="exit-searching">Searching for exit...</span>';
        }
      } else {
        this.elements.exitStatus.innerHTML = '';
      }

      // Discovered locations
      if (enterableLocations.length > 0) {
        const locList = enterableLocations
          .map((loc) => {
            const entranceText = loc.entrances > 1 ? ` (×${loc.entrances})` : '';
            return `<span class="discovered-location">→ ${loc.name}${entranceText}</span>`;
          })
          .join('');
        this.elements.discoveredLocations.innerHTML = locList;
      } else {
        this.elements.discoveredLocations.innerHTML = '';
      }
    } else {
      this.elements.locationDetails.classList.add('hidden');
    }
  }

  private renderLoot(): void {
    const loot = this.game.state.pendingLoot;

    if (!loot) {
      this.elements.lootPanel.classList.add('hidden');
      return;
    }

    this.elements.lootPanel.classList.remove('hidden');

    const items = Object.entries(loot)
      .filter(([_, count]) => count > 0)
      .map(([itemId, count]) => {
        const item = getItem(itemId);
        const name = item?.name ?? itemId;
        const weight = item?.weight ?? 0;
        return `
          <div class="loot-item">
            <span class="item-name">${name}: ${count} (${(weight * count).toFixed(1)} wt)</span>
            <button class="take-btn" data-item-id="${itemId}" title="Take 1">+</button>
          </div>
        `;
      });

    this.elements.lootList.innerHTML = items.join('');

    // Add take button listeners
    this.elements.lootList.querySelectorAll('.take-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const itemId = (e.target as HTMLElement).getAttribute('data-item-id');
        if (itemId) {
          this.game.takeLoot(itemId, 1);
        }
      });
    });
  }

  private renderEncounter(): void {
    const encounter = this.game.state.encounter;

    if (!encounter) {
      this.elements.encounterPanel.classList.add('hidden');
      return;
    }

    this.elements.encounterPanel.classList.remove('hidden');

    const enemy = encounter.enemy;
    this.elements.enemyName.textContent = enemy.name;
    this.elements.enemyHealth.textContent = enemy.health.toString();
    this.elements.enemyMaxHealth.textContent = enemy.maxHealth.toString();

    let status = '';
    if (encounter.enemyFleeing) {
      status = 'Enemy is fleeing!';
    } else if (encounter.playerFleeing) {
      status = 'You are fleeing!';
    }
    this.elements.encounterStatus.textContent = status;
  }

  private renderActions(): void {
    const query = this.elements.actionSearch.value;

    // If searching, show flat list
    if (query.trim()) {
      const actions = this.game.filterActions(query);
      this.elements.actionsList.innerHTML = actions
        .map((action) => this.renderActionItem(action))
        .join('');
    } else {
      // Otherwise show grouped/categorized actions
      const groups = this.game.getGroupedActions();
      this.elements.actionsList.innerHTML = groups
        .map((group, idx) => {
          // Check if user has explicitly set state, otherwise use default (first expanded, others collapsed)
          const defaultExpanded = idx === 0;
          const userState = this.actionGroupState.get(group.category);
          const expanded = userState !== undefined ? userState : defaultExpanded;
          return this.renderActionGroup(group.category, group.actions, expanded);
        })
        .join('');
    }

    this.elements.actionsList.querySelectorAll('.action-item').forEach((el) => {
      const actionId = el.getAttribute('data-action-id');
      el.addEventListener('click', () => {
        const action = this.game.getAvailableActions().find((a) => a.id === actionId);
        if (action) this.handleActionClick(action);
      });
    });

    // Setup collapsible category headers
    this.elements.actionsList.querySelectorAll('.action-category-header').forEach((el) => {
      el.addEventListener('click', () => {
        const category = el.getAttribute('data-category');
        const content = el.nextElementSibling as HTMLElement;
        const isCollapsed = el.classList.toggle('collapsed');
        // Track expanded state (store opposite of collapsed)
        if (category) {
          this.actionGroupState.set(category, !isCollapsed);
        }
        // Update toggle icon
        const toggle = el.querySelector('.category-toggle');
        if (toggle) {
          toggle.textContent = isCollapsed ? '▶' : '▼';
        }
        if (content) {
          content.style.display = isCollapsed ? 'none' : 'flex';
        }
      });
    });
  }

  private renderActionGroup(category: string, actions: Action[], expanded: boolean = true): string {
    const actionsHtml = actions.map((action) => this.renderActionItem(action)).join('');
    const collapsedClass = expanded ? '' : 'collapsed';
    const displayStyle = expanded ? 'flex' : 'none';

    return `
      <div class="action-category">
        <div class="action-category-header ${collapsedClass}" data-category="${category}">
          <span class="category-toggle">${expanded ? '▼' : '▶'}</span>
          <span class="category-name">${category}</span>
          <span class="category-count">${actions.length}</span>
        </div>
        <div class="action-category-content" style="display: ${displayStyle}">
          ${actionsHtml}
        </div>
      </div>
    `;
  }

  private renderActionItem(action: Action): string {
    const player = this.game.state.player;
    const effectiveCost = this.game.getEffectiveTickCost(action);
    const affordable = player.ticks >= effectiveCost;
    const hasDistanceBonus = effectiveCost > action.tickCost;

    let costDisplay: string;
    if (action.tickGain && effectiveCost) {
      const net = action.tickGain - effectiveCost;
      costDisplay = `${effectiveCost} cost, +${net} net`;
    } else if (action.tickGain) {
      costDisplay = `+${action.tickGain} ticks`;
    } else {
      costDisplay = `${effectiveCost} ticks`;
    }

    // Add distance indicator if cost increased
    const distanceClass = hasDistanceBonus ? ' has-distance' : '';

    return `
      <div class="action-item ${affordable ? '' : 'disabled'}${distanceClass}" data-action-id="${action.id}">
        <div class="action-info">
          <span class="action-name">${action.name}</span>
        </div>
        <span class="action-cost ${affordable ? 'affordable' : ''}">${costDisplay}</span>
      </div>
    `;
  }

  private handleActionClick(action: Action): void {
    this.game.performAction(action);
  }

  private renderTracking(): void {
    const enabled = this.game.isTrackingEnabled();
    const summary = this.game.getTrackingSummary();

    // Update indicator
    this.elements.trackingIndicator.textContent = enabled ? 'Recording' : 'Paused';
    this.elements.trackingIndicator.className = enabled ? 'tracking-on' : 'tracking-off';

    // Update count
    this.elements.trackingCount.textContent = `${summary.totalActions} actions`;

    // Update checkbox
    this.elements.trackingEnabled.checked = enabled;

    // Update summary
    if (summary.totalActions > 0) {
      const followPercent = (summary.followRate * 100).toFixed(0);
      this.elements.trackingSummary.innerHTML = `
        Suggestions followed: <span class="follow-rate">${followPercent}%</span>
        (${summary.suggestedFollowed}/${summary.totalActions})
      `;
    } else {
      this.elements.trackingSummary.innerHTML = 'No actions recorded yet.';
    }
  }

  private renderLog(): void {
    const entries = this.game.state.log.slice(0, 20);
    this.elements.gameLog.innerHTML = entries
      .map((entry) => `
        <div class="log-entry">
          <span class="timestamp">[${entry.turn}]</span>
          ${entry.message}
        </div>
      `)
      .join('');
  }
}
