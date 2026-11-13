// Export collections as Extended JSON so BSON values remain restorable.
import dotenv from 'dotenv';
import { EJSON } from 'bson';
import { MongoClient } from 'mongodb';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(projectRoot, '.env') });
const databaseName = process.env.MONGODB_DATABASE || 'startnew';
const safeDatabaseName = databaseName.replace(/[^A-Za-z0-9_-]/g, '_');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDirectory = path.join(projectRoot, 'database-dump', `${safeDatabaseName}-${timestamp}`);
const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');

try {
  await client.connect();
  const database = client.db(databaseName);
  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  await mkdir(outputDirectory, { recursive: true });

  const manifest = {
    database: databaseName,
    exportedAt: new Date().toISOString(),
    collections: [],
  };

  for (const { name } of collections) {
    const collection = database.collection(name);
    const documents = await collection.find({}).toArray();
    const filename = `${name.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
    await writeFile(
      path.join(outputDirectory, filename),
      `${EJSON.stringify(documents, null, 2, { relaxed: false })}\n`,
      'utf8'
    );
    manifest.collections.push({ name, filename, documentCount: documents.length });
  }

  await writeFile(
    path.join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  console.log(
    `Exported ${manifest.collections.length} collections to ${path.relative(projectRoot, outputDirectory)}.`
  );
} finally {
  await client.close();
}
