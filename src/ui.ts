import type { Action } from './types.ts';
import type { Game } from './game.ts';
import { canAffordAction, getTotalWeight, getSpeedModifier } from './actor.ts';
import { getItem } from './items.ts';

export class UI {
  private game: Game;
  private elements: {
    tickCount: HTMLElement;
    turnCount: HTMLElement;
    healthCount: HTMLElement;
    maxHealth: HTMLElement;
    saturationCount: HTMLElement;
    maxSaturation: HTMLElement;
    weightCount: HTMLElement;
    maxWeight: HTMLElement;
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
  };

  constructor(game: Game) {
    this.game = game;
    this.elements = {
      tickCount: document.getElementById('tick-count')!,
      turnCount: document.getElementById('turn-count')!,
      healthCount: document.getElementById('health-count')!,
      maxHealth: document.getElementById('max-health')!,
      saturationCount: document.getElementById('saturation-count')!,
      maxSaturation: document.getElementById('max-saturation')!,
      weightCount: document.getElementById('weight-count')!,
      maxWeight: document.getElementById('max-weight')!,
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
  }

  private subscribeToGame(): void {
    this.game.on('turn', () => {
      this.renderStatus();
      this.renderInventory();
      this.renderStructures();
      this.renderEncounter();
      this.renderLoot();
      this.renderActions();
    });
    this.game.on('log', () => this.renderLog());
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
  }

  private renderGameOver(): void {
    this.elements.gameOverPanel.classList.remove('hidden');
  }

  render(): void {
    this.renderStatus();
    this.renderInventory();
    this.renderStructures();
    this.renderEncounter();
    this.renderLoot();
    this.renderActions();
    this.renderLog();
  }

  private renderStatus(): void {
    const player = this.game.state.player;
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

  private renderInventory(): void {
    const player = this.game.state.player;
    const inventory = player.inventory;

    const items = Object.entries(inventory)
      .filter(([_, count]) => count > 0)
      .map(([itemId, count]) => {
        const item = getItem(itemId);
        const name = item?.name ?? itemId;
        return `
          <div class="inventory-item">
            <span class="item-name">${name}: <span class="item-count">${count}</span></span>
            <button class="drop-btn" data-item-id="${itemId}" title="Drop 1">-</button>
          </div>
        `;
      });

    if (items.length === 0) {
      this.elements.inventoryList.innerHTML = '<span class="inventory-empty">Empty</span>';
    } else {
      this.elements.inventoryList.innerHTML = items.join('');

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
    const actions = this.game.filterActions(query);

    this.elements.actionsList.innerHTML = actions
      .map((action) => this.renderActionItem(action))
      .join('');

    this.elements.actionsList.querySelectorAll('.action-item').forEach((el) => {
      const actionId = el.getAttribute('data-action-id');
      const action = actions.find((a) => a.id === actionId);
      if (action) {
        el.addEventListener('click', () => this.handleActionClick(action));
      }
    });
  }

  private renderActionItem(action: Action): string {
    const player = this.game.state.player;
    const affordable = canAffordAction(player, action);

    let costDisplay: string;
    if (action.tickGain && action.tickCost) {
      const net = action.tickGain - action.tickCost;
      costDisplay = `${action.tickCost} cost, +${net} net`;
    } else if (action.tickGain) {
      costDisplay = `+${action.tickGain} ticks`;
    } else {
      costDisplay = `${action.tickCost} ticks`;
    }

    return `
      <div class="action-item ${affordable ? '' : 'disabled'}" data-action-id="${action.id}">
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
