import type { Action } from './types.ts';
import type { Game } from './game.ts';
import { canAffordAction } from './actor.ts';

export class UI {
  private game: Game;
  private elements: {
    tickCount: HTMLElement;
    tickRate: HTMLElement;
    currentAction: HTMLElement;
    actionProgress: HTMLElement;
    actionSearch: HTMLInputElement;
    actionsList: HTMLElement;
    gameLog: HTMLElement;
  };

  constructor(game: Game) {
    this.game = game;
    this.elements = {
      tickCount: document.getElementById('tick-count')!,
      tickRate: document.getElementById('tick-rate')!,
      currentAction: document.getElementById('current-action')!,
      actionProgress: document.getElementById('action-progress')!,
      actionSearch: document.getElementById('action-search') as HTMLInputElement,
      actionsList: document.getElementById('actions-list')!,
      gameLog: document.getElementById('game-log')!,
    };

    this.setupEventListeners();
    this.subscribeToGame();
  }

  private setupEventListeners(): void {
    this.elements.actionSearch.addEventListener('input', () => {
      this.renderActions();
    });

    // Keyboard shortcut: focus search with /
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
    this.game.on('tick', () => this.renderTicks());
    this.game.on('action-start', () => {
      this.renderStatus();
      this.renderActions();
    });
    this.game.on('action-complete', () => {
      this.renderStatus();
      this.renderActions();
    });
    this.game.on('log', () => this.renderLog());
  }

  render(): void {
    this.renderTicks();
    this.renderStatus();
    this.renderActions();
    this.renderLog();
  }

  private renderTicks(): void {
    const player = this.game.state.player;
    this.elements.tickCount.textContent = Math.floor(player.ticks).toString();
    this.elements.tickRate.textContent = player.tickRegenRate.toString();
    this.renderActions(); // Re-render to update affordability
    this.renderStatus(); // Update progress bar
  }

  private renderStatus(): void {
    const player = this.game.state.player;

    if (player.currentAction) {
      this.elements.currentAction.textContent = player.currentAction.name;
      const requiredTime = player.currentAction.tickCost * 0.5;
      const progress = Math.min((player.actionProgress / requiredTime) * 100, 100);
      this.elements.actionProgress.innerHTML = `<div class="bar" style="width: ${progress}%"></div>`;
    } else {
      this.elements.currentAction.textContent = 'Idle';
      this.elements.actionProgress.innerHTML = '';
    }
  }

  private renderActions(): void {
    const query = this.elements.actionSearch.value;
    const actions = this.game.filterActions(query);
    const player = this.game.state.player;
    const hasCurrentAction = player.currentAction !== null;

    this.elements.actionsList.innerHTML = actions
      .map((action) => this.renderActionItem(action, hasCurrentAction))
      .join('');

    // Attach click handlers
    this.elements.actionsList.querySelectorAll('.action-item').forEach((el) => {
      const actionId = el.getAttribute('data-action-id');
      const action = actions.find((a) => a.id === actionId);
      if (action) {
        el.addEventListener('click', () => this.handleActionClick(action));
      }
    });
  }

  private renderActionItem(action: Action, hasCurrentAction: boolean): string {
    const player = this.game.state.player;
    const affordable = canAffordAction(player, action);
    const disabled = !affordable || hasCurrentAction;

    return `
      <div class="action-item ${disabled ? 'disabled' : ''}" data-action-id="${action.id}">
        <div class="action-info">
          <span class="action-name">${action.name}</span>
        </div>
        <span class="action-cost ${affordable ? 'affordable' : ''}">${action.tickCost} ticks</span>
      </div>
    `;
  }

  private handleActionClick(action: Action): void {
    this.game.selectAction(action);
  }

  private renderLog(): void {
    const entries = this.game.state.log.slice(0, 20);
    this.elements.gameLog.innerHTML = entries
      .map((entry) => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        return `
          <div class="log-entry">
            <span class="timestamp">[${time}]</span>
            ${entry.message}
          </div>
        `;
      })
      .join('');
  }
}
