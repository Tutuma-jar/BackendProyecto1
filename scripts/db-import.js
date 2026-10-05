// Importa los archivos de database/*.json a la base indicada en MONGODB_URI
// Uso: npm run db:import          (reemplaza el contenido de cada coleccion)
// Requiere MongoDB con transacciones (replica set o cluster sharded).
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');
const fs = require('fs');
const path = require('path');
const { validateSnapshots } = require('./db-validate');

const IN_DIR = path.join(__dirname, '..', 'database');

async function importDatabase(inDir = IN_DIR) {
  const files = fs.existsSync(inDir) ? fs.readdirSync(inDir).filter((f) => f.endsWith('.json')) : [];
  if (files.length === 0) throw new Error('No hay archivos .json en ' + inDir);
  const snapshots = Object.create(null);
  for (const file of files) {
    const name = path.basename(file, '.json');
    try {
      snapshots[name] = EJSON.parse(fs.readFileSync(path.join(inDir, file), 'utf8'));
    } catch {
      throw new Error('Snapshot JSON/EJSON invalido');
    }
  }
  const validated = await validateSnapshots(snapshots);

  require('dotenv').config();
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  try {
    const db = client.db();
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const [name, docs] of Object.entries(validated)) {
          await db.collection(name).deleteMany({}, { session });
          if (docs.length > 0) await db.collection(name).insertMany(docs, { session });
        }
      });
    } finally {
      await session.endSession();
    }
    for (const [name, docs] of Object.entries(validated)) {
      console.log(name.padEnd(12), docs.length, 'documentos importados');
    }
    console.log('Importacion terminada en la base:', db.databaseName);
  } finally {
    await client.close();
  }
}

module.exports = { importDatabase };
if (require.main === module) {
  importDatabase().catch((e) => { console.error(e.message); process.exit(1); });
}
