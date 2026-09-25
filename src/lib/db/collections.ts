import type { Collection } from 'mongodb';
import { getDb } from './client';
import type {
  DailyProgressDoc,
  GameEventDoc,
  GameStateDoc,
  ProfileDoc,
  ReadingSessionDoc,
} from './types';

/**
 * Accesores tipados a las colecciones. Único punto donde se escriben los
 * nombres de colección: si cambia uno, cambia aquí y en `db-init.ts`.
 */
export const col = {
  profiles: async (): Promise<Collection<ProfileDoc>> =>
    (await getDb()).collection<ProfileDoc>('profiles'),

  sessions: async (): Promise<Collection<ReadingSessionDoc>> =>
    (await getDb()).collection<ReadingSessionDoc>('readingSessions'),

  dailyProgress: async (): Promise<Collection<DailyProgressDoc>> =>
    (await getDb()).collection<DailyProgressDoc>('dailyProgress'),

  gameState: async (): Promise<Collection<GameStateDoc>> =>
    (await getDb()).collection<GameStateDoc>('gameState'),

  gameEvents: async (): Promise<Collection<GameEventDoc>> =>
    (await getDb()).collection<GameEventDoc>('gameEvents'),
};
