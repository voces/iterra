export interface Action {
  id: string;
  name: string;
  description: string;
  tickCost: number;
  tags: string[];
  execute: (actor: Actor) => ActionResult;
}

export interface ActionResult {
  success: boolean;
  message: string;
}

export interface Actor {
  id: string;
  name: string;
  ticks: number;
  maxTicks: number;
  tickRegenRate: number;
  actions: Action[];
  currentAction: Action | null;
  actionProgress: number;
}

export interface GameState {
  player: Actor;
  turn: number;
  log: LogEntry[];
}

export interface LogEntry {
  turn: number;
  message: string;
  timestamp: number;
}
