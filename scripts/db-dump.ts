/**
 * Vuelca todas las colecciones a JSON, una por archivo.
 *
 *   npm run db:dump
 *
 * Existe porque `mongodump` requiere instalar las Database Tools de MongoDB, y
 * para una base de este tamaño un volcado en JSON es suficiente, legible y
 * restaurable con `db:restore`.
 *
 * Los `ObjectId` y las fechas se serializan con marca de tipo (`$oid`, `$date`)
 * para poder reconstruirlos: un `JSON.stringify` plano los convertiría en
 * cadenas y la restauración rompería las referencias entre colecciones.
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ObjectId } from 'mongodb';
import { closeMongoClient, getDb } from '@/lib/db/client';

function serializar(valor: unknown): unknown {
  if (valor instanceof ObjectId) return { $oid: valor.toHexString() };
  if (valor instanceof Date) return { $date: valor.toISOString() };
  if (Array.isArray(valor)) return valor.map(serializar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, serializar(v)]),
    );
  }
  return valor;
}

async function main(): Promise<void> {
  const db = await getDb();
  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const destino = join('backups', marca);
  await mkdir(destino, { recursive: true });

  console.log(`Base de datos: ${db.databaseName}`);
  console.log(`Destino: ${destino}\n`);

  const nombres = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .sort();

  let total = 0;
  for (const nombre of nombres) {
    const docs = await db.collection(nombre).find({}).toArray();
    const indices = await db.collection(nombre).indexes();
    await writeFile(
      join(destino, `${nombre}.json`),
      JSON.stringify({ collection: nombre, indexes: indices, documents: docs.map(serializar) }, null, 2),
    );
    total += docs.length;
    console.log(`  ${nombre.padEnd(18)} ${String(docs.length).padStart(4)} documento(s) · ${indices.length} índice(s)`);
  }

  console.log(`\n✓ ${total} documentos de ${nombres.length} colecciones en ${destino}`);
}

main()
  .catch((error: unknown) => {
    console.error('\n✗ Fallo al volcar la base de datos:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeMongoClient);
