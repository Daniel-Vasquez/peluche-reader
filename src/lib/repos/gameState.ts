import type { WithId } from 'mongodb';
import { col } from '@/lib/db/collections';
import type { GameEventDoc, GameStateDoc } from '@/lib/db/types';
import { initialState, type GameState, type NewEvent } from '@/lib/game/engine';

/**
 * Devuelve el estado de juego del usuario, creándolo si no existe. Idempotente:
 * el índice único en `userId` impide que dos peticiones simultáneas lo dupliquen.
 */
export async function ensureGameState(
  userId: string,
  weekKey: string,
  dayKey: string,
): Promise<WithId<GameStateDoc>> {
  const states = await col.gameState();
  await states.updateOne(
    { userId },
    { $setOnInsert: { userId, ...initialState(weekKey, dayKey), updatedAt: new Date() } },
    { upsert: true },
  );
  const state = await states.findOne({ userId });
  if (!state) throw new Error(`No se pudo crear el estado de juego de ${userId}`);
  return state;
}

/** Quita los campos de MongoDB para obtener el `GameState` puro del motor. */
export function toGameState(doc: GameStateDoc): GameState {
  const { userId: _userId, updatedAt: _updatedAt, ...state } = doc;
  return state;
}

export async function saveGameState(userId: string, state: GameState): Promise<void> {
  const states = await col.gameState();
  await states.updateOne({ userId }, { $set: { ...state, updatedAt: new Date() } });
}

/** Persiste los eventos que devolvió el motor, en orden. */
export async function appendEvents(userId: string, events: NewEvent[]): Promise<void> {
  if (events.length === 0) return;
  const collection = await col.gameEvents();
  const now = new Date();
  const docs: GameEventDoc[] = events.map((event, i) => ({
    userId,
    ...event,
    // Desplazar un milisegundo por evento preserva el orden al ordenar por fecha.
    createdAt: new Date(now.getTime() + i),
  }));
  await collection.insertMany(docs);
}

/** Últimos eventos del historial, más reciente primero. */
export async function recentEvents(userId: string, limit = 20): Promise<GameEventDoc[]> {
  const events = await col.gameEvents();
  return events.find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray();
}
