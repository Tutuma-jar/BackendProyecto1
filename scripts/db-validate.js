// Preflight offline: usa los mismos schemas que la API, sin conectar a MongoDB.
require('reflect-metadata');
require('ts-node/register');
const { Mongoose } = require('mongoose');

const NAMES = {
  users: 'User', students: 'Student', teachers: 'Teacher', faculties: 'Faculty',
  programs: 'Program', subjects: 'Subject', classrooms: 'Classroom', periods: 'Period',
  groups: 'Group', enrollments: 'Enrollment', evaluations: 'Evaluation',
  grades: 'Grade', notifications: 'Notification',
};

async function validateSnapshots(snapshots) {
  const mongoose = new Mongoose();
  const data = {}, schemas = {}, errors = [];
  const fail = (collection, index, field, reason) => {
    errors.push(`${collection}.json documento ${index + 1}: ${field} ${reason}`);
  };

  for (const [collection, docs] of Object.entries(snapshots)) {
    if (!Object.hasOwn(NAMES, collection)) throw new Error('Snapshot de coleccion no soportada');
    const name = NAMES[collection];
    if (!Array.isArray(docs)) throw new Error(`${collection}.json debe contener un arreglo`);
    const schema = require(`../src/${collection}/schemas/${name.toLowerCase()}.schema`)[`${name}Schema`];
    schemas[collection] = schema;
    const Model = mongoose.model(name, schema);
    data[collection] = [];
    for (const [index, raw] of docs.entries()) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw._id) {
        fail(collection, index, '_id', 'documento o identificador ausente');
        continue;
      }
      const doc = new Model(raw);
      try {
        await doc.validate();
        // Se importa lo validado/casteado, no el objeto original del driver.
        data[collection].push(doc.toObject({ depopulate: true, virtuals: false }));
      } catch (error) {
        if (!error.errors) throw new Error('No se pudo validar el snapshot');
        for (const field of Object.keys(error.errors)) fail(collection, index, field, 'no cumple el schema');
      }
    }
  }
  // No evaluar relaciones sobre documentos que ya fallaron el schema.
  if (errors.length) throw new Error(`Preflight rechazado:\n${errors.join('\n')}`);

  for (const [collection, docs] of Object.entries(data)) {
    const uniqueIndexes = [[{ _id: 1 }, { unique: true }], ...schemas[collection].indexes()]
      .filter(([, options]) => options.unique);
    for (const [fields] of uniqueIndexes) {
      const keys = Object.keys(fields), seen = new Map();
      docs.forEach((doc, index) => {
        const key = JSON.stringify(keys.map(field => doc[field] ?? null));
        if (seen.has(key)) {
          fail(collection, index, keys.join('+'), `clave unica duplicada con documento ${seen.get(key) + 1}`);
        } else {
          seen.set(key, index);
        }
      });
    }
  }
  if (errors.length) throw new Error(`Preflight rechazado:\n${errors.join('\n')}`);

  const byName = Object.fromEntries(Object.entries(NAMES).map(([collection, name]) => [name, collection]));
  const maps = Object.fromEntries(Object.entries(data).map(([collection, docs]) =>
    [collection, new Map(docs.map(doc => [String(doc._id), doc]))]));
  const get = (collection, id) => maps[collection]?.get(String(id));

  function checkReferences(schema, doc, collection, index, prefix = '') {
    schema.eachPath((field, type) => {
      const value = doc[field];
      if (value == null) return;
      const location = prefix + field;
      if (type.schema) {
        const children = Array.isArray(value) ? value : [value];
        children.forEach((child, i) => checkReferences(type.schema, child, collection, index, `${location}.${i}.`));
        return;
      }
      const ref = type.options.ref ?? type.caster?.options.ref;
      if (!ref) return;
      const target = byName[ref];
      const values = Array.isArray(value) ? value : [value];
      if (values.some(id => !get(target, id))) fail(collection, index, location, 'referencia inexistente en el snapshot');
    });
  }

  for (const [collection, docs] of Object.entries(data)) {
    docs.forEach((doc, index) => checkReferences(schemas[collection], doc, collection, index));
  }

  const enrolled = new Map(), weights = new Map(), finalized = new Set();
  for (const [index, doc] of (data.enrollments ?? []).entries()) {
    const group = get('groups', doc.group);
    if (group) {
      for (const field of ['subject', 'period']) {
        if (String(doc[field]) !== String(group[field])) fail('enrollments', index, field, 'no coincide con el grupo');
      }
    }
    const key = String(doc.group);
    if (doc.status !== 'cancelada') enrolled.set(key, (enrolled.get(key) ?? 0) + 1);
    if (doc.status === 'aprobada' || doc.status === 'reprobada') finalized.add(key);
  }
  for (const [index, doc] of (data.grades ?? []).entries()) {
    const enrollment = get('enrollments', doc.enrollment), evaluation = get('evaluations', doc.evaluation);
    if (enrollment && evaluation && String(enrollment.group) !== String(evaluation.group)) {
      fail('grades', index, 'evaluation', 'no pertenece al grupo de la matricula');
    }
  }
  for (const doc of data.evaluations ?? []) {
    const key = String(doc.group);
    weights.set(key, (weights.get(key) ?? 0) + doc.weight);
  }
  for (const [index, doc] of (data.groups ?? []).entries()) {
    const key = String(doc._id), total = weights.get(key) ?? 0;
    if (doc.enrolled !== (enrolled.get(key) ?? 0)) fail('groups', index, 'enrolled', 'no coincide con las matriculas vigentes');
    if (doc.enrolled > doc.capacity) fail('groups', index, 'enrolled', 'supera capacity');
    if (total > 100 || (finalized.has(key) && Math.round(total * 100) !== 10000)) {
      fail('groups', index, 'evaluations.weight', 'plan incompatible con el limite de 100% o matriculas finalizadas');
    }
  }
  if (errors.length) throw new Error(`Preflight rechazado:\n${errors.join('\n')}`);
  return data;
}

module.exports = { validateSnapshots };
