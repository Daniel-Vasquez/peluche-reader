/**
 * Restaura un volcado de `db:dump`.
 *
 *   ALLOW_DB_RESTORE=yes npm run db:restore -- backups/2026-10-02T06-30-48-470Z
 *
 * **Reemplaza** el contenido de cada colección del volcado. Lleva el mismo
 * interruptor de seguridad que `db:reset`, porque borra tanto como él.
 */
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ObjectId } from 'mongodb';
import { closeMongoClient, getDb } from '@/lib/db/client';

/** Deshace la serialización de `db:dump`: `{$oid}` y `{$date}` vuelven a su tipo. */
function revivir(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(revivir);
  if (valor && typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    if (typeof obj.$oid === 'string') return new ObjectId(obj.$oid);
    if (typeof obj.$date === 'string') return new Date(obj.$date);
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, revivir(v)]));
  }
  return valor;
}

async function main(): Promise<void> {
  const origen = process.argv[2];
  if (!origen) {
    console.error('✗ Falta la carpeta del volcado.');
    console.error('  Uso: ALLOW_DB_RESTORE=yes npm run db:restore -- backups/<marca>');
    process.exitCode = 1;
    return;
  }
  if (process.env.ALLOW_DB_RESTORE !== 'yes') {
    console.error('✗ Restauración bloqueada: reemplaza el contenido de las colecciones.');
    console.error(`  Para confirmar:  ALLOW_DB_RESTORE=yes npm run db:restore -- ${origen}`);
    process.exitCode = 1;
    return;
  }

  const db = await getDb();
  console.log(`⚠  Restaurando ${origen} sobre "${db.databaseName}"\n`);

  const archivos = (await readdir(origen)).filter((f) => f.endsWith('.json'));
  for (const archivo of archivos) {
    const { collection, documents } = JSON.parse(await readFile(join(origen, archivo), 'utf8')) as {
      collection: string;
      documents: unknown[];
    };
    await db.collection(collection).deleteMany({});
    if (documents.length > 0) {
      await db.collection(collection).insertMany(documents.map(revivir) as never[]);
    }
    console.log(`  ✓ ${collection.padEnd(18)} ${documents.length} documento(s)`);
  }

  console.log('\n✓ Restaurado. Ejecuta `npm run db:init` para asegurar los índices.');
}

main()
  .catch((error: unknown) => {
    console.error('\n✗ Fallo al restaurar:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeMongoClient);
