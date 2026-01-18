import type { Action } from './types.ts';
import type { Game } from './game.ts';
import { canAffordAction } from './actor.ts';

export class UI {
  private game: Game;
  private elements: {
    tickCount: HTMLElement;
    turnCount: HTMLElement;
    healthCount: HTMLElement;
    maxHealth: HTMLElement;
    saturationCount: HTMLElement;
    maxSaturation: HTMLElement;
    berriesCount: HTMLElement;
    actionSearch: HTMLInputElement;
    actionsList: HTMLElement;
    gameLog: HTMLElement;
    encounterPanel: HTMLElement;
    enemyName: HTMLElement;
    enemyHealth: HTMLElement;
    enemyMaxHealth: HTMLElement;
    encounterStatus: HTMLElement;
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
      berriesCount: document.getElementById('berries-count')!,
      actionSearch: document.getElementById('action-search') as HTMLInputElement,
      actionsList: document.getElementById('actions-list')!,
      gameLog: document.getElementById('game-log')!,
      encounterPanel: document.getElementById('encounter-panel')!,
      enemyName: document.getElementById('enemy-name')!,
      enemyHealth: document.getElementById('enemy-health')!,
      enemyMaxHealth: document.getElementById('enemy-max-health')!,
      encounterStatus: document.getElementById('encounter-status')!,
    };

    this.setupEventListeners();
    this.subscribeToGame();
  }

  private setupEventListeners(): void {
    this.elements.actionSearch.addEventListener('input', () => {
      this.renderActions();
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
      this.renderEncounter();
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
  }

  render(): void {
    this.renderStatus();
    this.renderInventory();
    this.renderEncounter();
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
  }

  private renderInventory(): void {
    const player = this.game.state.player;
    this.elements.berriesCount.textContent = player.inventory.berries.toString();
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
