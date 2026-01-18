export interface Action {
  id: string;
  name: string;
  description: string;
  tickCost: number;
  tickGain?: number;
  tags: string[];
  execute: (actor: Actor, context?: ActionContext) => ActionResult;
}

export interface ActionContext {
  encounter?: Encounter;
  game?: GameState;
}

export interface ActionResult {
  success: boolean;
  message: string;
  encounterEnded?: boolean;
  fled?: boolean;
  foundResource?: string;
}

export interface Inventory {
  berries: number;
}

export interface Actor {
  id: string;
  name: string;
  ticks: number;
  maxTicks: number;
  speed: number;
  health: number;
  maxHealth: number;
  damage: number;
  saturation: number;
  maxSaturation: number;
  inventory: Inventory;
  actions: Action[];
}

export interface Encounter {
  enemy: Actor;
  playerFleeing: boolean;
  enemyFleeing: boolean;
  ended: boolean;
  result?: 'victory' | 'defeat' | 'player_escaped' | 'enemy_escaped';
}

export interface GameState {
  player: Actor;
  turn: number;
  log: LogEntry[];
  encounter: Encounter | null;
  berryBushFound: boolean;
}

export interface LogEntry {
  turn: number;
  message: string;
}
