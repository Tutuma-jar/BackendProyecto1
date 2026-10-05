# Bug Report

## Summary

Area: backend
Total detected: 13
Confirmed: 13
Probable: 0
Fixed in follow-up: 3 (BE-011, BE-012, BE-013)
Pending from original analysis: 10

Scope: análisis original del backend NestJS en `src`, revisión `0a7acc99219a4dc2c623bdc94539749bc02ef206`. Inspección acotada a configuración de autenticación, usuarios, grupos y evaluaciones, sus referencias directas y contratos de rutas. Ampliación autorizada por el usuario para BE-011 a BE-013: configuración de puertos y contrato HTTP con el proyecto hermano `../proyectoFrontend1` (repositorio Git independiente).

Checks:
- Cwd de todos los diagnósticos: `C:\PrimerParcial\BackendProyecto1`.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json`: salida 0, sin errores ni archivos emitidos.
- Diagnósticos inline mediante PowerShell `@'…'@ | node -r ts-node/register`: salida 0 en las reproducciones concluyentes. No se crearon scripts ni tests. Se usaron assert, dependencias instaladas, objetos sintéticos y mocks de modelos/servicios.
- Rutas: aplicación temporal `@nestjs/testing` con UsersController, GroupsController y EvaluationsController, prefijo `/api/v1`, Supertest y servicios simulados; cerrada en finally. Reprodujo BE-005 a BE-009 sin leer/escribir DB.
- Servicios/auth: factory real de JwtModule con configuración sintética; UsersService.changePassword con documento simulado; GroupsService.assertCanManage con docente no propietario; EvaluationsService.update con periodo cerrado simulado. Reprodujo BE-002 a BE-004 y BE-010.
- Autorización: metadata de AuthModule y búsqueda de `RolesGuard|APP_GUARD|UseGuards|useGlobalGuards` limitada a `src/**/*.ts`; confirmó BE-001 por evidencia estática y metadata.
- Build omitido: emite `dist`. Lint de package.json omitido: incluye `--fix`; no hay configuración ESLint raíz comprobada. Suite Jest omitida: seguridad/configuración de tests no verificada. No se ejecutaron instalación, seeds, importaciones ni migraciones.
- Seguimiento BE-011 a BE-013: typecheck backend repetido con el mismo comando, salida 0. Diagnóstico inline `@'…'@ | node`, cwd backend, salida 0: transpila los archivos modificados con TypeScript instalado y ejecuta sus exports/arranque en VM con Nest/Next/fetch simulados. Comprueba listen(3000), frontend 3001 y destinos completos de login, proxy (incluye query string) y apiGet bajo `/api/v1`. Comprueba BACKEND_URL=localhost:3000 en plantilla y configuración local sin imprimir secretos.

Limitations:
- No existe `AI_CONTEXT.md` en la raíz Git del backend; se ubicó el área mediante manifiesto y configuración raíz. No se creó ni actualizó contexto.
- No se realizaron solicitudes al servidor persistente, consultas DB ni operaciones de negocio reales. Las pruebas aisladas demuestran los contratos indicados, no el funcionamiento integral de la aplicación.
- La aplicación temporal de rutas no incluye guards globales ni ValidationPipe: aísla precedencia de rutas, códigos de éxito y prefijo del controlador; no demuestra autorización ni validación de DTOs.
- Análisis original limitado a 10 causas seleccionadas; no es una auditoría completa ni afirma ausencia de otros errores. El seguimiento agrega 3 desajustes de integración solicitados expresamente; no analiza datos de DB ni schemas como área independiente.
- Se preservaron los cambios preexistentes: eliminación local de `.env.example` y archivo no rastreado `.env copy.example`; no se leyeron sus contenidos ni archivos de entorno.
- Seguimiento: del .env backend se extrajeron solo PORT/APP_PORT numéricos; no se mostraron ni modificaron secretos. Frontend no tenía `.env.local` al inspeccionarlo: el valor 3005 estaba en `.env.example`. Se creó `.env.local` con BACKEND_URL=localhost:3000; debe quedar fuera de Git.
- Dependencias frontend no instaladas: se omitió typecheck/build integral de Next.js, sin instalar paquetes. La validación VM comprueba destinos reales construidos por el código, no un login completo ni disponibilidad de servicios.

## Recommended Order

1. BE-001 — Activar autorización por roles antes de validar permisos de endpoints.
2. BE-002 — Restringir la gestión de grupos a su docente propietario; independiente del guard de roles.
3. BE-003 — Corregir unidades del vencimiento JWT para disponer de sesiones utilizables.
4. BE-004 — Persistir cambios de contraseña e invalidación de sesiones.
5. BE-010 — Proteger el plan de evaluación de periodos cerrados.
6. BE-005 — Recuperar GET del perfil propio.
7. BE-006 — Recuperar GET de grupos propios del docente.
8. BE-007 — Restaurar el contrato de rutas de evaluaciones antes de probar su creación por URL canónica.
9. BE-008 — Devolver éxito HTTP al crear usuarios.
10. BE-009 — Devolver éxito HTTP al crear evaluaciones; para validar la URL canónica depende de BE-007.

BE-011, BE-012 y BE-013: corregidos en el seguimiento; no requieren una nueva corrección. Reiniciar los procesos existentes para que carguen la configuración y el código nuevos.

## Bugs

### BE-001

Severity: high

Status: confirmed

Symptom:
Los endpoints decorados con Roles no aplican esa restricción. Un usuario autenticado puede atravesar la capa de autorización de rutas administrativas; las comprobaciones adicionales de cada servicio pueden limitar operaciones concretas, pero no sustituyen el guard ausente.

Root cause:
AuthModule registra globalmente JwtAuthGuard, pero nunca registra RolesGuard. JwtAuthGuard solo verifica autenticación y Public; los metadatos Roles no son aplicados por ningún guard activo.

Evidence:
- `src/auth/auth.module.ts:29-34`: único APP_GUARD, JwtAuthGuard.
- `src/auth/guards/jwt-auth.guard.ts:13-19`: consulta Public y delega a Passport; no consulta Roles.
- `src/auth/guards/roles.guard.ts:12-23`: implementación disponible pero sin registro.
- `src/users/users.controller.ts:15-27`: rutas administrativas con Roles(Admin).
- Búsqueda acotada en `src/**/*.ts`: RolesGuard solo aparece en su declaración; sin UseGuards/useGlobalGuards. Diagnóstico de metadata: AuthModule registra únicamente JwtAuthGuard.

Files involved:
- `src/auth/auth.module.ts`
- `src/auth/guards/roles.guard.ts`
- `src/auth/guards/jwt-auth.guard.ts`
- `src/users/users.controller.ts`

Suggested fix:
Registrar RolesGuard después de JwtAuthGuard para que evalúe el usuario autenticado y los metadatos de método/clase, conservando el acceso de rutas públicas y de rutas sin restricción de roles.

Validation after fix:
En el cwd indicado, prueba aislada con `node -r ts-node/register` y @nestjs/testing: comprobar guards globales y ejecutar RolesGuard con Reflector y contexto simulado. Estudiante/docente en ruta Roles(Admin): 403; admin: permitido. Comprobar overrides de método, ruta pública y ruta sin Roles, sin DB ni creaciones reales.

### BE-002

Severity: high

Status: confirmed

Symptom:
Un docente puede pasar assertCanManage para un grupo de otro docente y gestionar su plan de evaluación, aunque el contrato limita docentes a sus propios grupos.

Root cause:
GroupsService.assertCanManage ejecuta la comprobación del docente propietario solo cuando user.role es Estudiante, no cuando es Docente. Los docentes retornan el grupo sin verificar su titularidad.

Evidence:
- `src/groups/groups.service.ts:95-103`: contrato explícito y condición `user.role === Role.Estudiante`.
- `src/evaluations/evaluations.service.ts:22-24,47-49`: create/update delegan autorización de grupo a assertCanManage.
- Diagnóstico inline: modelo simulado devuelve grupo de teacher A; usuario Docente asociado a teacher B. assertCanManage retorna el grupo y findByUserId se ejecuta 0 veces.

Files involved:
- `src/groups/groups.service.ts`
- `src/evaluations/evaluations.service.ts`

Suggested fix:
Aplicar la comparación de propiedad a Docente; permitir Admin y rechazar roles que no pueden gestionar grupos. No confiar exclusivamente en RolesGuard: no verifica propiedad.

Validation after fix:
Con `node -r ts-node/register` en el cwd indicado y mocks: docente propietario permitido, docente ajeno obtiene ForbiddenException/403, administrador permitido y estudiante rechazado. No ejecutar escrituras reales.

### BE-003

Severity: high

Status: confirmed

Symptom:
Una configuración JWT_EXPIRES_IN_SECONDS=3600 produce un token válido durante solo 3 segundos, no una hora. Con valores menores que 1000 segundos puede vencer inmediatamente.

Root cause:
La factory de JwtModule convierte el número de segundos a String sin unidad. jsonwebtoken interpreta una cadena numérica como milisegundos; el cast StringValue no convierte unidades en runtime.

Evidence:
- `src/auth/auth.module.ts:20-22`: expiresIn recibe String(config.getOrThrow(...)).
- `src/config/env.validation.ts:27-29`: valor numérico en segundos, mínimo 60 y predeterminado 3600.
- Diagnóstico ejecutó la factory real con ConfigService simulado y JwtService: entrada 3600; token decodificado `exp - iat = 3`.

Files involved:
- `src/auth/auth.module.ts`
- `src/config/env.validation.ts`

Suggested fix:
Entregar un número de segundos a expiresIn o una cadena con unidad explícita compatible, conservando JWT_EXPIRES_IN_SECONDS y su validación.

Validation after fix:
En el cwd indicado, `node -r ts-node/register`: ejecutar la factory real con valores sintéticos 60 y 3600, firmar tokens en memoria y comprobar `exp - iat` igual a cada valor. No usar secretos locales ni mostrar tokens.

### BE-004

Severity: high

Status: confirmed

Symptom:
El cambio de contraseña devuelve un token nuevo como si hubiera funcionado, pero la contraseña guardada permanece igual y passwordChangedAt no se persiste para invalidar sesiones anteriores.

Root cause:
UsersService.changePassword asigna passwordHash y passwordChangedAt al documento Mongoose y retorna user sin llamar save. AuthService solo firma el token del documento devuelto; no realiza la persistencia faltante.

Evidence:
- `src/users/users.service.ts:123-135`: asignaciones y return sin save.
- `src/auth/auth.service.ts:29-33,40-42`: firma del token después de changePassword; sin guardado.
- `src/auth/auth.controller.ts:29-34`: contrato del cambio de contraseña.
- Diagnóstico con bcrypt real y documento simulado: contraseña actual válida, nueva distinta; método resuelve y contador de save queda en 0.

Files involved:
- `src/users/users.service.ts`
- `src/auth/auth.service.ts`
- `src/auth/auth.controller.ts`

Suggested fix:
Guardar el documento modificado antes de devolverlo/emitir el nuevo token, preservando las validaciones de contraseña actual y nueva distinta.

Validation after fix:
`node -r ts-node/register` en el cwd indicado: documento/modelo en memoria con spy de save; caso válido debe guardar una vez y hacerlo antes de firmar. Verificar hash nuevo, passwordChangedAt y ausencia de save/token cuando la clave actual es incorrecta o la nueva coincide. La aceptación/revocación JWT debe validarse separadamente; este cambio por sí solo no demuestra todo su contrato temporal.

### BE-005

Severity: medium

Status: confirmed

Symptom:
GET `/api/v1/users/me` se interpreta como búsqueda por ID y falla con 400 ID invalido, en vez de devolver el perfil propio. Con autorización por roles activa también puede seleccionarse el handler administrativo equivocado.

Root cause:
UsersController declara Get(':id') antes de Get('me'); Express selecciona primero la ruta dinámica. ParseObjectIdPipe rechaza el literal me.

Evidence:
- `src/users/users.controller.ts:41-52`: findOne precede a me, contra el comentario del propio controlador.
- `src/common/pipes/parse-object-id.pipe.ts:5-8`: me no es un ObjectId válido.
- Supertest sobre controladores reales y servicios simulados: GET `/api/v1/users/me` → 400, message ID invalido.

Files involved:
- `src/users/users.controller.ts`
- `src/common/pipes/parse-object-id.pipe.ts`

Suggested fix:
Registrar la ruta GET fija me antes de GET :id, manteniendo sus roles y contrato de perfil propio.

Validation after fix:
Aplicación temporal @nestjs/testing + Supertest mediante `node -r ts-node/register` en el cwd indicado: request.user sintético; GET me debe invocar findOne con user.id y responder 200. GET de un ObjectId válido debe seguir invocando findOne con el parámetro; ID inválido debe seguir devolviendo 400.

### BE-006

Severity: medium

Status: confirmed

Symptom:
GET `/api/v1/groups/mine` falla con 400 ID invalido, en vez de listar los grupos del docente autenticado.

Root cause:
GroupsController declara Get(':id') antes de Get('mine'); la ruta dinámica captura mine y aplica ParseObjectIdPipe antes de alcanzar el handler mine.

Evidence:
- `src/groups/groups.controller.ts:31-43`: ruta dinámica antes de la fija, contrario al comentario.
- `src/common/pipes/parse-object-id.pipe.ts:5-8`: rechazo del literal mine.
- Supertest con controladores reales y mocks: GET `/api/v1/groups/mine` → 400 ID invalido.

Files involved:
- `src/groups/groups.controller.ts`
- `src/common/pipes/parse-object-id.pipe.ts`

Suggested fix:
Registrar GET mine antes de GET :id y preservar el filtro de grupos del docente y su metadata de rol.

Validation after fix:
En el cwd indicado, diagnóstico temporal con `node -r ts-node/register`, @nestjs/testing y Supertest: usuario Docente simulado; GET mine invoca findMine con user.id/query y devuelve 200; GET de ID válido conserva findOne y un ID inválido conserva 400.

### BE-007

Severity: medium

Status: confirmed

Symptom:
GET/POST/PATCH de evaluaciones se publican bajo `/api/v1/evaluationslalala`, mientras `/api/v1/evaluations` devuelve 404 para listado/creación. El contrato del recurso queda inconsistente con su ruta DELETE.

Root cause:
EvaluationsController tiene el prefijo literal evaluationslalala en vez de evaluations. No hay alias canónico en este controlador.

Evidence:
- `src/evaluations/evaluations.controller.ts:12-15,20-41`: prefijo incorrecto y métodos del recurso.
- `src/deletions/deletions.controller.ts:23-27`: DELETE usa evaluations/:id.
- Supertest: GET `/api/v1/evaluations` → 404; GET `/api/v1/evaluationslalala` → 200 con servicio simulado.

Files involved:
- `src/evaluations/evaluations.controller.ts`
- `src/deletions/deletions.controller.ts`

Suggested fix:
Corregir el prefijo del controlador a evaluations para que los métodos del recurso compartan el contrato canónico; no cambiar el DELETE ya canónico.

Validation after fix:
Con `node -r ts-node/register` en el cwd indicado, aplicación temporal de controladores y Supertest: GET canónico 200, PATCH con ObjectId válido llega a update y POST llega a create (su status tiene el bug BE-009 independiente). Verificar que DELETE conserva la ruta canónica sin ejecutar eliminaciones reales.

### BE-008

Severity: medium

Status: confirmed

Symptom:
POST de usuarios ejecuta correctamente create y devuelve el usuario creado, pero responde HTTP 400; el consumidor lo interpreta como fracaso aunque la operación haya tenido éxito.

Root cause:
UsersController.create tiene HttpCode(400), que aplica a su respuesta de éxito, no únicamente a errores de validación.

Evidence:
- `src/users/users.controller.ts:26-31`: HttpCode(400) y respuesta tras await create.
- Diagnóstico Supertest: mock de create invocado exactamente una vez y resuelto; HTTP status 400 con cuerpo de usuario generado.

Files involved:
- `src/users/users.controller.ts`

Suggested fix:
Eliminar el override de error o usar el código de éxito de creación correspondiente, normalmente 201. Mantener excepciones reales y validación.

Validation after fix:
En el cwd indicado, @nestjs/testing/Supertest mediante `node -r ts-node/register`: servicio simulado exitoso debe producir 201 y cuerpo esperado. Un DTO inválido con ValidationPipe debe devolver 400 sin invocar create; conflicto simulado debe conservar 409. No crear usuarios reales.

### BE-009

Severity: medium

Status: confirmed

Symptom:
La creación exitosa de una evaluación responde HTTP 400. El cliente la presenta como error pese al éxito del servicio.

Root cause:
EvaluationsController.create configura HttpCode(HttpStatus.BAD_REQUEST), forzando 400 cuando el servicio resuelve correctamente.

Evidence:
- `src/evaluations/evaluations.controller.ts:18-23`: código de error explícito para la respuesta normal.
- Supertest en la ruta actualmente registrada: POST `/api/v1/evaluationslalala` → 400, con create simulado invocado una vez y resuelto.

Files involved:
- `src/evaluations/evaluations.controller.ts`

Suggested fix:
Restaurar el código de éxito de creación, normalmente 201, sin ocultar excepciones del servicio. BE-007 es otro cambio independiente sobre el prefijo.

Validation after fix:
`node -r ts-node/register` en el cwd indicado con controlador real y mocks: creación resuelta debe responder 201; excepciones BadRequest/Conflict deben mantener 400/409. Usar la ruta vigente, o la canónica después de BE-007. No ejecutar writes reales.

### BE-010

Severity: high

Status: confirmed

Symptom:
Un administrador o docente autorizado puede editar el plan de evaluación de un grupo cuyo periodo está cerrado, incluido cambiar el porcentaje de una evaluación sin notas.

Root cause:
EvaluationsService.update comprueba autorización, notas existentes y suma de porcentajes, pero nunca consulta el estado del periodo. create sí rechaza periodos cerrados; GroupsService.assertCanManage tampoco verifica ese estado.

Evidence:
- `src/evaluations/evaluations.service.ts:22-27`: create prohíbe modificar el plan del periodo cerrado.
- `src/evaluations/evaluations.service.ts:47-58`: update termina en save sin consultar PeriodsService.
- `src/groups/groups.service.ts:96-109`: assertCanManage/findRaw no verifican estado de periodo.
- Diagnóstico inline con modelo simulado, sin notas y periodo Closed disponible en mock: weight 25 → 50, save ejecutado 1 vez, llamadas a periodsService.findOne = 0.

Files involved:
- `src/evaluations/evaluations.service.ts`
- `src/groups/groups.service.ts`

Suggested fix:
Consultar y validar el periodo del grupo antes de modificar/guardar el plan en update, aplicando la misma prohibición de periodo cerrado que create. Conservar controles de propiedad, notas y porcentajes.

Validation after fix:
En el cwd indicado, diagnóstico inline con `node -r ts-node/register` y mocks: periodo Closed debe rechazar cambios de name y weight con 400 y no llamar set/save. Periodo abierto permite modificación válida; peso con notas mantiene 409 y suma superior a 100 mantiene 400. No reabrir periodos ni escribir datos reales.

### BE-011

Severity: high

Status: confirmed

Resolution: FIXED — el arranque ahora usa PORT mediante ConfigService, coherente con env.validation.ts. No se modificó el puerto del frontend ni el secreto JWT.

Symptom:
Con PORT=3000 y sin APP_PORT, el backend intentaba escuchar en 3001, el mismo puerto que el frontend. Al ejecutar ambos, el segundo no puede ocupar el puerto.

Root cause:
src/main.ts leía process.env.APP_PORT con fallback 3001, mientras la configuración validada define PORT con fallback 3000. La variable PORT no controlaba listen.

Evidence:
- `src/main.ts:28` antes de la corrección: Number(process.env.APP_PORT ?? 3001).
- `src/config/env.validation.ts:14-17`: PORT numérico, predeterminado 3000.
- Inspección selectiva del .env local: PORT=3000 y sin APP_PORT; no se expusieron otros valores.
- `../proyectoFrontend1/package.json:6,8`: dev/start fijan 3001.
- Validación posterior: bootstrap real transpileado en VM, ConfigService simulado devuelve PORT=3000; listen recibe 3000. Typecheck backend: salida 0.

Files involved:
- `src/main.ts`
- `src/config/env.validation.ts`
- `../proyectoFrontend1/package.json` (contrato, sin modificar)

Suggested fix:
Aplicado: obtener PORT del ConfigService validado. Mantener frontend en 3001 y backend en 3000 por defecto; no mantener dos nombres de variable contradictorios.

Validation after fix:
Desde backend, `node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json` y diagnóstico VM mediante `node` por stdin: ConfigService PORT=3000 debe llegar a listen(3000), con prefijo api/v1 conservado. Para validación integral, reiniciar backend/frontend y comprobar listeners en 3000/3001; no realizada en este seguimiento.

### BE-012

Severity: high

Status: confirmed

Resolution: FIXED — plantilla frontend corregida a BACKEND_URL=http://localhost:3000 y archivo local creado con ese mismo valor, excluido del push.

Symptom:
Al configurar el frontend desde su plantilla, intenta llamar a localhost:3005 aunque el backend debe escuchar en 3000; el login/proxy puede devolver 502 por falta de conexión.

Root cause:
La plantilla frontend fija BACKEND_URL=http://localhost:3005. El override de entorno gana sobre el fallback localhost:3000 de src/lib/server.ts.

Evidence:
- `../proyectoFrontend1/.env.example:2` antes de la corrección: BACKEND_URL=http://localhost:3005.
- `../proyectoFrontend1/src/lib/server.ts:6`: process.env.BACKEND_URL prevalece sobre el fallback localhost:3000.
- No existía `.env.local` al ejecutar este seguimiento; se corrigió esta diferencia respecto del diagnóstico aportado por el usuario. La causa comprobada estaba en la plantilla, no en un archivo local preexistente.
- Validación posterior: ambas configuraciones apuntan a localhost:3000 y las llamadas simuladas llegan a ese puerto. No se contactó un servidor real.

Files involved:
- `../proyectoFrontend1/.env.example`
- `../proyectoFrontend1/.env.local` (solo local, no versionar)
- `../proyectoFrontend1/src/lib/server.ts` (contrato de prioridad de entorno)

Suggested fix:
Aplicado: plantilla y configuración local apuntan al backend en 3000. Conservar BACKEND_URL configurable para otros despliegues, sin hardcodear ni subir configuración privada.

Validation after fix:
Diagnóstico inline `node` desde backend: comprobar línea BACKEND_URL de plantilla/configuración local y destino de fetch construido por server.ts con configuración sintética. Reiniciar Next.js para cargar cambios de entorno; un login integral depende también de los bugs de autenticación pendientes.

### BE-013

Severity: high

Status: confirmed

Resolution: FIXED — login, proxy genérico y acceso server-side frontend llaman ahora a `/api/v1`. Las URLs locales del navegador continúan bajo `/api`.

Symptom:
Con puertos correctos, el frontend enviaba login y consultas al prefijo backend `/api`, que no coincide con las rutas publicadas bajo `/api/v1`, provocando 404.

Root cause:
Tres puntos de acceso al backend construían URLs con `/api` sin `/v1`: login, proxy catch-all y apiGet. El cliente del navegador llama al servidor Next; no debe cambiarse su ruta local por la del backend.

Evidence:
- `src/main.ts:11` después del nuevo import: setGlobalPrefix('api/v1'), conservado.
- `../proyectoFrontend1/src/app/api/auth/login/route.ts:9` antes: `${BACKEND_URL}/api/auth/login`.
- `../proyectoFrontend1/src/app/api/[...path]/route.ts:9` antes: `${BACKEND_URL}/api/${path.join("/")}${request.nextUrl.search}`.
- `../proyectoFrontend1/src/lib/server.ts:35` antes: `${BACKEND_URL}/api${path}`.
- Validación posterior VM de los archivos reales: login → localhost:3000/api/v1/auth/login; proxy → localhost:3000/api/v1/users?page=2; apiGet('/health') → localhost:3000/api/v1/health. No se emitieron solicitudes reales.

Files involved:
- `src/main.ts` (contrato del prefijo)
- `../proyectoFrontend1/src/app/api/auth/login/route.ts`
- `../proyectoFrontend1/src/app/api/[...path]/route.ts`
- `../proyectoFrontend1/src/lib/server.ts`
- `../proyectoFrontend1/src/lib/api.ts` (cliente del navegador, sin modificar)

Suggested fix:
Aplicado: agregar `/v1` solo a los destinos HTTP hacia NestJS. Conservar el prefijo backend y el endpoint local `/api` del frontend, query strings y forwarding de cookies/token.

Validation after fix:
Desde backend, diagnóstico inline `node` con TypeScript instalado, VM y mocks de Next/fetch: ejecutar POST de login, GET de proxy con params/search y apiGet; verificar los tres destinos exactos indicados. No instalar dependencias para este diagnóstico. El build/typecheck frontend integral queda pendiente por dependencias ausentes; BE-007 sigue siendo independiente para el recurso evaluations.
