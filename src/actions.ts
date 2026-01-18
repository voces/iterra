import type { Action, Actor } from './types.ts';

export const idle: Action = {
  id: 'idle',
  name: 'Idle',
  description: 'Do nothing and let time pass.',
  tickCost: 1,
  tags: ['basic', 'passive'],
  execute: (_actor: Actor) => ({
    success: true,
    message: 'You idle, letting time slip by.',
  }),
};

export const wander: Action = {
  id: 'wander',
  name: 'Wander',
  description: 'Wander aimlessly, perhaps discovering something.',
  tickCost: 3,
  tags: ['basic', 'exploration', 'movement'],
  execute: (_actor: Actor) => {
    const outcomes = [
      'You wander through familiar paths.',
      'You explore a quiet corner.',
      'You meander without purpose, but feel refreshed.',
      'Your wandering reveals nothing new, but clears your mind.',
    ];
    const message = outcomes[Math.floor(Math.random() * outcomes.length)];
    return {
      success: true,
      message,
    };
  },
};

export const initialPlayerActions: Action[] = [idle, wander];
