# COCOS CHALLENGE README

¡Hola equipo de Cocos Capital!

Este README, a diferencia del `README.md` en la raíz del proyecto, está enfocado en ofrecer un resumen directo de mi mano sobre las decisiones técnicas y de negocio tomadas por mí durante la ejecución del challenge. Para correr el proyecto seguí los pasos del `README.md` de la raíz.

El detalle completo de las decisiones y trade-offs está documentado en el directorio `/docs`: `decisiones-y-consideraciones.md` y `decisions.md`. Hay otras supociciones y calculos que estoy dispuesto a conversar si existe una instancia siguiente de revisión.

## Aspectos base del proyecto
El proyecto fue pensado como un proyecto real en un equipo de trabajo y no como un challenge técnico, por lo que la documentación y la configuración de agentes nunca hacen referencia a ello, con el fin de mantener un estándar de proyecto real para producción (a excepción de usar SQL directo con `pg`, ver más abajo) y ofrecer la posibilidad de que nuevos equipos y agentes puedan tener contexto sobre el objetivo del proyecto y las decisiones técnicas tomadas durante el desarrollo.

## ¿Por qué Docker y Compose?
Dos razones principales:

TLDR; Docker para entrega de la app a SRE y Compose para un entorno de DB local.

1. Pensando en el proyecto como un proyecto real, empaquetarlo en un contenedor Docker (`Dockerfile`) facilitaría la entrega y el despliegue a manos de los equipos de SRE o infraestructura; toda la configuración entra por variables de entorno. También pensé publicarlo en mi consola personal de AWS pero, por tema de tiempo y scope del challenge, decidí no hacerlo.

2. Al no tener certeza de si la instancia remota de la DB provista por Cocos era compartida, decidí mantener una copia local para las pruebas con el fin de mantener la integridad de la remota y evitar conflictos al hacer modificaciones en las tablas. El `docker-compose.yml` levanta solo esa DB local (no incluye la API). Esas modificaciones a la DB están documentadas en `/docs/decisions.md` (D8). Pensando en un flujo real, si las modificaciones de la DB son viables, la idea es pasar esas modificaciones al equipo que administra la DB para aplicar los cambios (con previa evaluación de riesgos y consecuencias).

    - 2.1. El `docker compose up` ejecuta en orden dos archivos de `db/init`: `001`, el SQL original sin cambios, y `002`, los únicos cambios que hice, justificados en `docs/decisions.md` (D8). Son restricciones CHECK sobre `side`, `type` y `status` y `size > 0`, para que un valor mal escrito no desaparezca en silencio de los cálculos; un ticker único por instrumento, y dos índices para las consultas más frecuentes (órdenes por usuario y estado, y último precio por instrumento). No agregué tablas ni columnas.
    - 2.2. Si el equipo que administra la DB remota decide adoptar los cambios, se le entregaría el archivo `db/init/002-constraints-and-indexes.sql` junto con una verificación previa de solo lectura (`db/precheck/002-precheck.sql`) que detecta datos que los romperían.

*Nota:* El proyecto corre localmente contra la instancia local de la DB en el contenedor. En teoría es posible operar contra la remota ajustando la variable `DATABASE_URL` en el archivo `.env`, pero no lo probé: nunca me conecté a la remota. Tené en cuenta que `POST /users/:userId/orders` escribe órdenes reales en la base a la que apunte, y que las pruebas con base de datos (`npm run test:db`) se niegan a correr contra una dirección que no sea local.

## Cambios en la DB y por qué no un ORM
Si bien en proyectos en producción es común usar un ORM, decidí usar consultas SQL con `pg` por simplicidad de lectura, para facilitar la revisión.

El archivo `db/init/002-constraints-and-indexes.sql` expone el detalle de los cambios en el schema de las tablas. Aportan protección y velocidad. la DB sin esos cambios funcina igual. Jice una comprobación corriendo los tests y la colección de Postman contra una base con solo el esquema original.

Tampoco agregué una tabla de posiciones ni de saldos: el saldo, las posiciones y el costo promedio se calculan siempre a partir de la tabla `orders`. Esto es un trade-off de diseño basado en el enunciado del challenge, con la solución actual el costo de lectura incrementa dependiendo del nmumero de ordenes del usuario. Para efectos del challenge y volumen actual va bien, pero si el volumen creciera, un posible paso sería pasar los calculos a SQL o mantener saldos y posiciones derivados con conciliación.

## Decisiones de negocio y suposiciones
El enunciado deja varios puntos abiertos estas son las decisiones más importantes. Hay mas detalles em `docs/decisiones-y-consideraciones.md`

- **Saldo:** `availableAmount` es el efectivo ejecutado (`FILLED`), `committedAmount` es lo comprometido en órdenes LIMIT de compra pendientes y `buyableAmount` es la diferencia, es decir los "pesos disponibles para operar". Toda orden nueva, MARKET incluida, se valida contra `buyableAmount` (más estricto que el enunciado) y las ventas contra las acciones disponibles descontando las LIMIT de venta pendientes.
- **Órdenes rechazadas:** si no hay fondos, tenencia o precio de mercado, la orden se guarda como `REJECTED` y se responde 201 con el motivo. Un pedido inválido (por ejemplo un monto que no alcanza para una acción, o cantidad y monto a la vez) responde 400 y no se guarda.
- **MARKET y LIMIT:** MARKET se ejecuta al último `close` (que se guarda como precio) y si se envía un `price` se ignora. LIMIT requiere precio y queda en `NEW`.
- **Rendimiento:** por posición se devuelven el rendimiento diario (`close` contra `previousClose`) y el total (contra el costo promedio de compra).
- **Datos de ejemplo:** el usuario 1 es el único con movimientos. Tiene una posición de -10 en el instrumento 31, una anomalía de los datos: se muestra tal cual y impide nuevas ventas.
- **Formato:** los importes se calculan con decimales exactos y se devuelven como texto con dos decimales; el usuario viaja en la ruta (`/users/:userId/...`) porque no hay autenticación.

## Simulación y motor de mercado
Hay funcionalidad y lógica que fue considerada pero no ejecutada ya que no hay simulación de mercado, Ej. liquidación de órdenes pendientes "NEW" y actualización de saldo disponible. Mientras una LIMIT está pendiente compromete saldo (por eso existen `committedAmount` y `buyableAmount`) y se libera cancelándola. Al construir la ejecución habría que definir además a qué precio se ejecuta una LIMIT, porque hoy el saldo se calcula con el `price` de cada orden.

## Extras y cosas que madie pidió :s
Implementé algunas funcionalidades extra fuera del scope del challenge

*Lógica de negocio y producto:*
- Cancelación idempotente de órdenes `NEW` (`POST /users/:userId/orders/:orderId/cancel`).
- Portfolio parcial con `totalIsPartial` y rechazo MARKET sin precio.
- Rendimiento diario y total.
- Costo promedio.
- Saldo comprometido y operable (`committedAmount`, `buyableAmount`).
- Compromisos de LIMIT descontados en todas las órdenes.
- Listado paginado de instrumentos: `GET /instruments` sin `q` devuelve todos los disponibles (todos menos ARS), ordenados por ticker y paginados con `limit` y `offset`; la búsqueda con `q` también se pagina. Se asume que todos los instrumentos cotizan en pesos (ARS).

*Correctitud:*
- Dinero exacto, sin flotantes.
- Transacción con lock por usuario, con una prueba de concurrencia validada quitando el lock.
- Validación estricta de entradas.
- Fechas en UTC.
- Regla de lint que mantiene el dominio puro.

*Base de datos:*
- Restricciones e índices (archivo `002`) y su precheck de solo lectura.
- Base local aislada con Compose.
- Pruebas sobre una base descartable.

*Operación:*
- Configuración validada al arrancar.
- Logs JSON con request id para trazabliidad (pino pino-http).pino-http
- Errores con formato único.
- `/health` y apagado ordenado.
- Imagen Docker de producción.

*Calidad y documentación:*
- 109 tests unitarios y 39 con base de datos.
- Colección de Postman.
- Documentación téncica y `AGENTS.md` para agentes.

## Fuera de alcance o pendiente
- Autenticación y límite de pedidos por segundo (fuera de alcance; la API no debería exponerse públicamente así).
- Endpoint para ingresos y retiros de dinero (`CASH_IN` y `CASH_OUT`): se modelan en `orders` y entran en el cálculo del saldo, pero no hay endpoint para crearlos.
- Documentación OpenAPI y CI con GitHub Actions.
