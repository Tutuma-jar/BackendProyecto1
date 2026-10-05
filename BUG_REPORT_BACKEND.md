# Bug Report

## Summary

Area: backend
Total detected: 10
Confirmed: 10
Probable: 0

Scope: ampliación solicitada, exclusivamente backend, sobre revisión `d8f4f5b1e51df6a6b6a539a1b3c77c50910302e8` y árbol de trabajo local. Inspección principal de `src/enrollments`, `src/grades`, `src/periods`, `src/groups`, `src/auth`, `src/users`, `src/deletions` y sus DTOs, pipes y contratos de modelos directamente necesarios. Lecturas auxiliares de servicios académicos, reportes, materias y estudiantes; no se afirma cobertura completa de esos módulos. IDs nuevos BE-014 a BE-023; las 13 entradas anteriores se preservan al final y no se cuentan como detecciones actuales.

Checks:
- Cwd: `C:\PrimerParcial\BackendProyecto1` para todos los comandos.
- `git rev-parse --is-inside-work-tree`: salida 0, `true`; `git rev-parse --show-toplevel`: salida 0, raíz backend; `git rev-parse HEAD`: salida 0, revisión indicada.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json`: salida 0, sin errores ni emisión de archivos.
- `node -r ts-node/register`, con diagnóstico JavaScript inline enviado por stdin mediante here-string de PowerShell: salida 0. Se importaron clases reales de servicios/DTOs/guards/pipe, se usaron `assert`, ValidationPipe con las opciones de `src/main.ts`, modelos y transacciones simulados, fechas sintéticas y un documento Mongoose desconectado. No se importó AppModule ni se inició la aplicación. Diez reproducciones exitosas, con resultados detallados en cada entrada.
- Salida final del diagnóstico: `TOTAL: 10 independent new causes confirmed offline. No connection, bootstrap or project file writes.` Las llamadas a save/create/delete/update de negocio fueron mocks; la única validación Mongoose real fue `document.validate()` offline.
- Build omitido porque emite `dist`; lint omitido porque el script incluye `--fix`; suite Jest omitida por falta de configuración/seguridad verificada y presencia de tests en edición. No se ejecutaron instalación, seeds, importaciones, migraciones, servidores ni consultas DB.

Limitations:
- No existe `AI_CONTEXT.md`; se usaron manifiesto y tsconfig raíz para ubicar y validar el área. No se creó contexto.
- Confirmación por ejecución aislada y evidencia estática, no por solicitudes contra una instancia real ni persistencia real. No se demuestra comportamiento integral ni concurrencia MongoDB.
- Se excluyeron las causas ya mencionadas en BE-001 a BE-013. En particular, BE-021 verifica una contraseña cuyo timestamp **ya está persistido**, y no depende de la falta de save de BE-004. BE-018 trata metadata de roles incorrecta, no la ausencia de RolesGuard de BE-001.
- Entradas y notas anteriores preservadas sin revalidar; sus estados históricos no describen necesariamente el árbol local actual.
- Estado inicial: `.env.example` eliminado, `.gitignore`, `src/auth/auth.module.ts` y `src/groups/groups.service.ts` modificados; `.env copy.example`, `src/auth/auth.module.spec.ts` y `src/groups/groups.service.spec.ts` no rastreados. No se modificaron ni se leyeron secretos.
- Al revisar el estado después del diagnóstico apareció además `src/auth/auth-jwt.spec.ts` no rastreado. Ningún diagnóstico de esta ejecución crea ese archivo; se preservó como trabajo externo/concurrente, sin ejecutar ni modificarlo.
- En la comprobación final aparecieron además modificaciones externas en `src/evaluations/evaluations.controller.ts` y `src/users/users.service.ts`, y archivos no rastreados `src/evaluations/evaluations.controller.spec.ts` y `src/users/users-password.spec.ts`. Se preservaron sin revalidar; la evidencia y numeración de líneas corresponden al momento de las lecturas/reproducciones, no a un snapshot inmutable del árbol final.
- La única escritura efectuada por este análisis es este reporte.

## Recommended Order

1. BE-023 — Evitar el bypass de las protecciones de la cuenta propia.
2. BE-021 — Hacer efectiva la revocación de sesiones tras cambiar/restablecer contraseña.
3. BE-015 — Restablecer la integridad del contador de cupos al cancelar.
4. BE-022 — Impedir horarios nulos que rompen validaciones de conflictos.
5. BE-020 — Validar conflictos al reactivar grupos; independiente de BE-022, pero probar después de asegurar horarios válidos.
6. BE-019 — Mantener el ciclo de vida del periodo.
7. BE-014 — Devolver éxito cuando la matrícula quedó activa, conservando reservas y notificaciones correctas.
8. BE-016 — Clasificar correctamente la nota mínima aprobatoria.
9. BE-017 — Permitir toda la escala de calificaciones publicada.
10. BE-018 — Recuperar el acceso del estudiante a sus matrículas.

## Bugs

### BE-014

Severity: high

Status: confirmed

Symptom:
POST `/api/v1/enrollments` con estudiante y grupo activos, periodo abierto y reglas cumplidas devuelve 400 `No se pudo confirmar la matricula` aunque ya reservó el cupo, creó/reactivó una matrícula activa y envió su confirmación. Un reintento encuentra la matrícula existente o consume una experiencia de error tras una operación exitosa.

Root cause:
`EnrollmentsService.enroll()` lanza BadRequestException cuando `created.status === EnrollmentStatus.Active`: la condición de confirmación está invertida. `reserveSeat()` precisamente crea o reactiva con estado Active.

Evidence:
- `src/enrollments/enrollments.service.ts:70-82`: reserva, notificación y rechazo del estado exitoso.
- `src/enrollments/enrollments.service.ts:245-255`: ambas ramas producen estado Active.
- Diagnóstico inline: método real con estudiante activo, materia de 3 créditos sin prerrequisitos, sin cruces y periodo Open. Resultado: 400; mocks registraron reserva=1, inserción=1, notificación=1 antes del error.

Files involved:
- `src/enrollments/enrollments.service.ts`
- `src/enrollments/enrollments.controller.ts`

Suggested fix:
No rechazar el estado Active; comprobar que el resultado sea el esperado antes de anunciar éxito y devolver la matrícula confirmada. No repetir la reserva para compensar este error de respuesta.

Validation after fix:
Prueba aislada del método con `node -r ts-node/register`, cwd indicado, mocks de transacción/modelos/notificaciones: creación y reactivación válidas resuelven con estado Active y una sola reserva/notificación; falta de cupos o incumplimiento de reglas rechaza sin confirmar. En una prueba HTTP con servicios simulados, POST exitoso debe responder 201.

### BE-015

Severity: high

Status: confirmed

Symptom:
Cancelar una matrícula cambia su estado a Cancelled pero no libera cupo. Un grupo de capacidad 1 con enrolled=1 sigue apareciendo lleno y rechaza otro estudiante, aunque su única matrícula esté cancelada. Reactivar la matrícula intenta sumar otra vez al contador anterior.

Root cause:
`EnrollmentsService.cancel()` solo guarda el estado de la matrícula dentro de la transacción; nunca decrementa `Group.enrolled`. `reserveSeat()` y el filtro de disponibilidad dependen de ese contador, no de contar matrículas vigentes.

Evidence:
- `src/enrollments/enrollments.service.ts:95-103`: transacción de cancelación sin actualización del grupo.
- `src/enrollments/enrollments.service.ts:238-243`: disponibilidad basada en enrolled y aumento de 1 por reserva.
- `src/enrollments/enrollments.controller.ts:47`: contrato explícito «libera el cupo».
- Diagnóstico inline: matrícula Active en periodo Open; cancel resuelve, status=Cancelled, save=1 y actualizaciones del modelo Group=0.

Files involved:
- `src/enrollments/enrollments.service.ts`
- `src/groups/groups.service.ts` (lector de disponibilidad)

Suggested fix:
Liberar exactamente un cupo del grupo en la misma transacción que cambia Active a Cancelled, sin permitir contadores negativos ni doble decremento. Evaluar por separado una reparación segura de contadores históricos; no ejecutarla como parte del análisis.

Validation after fix:
Prueba aislada con `node -r ts-node/register`: cancelar Active disminuye enrolled en 1 y guarda ambos cambios con la misma sesión; segunda cancelación rechaza sin decremento; fallo de transacción no confirma cancelación. Caso capacidad=1: tras cancelar debe ser posible reservar nuevamente.

### BE-016

Severity: high

Status: confirmed

Symptom:
Finalizar una matrícula con nota ponderada exactamente 3.00 la guarda como reprobada. Afecta historial, créditos aprobados, prerrequisitos y reportes, aunque el servicio declara 3.0 como nota mínima para aprobar.

Root cause:
`GradesService.finalize()` usa `finalGrade > PASSING_GRADE` en lugar de incluir el umbral mínimo con `>=`.

Evidence:
- `src/grades/grades.service.ts:16-17`: mínimo aprobado declarado como 3.0.
- `src/grades/grades.service.ts:130-133`: clasificación estrictamente superior al mínimo y persistencia.
- Diagnóstico inline: evaluación de peso 100 con nota 3; método real retornó finalGrade=3 y status=`reprobada`, con save=1.

Files involved:
- `src/grades/grades.service.ts`

Suggested fix:
Incluir el mínimo aprobado en la comparación, preservando el redondeo definido y las validaciones del plan/notas pendientes.

Validation after fix:
Prueba aislada de finalize con `node -r ts-node/register` y modelos simulados: finales 2.99 → Failed, 3.00 → Passed, 3.01 → Passed. Comprobar resultado, documento guardado y notificación; finalizeGroup debe reflejar la misma clasificación al delegar.

### BE-017

Severity: medium

Status: confirmed

Symptom:
Registrar notas 4.6 a 5.0 por las rutas de calificación individual o masiva devuelve 400, aunque la API publica una escala máxima de 5.0 y el modelo la admite.

Root cause:
`UpsertGradeDto.value` está decorado con `@Max(4.5)`; contradice Swagger y el contrato de Grade. BulkGradesDto reutiliza ese DTO para cada ítem.

Evidence:
- `src/grades/dto/grade.dto.ts:15-19`: Swagger maximum=5 frente a Max(4.5).
- `src/grades/dto/grade.dto.ts:23-29`: validación anidada para carga masiva.
- `src/grades/schemas/grade.schema.ts:8,17-18`: escala 0.0–5.0 y max=5.
- Diagnóstico con ValidationPipe real y opciones de main.ts: 4.5 pasa, 4.6 y 5 reciben 400.

Files involved:
- `src/grades/dto/grade.dto.ts`

Suggested fix:
Alinear el máximo del DTO con 5.0, manteniendo mínimo 0 y máximo dos decimales.

Validation after fix:
Mediante `node -r ts-node/register`, ValidationPipe real con UpsertGradeDto y BulkGradesDto: 0, 4.6 y 5 aceptados; -0.01, 5.01 y valores con más de dos decimales rechazados. No persistir notas reales.

### BE-018

Severity: medium

Status: confirmed

Symptom:
Un estudiante autenticado obtiene 403 en GET `/api/v1/enrollments/mine`. La ruta permite docentes, pero su servicio busca un perfil Student, por lo que un docente sin ese perfil no puede obtener «sus matrículas» mediante ese handler.

Root cause:
`EnrollmentsController.mine()` está restringido a `Role.Docente` aunque invoca `EnrollmentsService.findMine()`, que resuelve el estudiante por su usuario y filtra sus matrículas. La metadata incorrecta es independiente del registro del guard.

Evidence:
- `src/enrollments/enrollments.controller.ts:32-38`: Get('mine') con Roles(Docente).
- `src/enrollments/enrollments.service.ts:134-137`: findByUserId del StudentsService y filtro forcedStudent.
- `src/auth/auth.module.ts:33-34`: árbol local registra JwtAuthGuard y RolesGuard.
- Diagnóstico: RolesGuard real con Reflector y handler real mine; Estudiante → ForbiddenException/403, Docente → permitido. No se usó una ruta dinámica ni se depende de BE-006.

Files involved:
- `src/enrollments/enrollments.controller.ts`
- `src/enrollments/enrollments.service.ts`

Suggested fix:
Autorizar el rol Estudiante para este contrato de perfil propio. Si se necesita un listado docente, definirlo con autorización y consulta docente apropiadas, no reutilizar findMine basado en Student.

Validation after fix:
Prueba aislada de metadata/guard con `node -r ts-node/register`: Estudiante autorizado en mine, Docente rechazado si la ruta sigue siendo solo estudiantil. Mock de StudentsService con ID propio; el filtro de listado debe ignorar cualquier query.student ajeno y conservar el estudiante autenticado.

### BE-019

Severity: high

Status: confirmed

Symptom:
PATCH `/api/v1/periods/:id` con `{ "status": "planificado" }` devuelve un periodo abierto al estado planificado, incluso si ya comenzó a recibir matrículas. Deja de ser el periodo actual y puede habilitar la apertura de otro periodo sin cerrar el anterior por el flujo obligatorio.

Root cause:
`PeriodsService.update()` documenta el ciclo Planned → Open → Closed, pero solo bloquea cambios desde Closed y solicitudes de Closed. No impide la transición inversa Open → Planned; después ejecuta set/save.

Evidence:
- `src/periods/periods.service.ts:61-78`: comprobaciones incompletas de transiciones.
- `src/periods/periods.service.ts:41-45`: findCurrent solo encuentra estado Open.
- `src/periods/dto/period.dto.ts:23-27`: Planned es un valor admitido por el DTO.
- Diagnóstico inline con periodo Open y fechas válidas: update(id, {status: Planned}) resolvió con estado Planned y save=1; no necesitó consultar matrículas ni cerrar el periodo.

Files involved:
- `src/periods/periods.service.ts`

Suggested fix:
Aplicar explícitamente las transiciones permitidas, rechazando Open → Planned. Conservar cierre exclusivamente por close, prohibición de reapertura y unicidad del periodo abierto.

Validation after fix:
Prueba aislada con `node -r ts-node/register`: Open → Planned devuelve 400 sin set/save; Planned → Open pasa si no hay otro abierto; Closed → Open y cierre por PATCH rechazan; edición sin cambio de estado conserva comportamiento permitido.

### BE-020

Severity: high

Status: confirmed

Symptom:
Se puede reactivar un grupo cuyo docente o salón ya está ocupado en el mismo horario por otro grupo activo. La API termina con dos grupos activos incompatibles aunque sus reglas prohíben esos cruces.

Root cause:
`GroupsService.update()` llama a assertNoConflicts solo si dto.teacher o dto.schedule están presentes. PATCH con únicamente `{ "active": true }` omite esa comprobación; un grupo desactivado no había ocupado recursos al crear/asignar otros grupos.

Evidence:
- `src/groups/groups.service.ts:123-135`: condición limitada a cambios de teacher/schedule, seguida de persistencia.
- `src/groups/groups.service.ts:179-205`: conflicto de docente/salón entre grupos activos.
- `src/groups/dto/group.dto.ts:68-72`: active está permitido en actualización.
- Diagnóstico inline: grupo inactivo y otro con mismo docente y lunes 08:00–10:00; update({active:true}) lo activó con consultas de conflictos=0. Ejecutar assertNoConflicts con ese mismo horario produjo 409.

Files involved:
- `src/groups/groups.service.ts`

Suggested fix:
Validar conflictos al pasar de inactivo a activo, usando docente/horario resultantes y excluyendo el propio grupo. Revalidar también los recursos activos que sean exigidos para habilitar un grupo; no exigir campos redundantes al cliente para activar el check.

Validation after fix:
Prueba aislada con `node -r ts-node/register`: reactivación con choque de docente o salón → 409 y sin save; sin choque → activa el grupo; desactivación no se bloquea por choque. Comprobar que la consulta excluya el ID propio.

### BE-021

Severity: high

Status: confirmed

Symptom:
Un JWT emitido antes de un cambio/restablecimiento de contraseña, pero dentro del mismo segundo, sigue autenticando después de persistir passwordChangedAt. La promesa de cerrar las sesiones anteriores no se cumple en esa ventana.

Root cause:
`JwtStrategy.validate()` compara iat en segundos con `Math.floor(passwordChangedAt.getTime() / 1000)` y usa `<`. Al truncar, un token anterior dentro del mismo segundo queda igual al umbral y se acepta. JWT iat no conserva milisegundos, por lo que el sistema carece de información para distinguir esos tokens de uno posterior dentro del mismo segundo.

Evidence:
- `src/auth/strategies/jwt.strategy.ts:13,35-39`: precisión de iat y comparación truncada.
- `src/users/users.service.ts:138-148`: resetPassword/setPassword sí guarda timestamp y promete invalidar sesiones.
- Diagnóstico: timestamp ya persistido sintético `2026-01-01T00:00:00.900Z`; iat correspondiente al inicio de ese segundo fue aceptado. iat del segundo anterior recibió 401. No se ejecutó changePassword ni se depende de BE-004.

Files involved:
- `src/auth/strategies/jwt.strategy.ts`
- `src/users/users.service.ts`
- `src/auth/auth.service.ts` (emisión del token posterior al cambio)

Suggested fix:
Usar una versión de sesión/contraseña o una estrategia temporal coherente que distinga inequívocamente tokens anteriores de los posteriores. No sustituir simplemente `<` por `<=` sin resolver la aceptación del nuevo JWT emitido en el mismo segundo.

Validation after fix:
Prueba aislada con `node -r ts-node/register` y reloj/timestamps sintéticos: token emitido a .100 y cambio persistido a .900 del mismo segundo → 401; token nuevo posterior al cambio → aceptado; token del segundo anterior → 401. Cubrir tanto resetPassword como cambio propio sin acceder a secretos ni DB.

### BE-022

Severity: high

Status: confirmed

Symptom:
PATCH `/api/v1/groups/:id` con `{ "schedule": null }` acepta un grupo sin arreglo de horario. Consultas/operaciones posteriores que recorren ese horario pueden fallar con TypeError/500, incluidas las comprobaciones de cruces con otros grupos.

Root cause:
`UpdateGroupDto` deriva de PartialType, cuya opcionalidad omite la validación de null. `GroupsService.update()` comprueba dto.schedule por truthiness, por lo que no valida null, pero después lo aplica con group.set(dto). El contrato del modelo permite ese valor y los consumidores asumen siempre un arreglo.

Evidence:
- `src/groups/dto/group.dto.ts:59-68`: validación de arreglo heredada mediante PartialType.
- `src/groups/groups.service.ts:124-135`: null omite assertValidSchedule/assertNoConflicts pero llega a set/save.
- `src/groups/groups.service.ts:196-199`: for-of sobre other.schedule sin manejo de null.
- `src/groups/schemas/group.schema.ts:58-59`: contrato mínimo del documento usado para validación offline, no auditoría de schema.
- Diagnóstico: ValidationPipe real aceptó schedule=null; update lo aplicó a un documento Mongoose desconectado, cuya validate() pasó y cuyo save simulado se llamó 1 vez. assertNoConflicts con ese documento entre los otros grupos lanzó TypeError.

Files involved:
- `src/groups/dto/group.dto.ts`
- `src/groups/groups.service.ts`
- `src/groups/schemas/group.schema.ts` (contrato usado por el servicio)

Suggested fix:
Distinguir campo omitido de null en PATCH y rechazar null para schedule, conservando validaciones de arreglo no vacío y franjas. Añadir defensa del contrato en el servicio/persistencia si corresponde; no convertir silenciosamente null en un horario válido.

Validation after fix:
Prueba offline con `node -r ts-node/register`: ValidationPipe rechaza schedule=null y [] con 400; omitir schedule permite editar otros campos sin alterar el horario; arreglo válido pasa; no se llama set/save cuando el horario es inválido. Probar conflictos con horarios válidos sin TypeError.

### BE-023

Severity: high

Status: confirmed

Symptom:
Un administrador puede eludir la prohibición de desactivar, cambiar de rol o eliminar su propia cuenta enviando su mismo ObjectId en mayúsculas. La desactivación requiere que otro administrador activo pase el check independiente; la eliminación puede alcanzar también al único administrador si no tiene perfiles dependientes.

Root cause:
Las protecciones de identidad propia en `UsersService.update()` y `DeletionsService.removeUser()` comparan `id === actor.id` como texto sin normalizar. ParseObjectIdPipe admite hexadecimal sin distinción de mayúsculas y lo devuelve intacto, mientras Mongoose resuelve ambas representaciones al mismo documento. Las dos protecciones comparten el mismo defecto de comparación de identidad.

Evidence:
- `src/common/pipes/parse-object-id.pipe.ts:5-9`: regex con flag i, retorno del valor original.
- `src/users/users.service.ts:87-110`: protección propia por igualdad textual y check separado de otro admin.
- `src/deletions/deletions.service.ts:155-164`: comparación textual antes de borrar.
- `src/users/users.controller.ts:55-58` y `src/deletions/deletions.controller.ts:92-96`: el ID de URL atraviesa ese pipe antes de ambos servicios.
- Diagnóstico con IDs sintéticos: pipe aceptó versión mayúscula y Types.ObjectId(...).toHexString() confirmó el mismo ID canónico. update permitió active=false y save=1 con otro admin disponible; removeUser alcanzó deleteOne=1 en mocks. Los mismos métodos con ID minúsculo rechazaron respectivamente con 400 y 409.

Files involved:
- `src/common/pipes/parse-object-id.pipe.ts`
- `src/users/users.service.ts`
- `src/deletions/deletions.service.ts`
- `src/users/users.controller.ts`
- `src/deletions/deletions.controller.ts`

Suggested fix:
Comparar identidad canónica de ObjectId o usar el ID canónico del documento cargado, sin depender de la representación textual enviada por el cliente. Cubrir ambos servicios y conservar las protecciones de último administrador y perfiles.

Validation after fix:
Pruebas aisladas con `node -r ts-node/register`, pipe y servicios reales, modelos simulados: ID propio en minúsculas, mayúsculas y mezcla → rechaza desactivación/cambio de rol/eliminación sin save/delete. Edición o eliminación permitida de otro usuario mantiene comportamiento y checks de dependencias. No borrar cuentas reales.

## Previous entries not revalidated

Las siguientes 13 entradas y notas son el reporte anterior, preservado íntegramente. No se investigó nuevamente su resolución ni se incluyen en los 10 hallazgos actuales. Los números, prioridades y afirmaciones de corrección dentro del bloque son históricos.

<details>
<summary>Reporte anterior: BE-001 a BE-013</summary>

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

</details>
