export interface Action {
  id: string;
  name: string;
  description: string;
  tickCost: number;
  tickGain?: number;
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
  speed: number;
  actions: Action[];
}

export interface GameState {
  player: Actor;
  turn: number;
  log: LogEntry[];
}

export interface LogEntry {
  turn: number;
  message: string;
}
