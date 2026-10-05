# Bug Report

## Summary

Area: database
Total detected: 4
Confirmed: 4
Probable: 0

Fixed in follow-up: DB-001 (preflight de importación). Los snapshots inválidos no se corrigieron automáticamente; ahora se rechazan antes de conectar o escribir. DB-002, DB-003 y DB-004 quedan fuera de esta corrección.

Scope: `database/*.json`, schemas e índices de `src/*/schemas/*.schema.ts`, `scripts/db-import.js`, `scripts/db-export.js`, inspección estática de `scripts/db-seed.js` y almacenamiento del servicio MongoDB en `docker-compose.yml`. Consultas consumidoras de periodos, matrículas y planes de evaluación se usaron únicamente para confirmar incompatibilidades con datos persistidos. Revisión obtenida durante el análisis: `1988a0daf4badac52e6be5785b6c1d79f1422689`, con modificaciones locales preexistentes. No se analizó frontend ni se corrigieron bugs backend.

Checks:
- Cwd de todos los comandos: `C:\PrimerParcial\BackendProyecto1`.
- `git rev-parse --is-inside-work-tree`: salida 0, true. `git rev-parse --show-toplevel`: salida 0, raíz indicada. `git rev-parse HEAD`: salida 0, revisión indicada.
- `node -r ts-node/register`, JavaScript inline por stdin desde here-string PowerShell: salida 0. EJSON.parse de las 13 colecciones locales, creación de modelos Mongoose desconectados y `new Model(doc).validate()` de 1542 documentos. Diez documentos incompatibles con el schema. Se leyeron declaraciones de índices, sin construir índices ni conectar a DB.
- Segundo diagnóstico inline con `node -r ts-node/register`: salida 0. Comparación en memoria de claves únicas y relaciones/copias entre colecciones. Detectó duplicados, referencias inexistentes, copias de materia/periodo incompatibles, una nota vinculada a otro grupo, dos contadores de cupos incorrectos y un plan de 110%. Solo se imprimieron campos técnicos, posiciones de documentos y conteos; no nombres, correos, hashes ni mensajes personales.
- Diagnóstico inline con `node`: salida 0. Comparación de los duplicados confirmó que tienen `_id` distintos: el conflicto es del índice de negocio, no del identificador primario.
- Diagnóstico inline con `node`: salida 0. Ejecución de `scripts/db-export.js` en VM con require limitado a dependencias simuladas, MongoClient simulado y fs sustituido por un Map en memoria. Exportación 1: users+classrooms. Exportación 2: solo users. Resultado: classrooms.json permanece. Ninguna escritura llegó al filesystem real.
- No se ejecutaron `db:import`, `db:seed`, `db:export` real, migraciones ni consultas a MongoDB. No se inició Docker ni se alteraron contenedores. Build/lint/suite global omitidos: no aportan validación específica de estos datos y pueden escribir o ejecutar preparación de servicios. No se instalaron dependencias.

Limitations:
- No existe `AI_CONTEXT.md`; área ubicada con directorios y manifiesto raíz. No se creó contexto.
- No existía reporte database previo. Este reporte no modifica ni renumera `BUG_REPORT_BACKEND.md`.
- No se inspeccionaron datos de una instancia real, índices efectivamente instalados, validadores MongoDB de colección ni volúmenes existentes. Los hallazgos corresponden al contrato y a los snapshots locales, no prueban que una DB desplegada ya esté corrupta.
- La validación Mongoose offline usa casting y valida documentos, no simula restricciones únicas del servidor. Los duplicados se verificaron por separado contra las declaraciones de índices.
- Los múltiples datos inconsistentes de DB-001 se agrupan bajo la causa de importación sin preflight; no se cuentan como diez bugs ni se atribuyen sin evidencia al generador de seed.
- DB-002 tiene un disparador demostrado en los snapshots; el fallo E11000 de una importación real depende de que estén instalados los índices únicos declarados. No se ejecutó esa operación destructiva. La ausencia de atomicidad es concluyente en el código.
- Estado inicial preservado: `.env.example` eliminado; `.gitignore`, `BUG_REPORT_BACKEND.md`, `src/enrollments/enrollments.service.ts`, `src/evaluations/evaluations.controller.ts`, `src/groups/dto/group.dto.ts`, `src/groups/groups.service.ts` y `src/users/users.controller.ts` modificados; `.env copy.example` y tests no rastreados. Durante el análisis apareció además `src/groups/groups-reactivation.spec.ts`; no fue creado ni modificado por este análisis.
- La comprobación final mostró HEAD=`004fb0f60bee2eee4c470ba7035d9a048ea8478a` y solo `BUG_REPORT_DATABASE.md` no rastreado: otro proceso/usuario consolidó cambios durante esta ejecución. Este análisis no realizó commits ni limpió el árbol. No se revalidó la revisión final; los hallazgos y posiciones corresponden a los archivos leídos durante los diagnósticos.
- No se leyó `.env` ni se publicaron secretos o datos personales. La única escritura de esta ejecución es `BUG_REPORT_DATABASE.md`. Cobertura acotada, no auditoría completa.

## Recommended Order

1. DB-003 — Asegurar almacenamiento estable antes de recrear el contenedor; no recrearlo todavía para probar la corrección.
2. DB-001 — Rechazar snapshots incompatibles antes de cualquier escritura.
3. DB-002 — Hacer segura la restauración ante fallos; complementa el preflight, no lo sustituye.
4. DB-004 — Evitar que una exportación posterior conserve colecciones obsoletas; volver a validar cualquier backup antes de importarlo.

DB-001 y DB-002 afectan `scripts/db-import.js` y conviene asignarlos al mismo responsable. No tienen una dependencia obligatoria de causa raíz: preflight y atomicidad resuelven problemas diferentes. DB-003 y DB-004 pueden trabajarse en paralelo con ellos. Los bugs backend citados como consumidores no deben corregirse desde este análisis database.

## Bugs

### DB-001

Severity: high

Status: confirmed

Resolution: FIXED — `scripts/db-import.js` lee y valida todos los snapshots antes de cargar entorno/conectar a MongoDB. `scripts/db-validate.js` reutiliza los schemas reales, valida referencias (incluidos subdocumentos), copias de materia/periodo, pertenencia de notas, cupos y límites del plan. Se inserta el documento normalizado que pasó la validación, no el objeto original sin casting. Errores por archivo/posición/campo, sin mostrar valores personales. No se fabricaron datos ni se alteraron los snapshots.

Follow-up validation: comprobación focalizada inline con `node`, cwd backend. El primer intento detectó metadata enum incompatible con carga transpileOnly; se corrigió usando ts-node/register y se repitió únicamente la misma comprobación, salida 0. Confirmó rechazo de snapshots actuales antes de conectar (contador de conexiones=0), rechazo de inconsistencias entre colecciones y aceptación de un snapshot sintético válido. Cero escrituras DB; no se ejecutaron suites globales. El importador aún no tiene rollback: DB-002 sigue pendiente.

Symptom:
Los snapshots locales contienen documentos que incumplen los contratos de schemas y las relaciones entre colecciones, pero `db:import` los entrega directamente al driver nativo. Si la instancia no tiene validadores propios que los rechacen, se persisten valores imposibles para la API: por ejemplo, no queda ningún periodo con estado exacto `abierto`, aparecen notas fuera de escala o no numéricas y referencias que no se pueden poblar.

Root cause:
El loop de `scripts/db-import.js` solo hace EJSON.parse y `db.collection(name).insertMany(docs)`. No valida el conjunto completo contra schemas Mongoose ni comprueba referencias/copias/contadores antes de escribir. Las reglas declaradas mediante `@Prop` no se ejecutan al insertar con MongoClient. Los snapshots actuales demuestran que confiar en su coherencia no es válido.

Evidence:
- `scripts/db-import.js:18-22`: importación directa por colección sin preflight de contrato ni integridad.
- `src/users/schemas/user.schema.ts:9-20`, `src/subjects/schemas/subject.schema.ts:15-16`, `src/periods/schemas/period.schema.ts:6-9,23-24`, `src/groups/schemas/group.schema.ts:10-16,21-22`, `src/grades/schemas/grade.schema.ts:17-18` y `src/notifications/schemas/notification.schema.ts:7-13,20-21`: restricciones incumplidas.
- Todos los archivos JSON inspeccionados están minificados en línea 1. Las posiciones siguientes son ordinales **1-based dentro del arreglo**, no líneas ni IDs de personas.

| Snapshot | Posición | Incompatibilidad comprobada offline |
| --- | --- | --- |
| `database/users.json` | 1 | name vacío tras trim; falla required |
| `database/users.json` | 89 | role=`Docente`, distinto del enum admitido |
| `database/subjects.json` | 46 | credits=0; mínimo declarado 1 |
| `database/periods.json` | 98 | status=`Abierto`, no `abierto` |
| `database/groups.json` | 4 | schedule.0.day fuera del enum |
| `database/grades.json` | 242 y 247 | value=5.7; máximo declarado 5 |
| `database/grades.json` | 265 | value=`4,2`; falla conversión a Number |
| `database/notifications.json` | 12 | type=`aviso_urgente`, fuera del enum |
| `database/notifications.json` | 21 | createdAt no se convierte a Date válido |

- Validación offline: 13 colecciones, 1542 documentos, 10 documentos inválidos. Distribución de periodos: 97 `cerrado`, 1 `Abierto`, 2 `planificado`, **0 `abierto`**. `src/periods/periods.service.ts:42-45` consulta exactamente PeriodStatus.Open; la incompatibilidad no es meramente cosmética.
- Integridad en memoria: `database/students.json` posición 46 apunta a un program inexistente; `database/faculties.json` posición 10 apunta a un dean inexistente en teachers.
- `database/enrollments.json` posición 71 tiene subject distinto al de su group; posición 80 tiene period distinto al de su group. `src/enrollments/schemas/enrollment.schema.ts:25-30` documenta que son copias usadas en consultas.
- `database/grades.json` posición 248 relaciona una matrícula con una evaluación de otro grupo.
- `database/groups.json` posiciones 4 y 8 tienen enrolled=35 y 42 frente a 9 y 10 matrículas no canceladas. El plan del grupo en posición 4 suma 110%. Son inconsistencias del snapshot, sin afirmar que su origen sea BE-015 u otro defecto backend.

Files involved:
- `scripts/db-import.js`
- `database/users.json`
- `database/subjects.json`
- `database/periods.json`
- `database/groups.json`
- `database/grades.json`
- `database/notifications.json`
- `database/students.json`
- `database/faculties.json`
- `database/enrollments.json`
- `database/evaluations.json`
- `src/*/schemas/*.schema.ts` (contratos del preflight)

Suggested fix:
Añadir un preflight offline de **todos** los archivos antes de conectar/escribir: tipos y enums, required/rangos, referencias existentes, coherencia de campos copiados, pertenencia de notas al grupo, contadores y planes. Rechazar con ubicación técnica del documento y error sanitizado, sin cambios en DB. Corregir los snapshots mediante datos válidos y coherentes, no relajando los schemas ni fabricando IDs para silenciar la validación. Validadores de colección pueden añadir defensa, pero no sustituyen checks entre colecciones.

Validation after fix:
Desde el cwd indicado, `node -r ts-node/register` con lectura EJSON y modelos desconectados: snapshots corregidos deben dar cero errores de schema, referencias, copias y contadores; periodo actual exactamente `abierto` y planes completos consistentes. Prueba recomendada del preflight con fixtures inválidas y MongoClient/fs simulados: debe rechazar antes de connect/delete/insert y no mostrar datos personales. No ejecutar la importación real como validación inicial.

### DB-002

Severity: high

Status: confirmed

Symptom:
Una restauración puede vaciar/reemplazar colecciones y dejar la base parcialmente restaurada cuando falla insertMany. Los snapshots actuales contienen claves únicas repetidas, por lo que en una base con los índices declarados no pueden importarse íntegramente: el fallo ocurre después de eliminar los datos anteriores.

Root cause:
`scripts/db-import.js` ejecuta deleteMany({}) seguido de insertMany(docs), sin transacción, staging ni rollback, y procesa cada colección antes de haber preparado las restantes. Con insertMany ordenado por defecto, un conflicto único puede dejar también un prefijo insertado en la colección actual. El catch final solo informa el error y termina el proceso; no restaura los datos borrados.

Evidence:
- `scripts/db-import.js:18-24,27`: borrado previo, inserción y manejo de error sin recuperación; no session/withTransaction.
- `database/programs.json:1`: documentos 34 y 101 comparten code, con `_id` distintos. Declaración única confirmada por Schema.indexes() del modelo Program.
- `database/enrollments.json:1`: documentos 71 y 110 comparten student+group, con `_id` distintos.
- `src/enrollments/schemas/enrollment.schema.ts:40-41`: índice único student+group.
- Diagnóstico offline: dos claves únicas duplicadas, verificadas contra índices declarados. No se ejecutó MongoDB ni se afirmó observar E11000 en una instancia real.
- La condición de reproducción es explícita: instancia con esos índices, snapshot actual y ejecución de db:import. deleteMany se realiza antes del intento que incumple unique. La falta de atomicidad también permite pérdida parcial por otros fallos de inserción, aunque los documentos superen el preflight.

Files involved:
- `scripts/db-import.js`
- `database/programs.json`
- `database/enrollments.json`
- `src/programs/schemas/program.schema.ts` (índice único)
- `src/enrollments/schemas/enrollment.schema.ts` (índice único)

Suggested fix:
Detectar duplicados antes de escribir y diseñar una restauración que no destruya el estado anterior si falla una colección: staging verificado y publicación controlada, o transacción compatible con los índices/colecciones existentes y el replica set. Conservar un backup recuperable y cerrar la conexión en finally. No basta con omitir filas duplicadas ni con continuar tras el error, porque ocultaría una restauración incompleta.

Validation after fix:
Pruebas aisladas de importador con driver simulado: duplicado → cero deletes/inserts; fallo después de una inserción válida → estado previo conservado o rollback completo; éxito → todas las colecciones reemplazadas coherentemente. Validación real posterior únicamente en entorno desechable explícitamente autorizado, con índices únicos equivalentes y fallo inducido, nunca sobre la DB local de trabajo o producción.

### DB-003

Severity: high

Status: confirmed

Symptom:
Recrear el servicio MongoDB mediante el flujo disponible de Compose no garantiza recuperar los datos anteriores. El volumen nombrado mongo_data aparece declarado, pero no almacena `/data/db` del servicio; el contenedor nuevo puede arrancar con otro almacenamiento y una base vacía.

Root cause:
`docker-compose.yml` define `volumes.mongo_data` en la raíz, pero `services.mongo` carece de volumes/mounts. Un volumen no se monta por estar declarado. La persistencia queda en el almacenamiento del contenedor o en volúmenes anónimos de la imagen, sin asociación estable al volumen nombrado al recrear el servicio.

Evidence:
- `docker-compose.yml:1-18`: servicio MongoDB sin sección volumes.
- `docker-compose.yml:20-21`: mongo_data declarado sin uso.
- `package.json:18-19`: db:up levanta Compose y db:down elimina los contenedores del servicio.
- Evidencia estática concluyente de que mongo_data no se monta. No se ejecutó down/up, no se inspeccionaron volúmenes reales ni se eliminó ningún contenedor. No se afirma que bytes de un volumen anónimo anterior se borren necesariamente: el problema es no reanexarlos de forma estable al contenedor nuevo.

Files involved:
- `docker-compose.yml`
- `package.json` (flujo de operación documentado, no necesariamente requiere cambio)

Suggested fix:
Montar un volumen estable para `/data/db` del servicio MongoDB. Antes de cambiar/recrear el contenedor existente, identificar su almacenamiento actual y preparar una migración/backup autorizado; agregar un volumen vacío y reiniciar puede dejar los datos actuales fuera del nuevo mount. No ejecutar down ni asumir que los datos actuales ya están en mongo_data.

Validation after fix:
Inspección de configuración con `docker compose config --format json` y extracción del mount del servicio mongo: debe existir source=mongo_data y target=/data/db. Después, solo en un proyecto Compose desechable explícitamente autorizado, comprobar que una recreación conserva un documento sintético. No usar el contenedor de trabajo para esa prueba.

### DB-004

Severity: medium

Status: confirmed

Symptom:
Exportar dos veces al mismo directorio puede producir un backup que incluye colecciones eliminadas después de la primera exportación. Al importar ese directorio, la colección obsoleta se vuelve a crear con sus datos viejos, aunque ya no existía en la base al generar el backup más reciente.

Root cause:
`scripts/db-export.js` crea/reutiliza database y sobrescribe únicamente archivos correspondientes a listCollections actual. No genera un directorio nuevo ni retira/excluye archivos obsoletos. `scripts/db-import.js` considera todos los JSON del directorio, sin un manifiesto que limite qué archivos pertenecen a la exportación actual.

Evidence:
- `scripts/db-export.js:9,14-19`: salida fija, mkdir recursive y escrituras solo de colecciones actuales.
- `scripts/db-import.js:9,12,18-22`: importa todos los JSON del directorio.
- Diagnóstico VM con fuente real de exportador y dependencias simuladas: primera exportación users+classrooms; segunda exportación solo users; classrooms.json seguía en el Map de salida. Todos los writes fueron interceptados en memoria y no se contactó DB.
- El diagnóstico demuestra el escenario funcional, no afirma que un archivo concreto del backup local actual ya sea obsoleto.

Files involved:
- `scripts/db-export.js`
- `scripts/db-import.js`

Suggested fix:
Crear cada exportación en un destino nuevo/versionado o escribir un manifiesto completo y hacer que importador consuma exclusivamente ese manifiesto. Publicar el backup solo al terminar correctamente. Evitar un borrado indiscriminado de database, porque contiene archivos versionados/trabajo del usuario y una exportación fallida no debe destruir el backup anterior.

Validation after fix:
Desde el cwd indicado, prueba `node` en VM con fs/driver simulados: exportación A contiene users+classrooms; exportación B contiene solo users; importar B no debe seleccionar classrooms. Simular fallo a mitad de exportación: el backup anterior debe seguir disponible y B no debe anunciarse como completo. Ninguna validación inicial requiere escritura real ni MongoDB.
