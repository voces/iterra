import type { Action } from './types.ts';
import type { Game } from './game.ts';
import { canAffordAction } from './actor.ts';

export class UI {
  private game: Game;
  private elements: {
    tickCount: HTMLElement;
    turnCount: HTMLElement;
    actionSearch: HTMLInputElement;
    actionsList: HTMLElement;
    gameLog: HTMLElement;
  };

  constructor(game: Game) {
    this.game = game;
    this.elements = {
      tickCount: document.getElementById('tick-count')!,
      turnCount: document.getElementById('turn-count')!,
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
      this.renderActions();
    });
    this.game.on('log', () => this.renderLog());
  }

  render(): void {
    this.renderStatus();
    this.renderActions();
    this.renderLog();
  }

  private renderStatus(): void {
    const player = this.game.state.player;
    this.elements.tickCount.textContent = player.ticks.toString();
    this.elements.turnCount.textContent = this.game.state.turn.toString();
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

    const costDisplay = action.tickGain
      ? `+${action.tickGain} ticks`
      : `${action.tickCost} ticks`;

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
