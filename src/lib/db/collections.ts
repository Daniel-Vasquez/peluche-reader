import type { Collection } from 'mongodb';
import { getDb } from './client';
import type {
  DailyProgressDoc,
  GameEventDoc,
  GameStateDoc,
  GoalDoc,
  ProfileDoc,
  SessionDoc,
} from './types';

/**
 * Accesores tipados a las colecciones. Único punto donde se escriben los
 * nombres de colección: si cambia uno, cambia aquí y en `db-init.ts`.
 */
export const col = {
  profiles: async (): Promise<Collection<ProfileDoc>> =>
    (await getDb()).collection<ProfileDoc>('profiles'),

  goals: async (): Promise<Collection<GoalDoc>> =>
    (await getDb()).collection<GoalDoc>('goals'),

  // `sessions`, no `readingSessions`: el nombre mentía en cuanto existe un
  // objetivo que no es lectura.
  sessions: async (): Promise<Collection<SessionDoc>> =>
    (await getDb()).collection<SessionDoc>('sessions'),

  dailyProgress: async (): Promise<Collection<DailyProgressDoc>> =>
    (await getDb()).collection<DailyProgressDoc>('dailyProgress'),

  gameState: async (): Promise<Collection<GameStateDoc>> =>
    (await getDb()).collection<GameStateDoc>('gameState'),

  gameEvents: async (): Promise<Collection<GameEventDoc>> =>
    (await getDb()).collection<GameEventDoc>('gameEvents'),
};
