# Decisiones y consideraciones del proyecto

Este documento explica, en lenguaje natural, qué decidimos al construir el servicio **Portfolio & Orders API**, por qué lo decidimos, qué dejamos afuera a propósito y qué falta antes de llevarlo a producción.

Está pensado para quienes son dueños del proyecto y para el equipo de SRE que lo va a desplegar, sin necesidad de haber seguido el desarrollo. El registro formal y técnico de cada decisión (en inglés, con identificadores como D1 o Q3) está en [decisions.md](decisions.md); acá se cuenta lo mismo con otras palabras y con analogías. La especificación original está en [spec.md](spec.md).

> Este es el único documento del repositorio escrito en español, por pedido expreso. Todo lo demás (código, comentarios, README, commits) está en inglés.

**Contenido**

- [Parte 1 — Decisiones de negocio](#parte-1--decisiones-de-negocio)
- [Parte 2 — Decisiones técnicas](#parte-2--decisiones-técnicas)

---

# Parte 1 — Decisiones de negocio

## 1.1 Qué hace el servicio y qué no

El servicio tiene tres funciones:

1. **Ver el portfolio** de un usuario: cuánto dinero tiene disponible y cuánto puede usar para operar, qué instrumentos tiene, cuánto valen hoy y cuánto rindieron.
2. **Buscar instrumentos** del mercado por ticker o por nombre.
3. **Enviar órdenes** de compra o venta, a precio de mercado (MARKET) o a un precio límite (LIMIT), indicando una cantidad de acciones o un monto en pesos.

Quedaron **fuera de alcance** a propósito, porque la especificación lo dice:

- **Autenticación**: el servicio recibe el identificador del usuario y asume que alguien más ya verificó quién es. Esto es importante: hoy cualquiera que llegue al servicio puede operar en nombre de cualquier usuario.
- **Simulación de mercado**: no hay un motor que cruce órdenes. Una orden MARKET se ejecuta al instante al último precio de cierre; una orden LIMIT queda esperando y nada la ejecuta.

## 1.2 Cómo se calculan los números

Todo se deduce de una sola tabla, la de **órdenes**, y de los precios de cierre más recientes. No hay una tabla aparte con "el saldo" ni con "las posiciones": se calculan cada vez. Es como el extracto de una cuenta bancaria: el saldo no se guarda, se obtiene sumando todos los movimientos.

- **Monto disponible** (`availableAmount`): se suman los movimientos ya ejecutados. Un ingreso de dinero y una venta suman; un retiro y una compra restan (cantidad por precio).
- **Monto comprometido** (`committedAmount`): lo que ya prometieron las órdenes de compra LIMIT que siguen pendientes.
- **Monto operable** (`buyableAmount`): el monto disponible menos el comprometido. Es lo que realmente puede usar una orden nueva.
- **Posición en un instrumento**: compras menos ventas, contando solo órdenes ejecutadas.
- **Valor de una posición**: cantidad por el último precio de cierre.
- **Valor total de la cuenta**: monto disponible más el valor de todas las posiciones (el monto comprometido no se resta, porque ese dinero sigue siendo del usuario).
- **Rendimiento diario**: cuánto cambió el cierre de hoy respecto del cierre anterior.
- **Rendimiento total**: cuánto cambió el precio actual respecto de lo que le costó en promedio al usuario (ver 1.3, punto 2).

Con los datos de ejemplo del usuario 1, los números de referencia son: **753.000** de monto disponible (125.500 comprometidos y 627.500 operables), **40** acciones de Pampa (instrumento 47), **500** de MetroGAS (54) y **-10** de Banco Macro (31). Los tests del proyecto comprueban exactamente estos valores.

## 1.3 Las 12 preguntas que la especificación dejaba abiertas

La especificación tenía doce puntos sin definir. Nosotros no los decidimos: propusimos opciones y quien lleva el proyecto confirmó cada una. Estas son las respuestas.

1. **¿Se pueden cancelar órdenes?** Sí, pero solo las que están en estado NEW. Ya está implementado como un endpoint propio (`POST /users/{id}/orders/{orderId}/cancel`): se eligió una acción con nombre propio, en lugar de modificar la orden con PUT o PATCH, para que nadie pueda intentar poner una orden en un estado cualquiera (por ejemplo "ejecutada"), y no se usó DELETE porque la orden no se borra, queda registrada como CANCELLED. Cancelar libera automáticamente los pesos o acciones que esa orden tenía comprometidos. Es **idempotente**: si se repite la cancelación de una orden que ya estaba cancelada, responde éxito con la misma orden y no cambia nada, para que un cliente pueda reintentar sin riesgo tras un corte de red. Si la orden ya se ejecutó o fue rechazada, responde error 409; si no existe o es de otro usuario, 404.
2. **¿Cómo se calcula el rendimiento?** Se muestran **dos** números por posición: el diario (cierre de hoy contra el de ayer) y el total (contra el costo promedio de compra). El costo promedio es un *promedio ponderado móvil*: cada compra lo actualiza; una venta baja la cantidad pero no cambia el promedio; si la cantidad llega a cero, se reinicia. Si la cantidad es cero o negativa, el rendimiento total no se calcula y se muestra vacío. Si el usuario compra estando en negativo, la compra primero cubre el faltante: si queda en positivo, el promedio pasa a ser el precio de esa compra.
3. **¿Una orden LIMIT reserva fondos?** No se reserva nada en ninguna tabla. Pero cuando llega una orden nueva, se mira el saldo **descontando lo ya comprometido** en las órdenes LIMIT pendientes. Así nadie puede prometer dos veces los mismos fondos ni las mismas acciones. Esto aplica también a las órdenes MARKET.
4. **¿Qué se responde cuando una orden se rechaza?** La orden **se guarda** con estado REJECTED y el servicio responde éxito (HTTP 201) con el motivo ("insufficient funds", "insufficient holdings" o "no market price available"). Un pedido mal formado, en cambio, da error 400 y **no se guarda**.
5. **¿Qué ejecuta una orden LIMIT?** Nada, porque no hay simulación de mercado. Queda en NEW. La orden LIMIT ya ejecutada que aparece en los datos de ejemplo es solo un dato histórico.
6. **¿Y los ingresos y retiros de dinero?** Van por un endpoint propio y opcional (*todavía no implementado*). Un retiro valida contra el saldo que se puede usar (efectivo menos lo comprometido en LIMIT).
7. **¿Cómo se identifica al usuario?** En la ruta: `/users/{id}/portfolio` y `/users/{id}/orders`. Es explícito y fácil de reemplazar por la identidad real cuando exista autenticación.
8. **¿Qué pasa si el monto no alcanza para una acción, o si mandan cantidad y monto a la vez?** En los dos casos es un error 400 y no se guarda nada. Cuando se envía un monto, la cantidad es el máximo número **entero** de acciones que entra (no hay fracciones).
9. **¿Qué precio se guarda en una orden MARKET?** El precio de cierre usado al ejecutar, porque las cuentas de saldo necesitan cantidad por precio.
10. **¿Qué hacemos con la posición de -10?** Se muestra tal cual, se documenta como una anomalía de los datos de ejemplo y las ventas nuevas la impiden.
11. **¿Qué pasa con ARS (el dinero)?** Aparece solo como monto disponible, nunca como una posición. Intentar comprar o vender ARS da error 400. Tampoco aparece en las búsquedas.
12. **¿Cómo funciona la búsqueda?** Coincidencia parcial, sin distinguir mayúsculas, por ticker o por nombre. El orden es: ticker exacto, ticker que empieza con lo buscado, nombre que lo contiene, ticker que lo contiene, y alfabético dentro de cada grupo. Devuelve 20 resultados por página por defecto y 50 como máximo, y se pagina con `offset`; la respuesta incluye el total de coincidencias. Si no se envía texto a buscar, el mismo endpoint lista todos los instrumentos disponibles (todos menos ARS), ordenados por ticker y también paginados.

## 1.4 Decisiones de negocio que surgieron durante la construcción

- **Si un instrumento no tiene precio de mercado**, una orden MARKET sobre él se guarda como rechazada con el motivo "no market price available". Si la orden era por monto, en cambio, es un error 400 y no se guarda: sin precio no se puede saber cuántas acciones son, y una orden sin cantidad válida no se puede registrar.
- **Si una posición no tiene precio**, el portfolio no falla: devuelve la posición con el valor y los rendimientos vacíos, la deja afuera del total y avisa con `totalIsPartial: true`. Además queda un aviso en los logs con el instrumento afectado. Preferimos mostrar algo y avisar claramente que el total es parcial antes que ocultar todo el portfolio.
- **Reintentar una orden no la duplica.** Toda orden debe traer un `clientOrderId`, un identificador que **elige el cliente** (hasta 64 caracteres): así funcionan las APIs de pagos, porque solo el cliente puede decirle al servidor que dos pedidos son la misma intención, y un identificador generado por el servidor viajaría en la respuesta que justamente se pierde en un corte de red. El cliente lo repite al reintentar. Si el servicio ya creó esa orden, devuelve la misma (con código 200 en lugar de 201), también cuando había sido rechazada, y no crea otra. Si se reutiliza el identificador para una orden distinta, responde error 409. Cada usuario tiene su propio espacio de identificadores. Un pedido sin identificador se rechaza con error 400. La deduplicación es solo por identificador: dos órdenes idénticas con identificadores distintos son dos órdenes.
- **Se asume que todos los instrumentos cotizan en pesos (ARS).** La tabla de precios no tiene moneda y el enunciado pide precios en pesos, por eso el listado de instrumentos no indica moneda por instrumento; la respuesta del portfolio sí aclara `currency: "ARS"`. "Disponibles" significa todos los que no son ARS, incluso los dos que hoy no tienen precio de mercado (`PGR` y `IRCP`): una orden MARKET sobre ellos se rechaza.
- **Los nombres de los importes no mencionan la moneda** (`availableAmount`, `committedAmount`, `buyableAmount`): así funcionan las plataformas que operan con varias monedas, donde cada importe va acompañado de un código de moneda. La respuesta del portfolio incluye `currency: "ARS"`. El proyecto maneja una sola moneda y no lleva saldos por moneda; si algún día hiciera falta, los nombres ya no habría que cambiarlos.
- **Si una orden MARKET trae un precio**, se ignora en lugar de dar error: la orden se ejecuta al precio de mercado igualmente.
- **Los valores monetarios** salen siempre con dos decimales y como texto (por ejemplo `"753000.00"`), nunca como número decimal.

## 1.5 Hallazgos en los datos de ejemplo

Al revisar los datos iniciales encontramos rarezas que conviene conocer, porque pueden aparecer también en la base real:

- El usuario 1 compró 20 y vendió 30 del instrumento 31: queda con **-10** acciones. Eso no debería poder pasar.
- Hay una orden LIMIT marcada como ya ejecutada, aunque ninguna orden LIMIT se puede ejecutar sin un motor de mercado.
- Los precios de las órdenes MARKET del ejemplo no coinciden con los precios de cierre del mercado.
- Los precios de mercado se cargaron con 8 decimales pero la columna guarda solo 2, así que quedaron redondeados.
- Los instrumentos 12 y 53 tienen valores vacíos de apertura, máximo y mínimo en uno de los días.

## 1.6 Lo que consideramos y no implementamos (negocio)

**Discutido y postergado**

- Endpoint de ingreso y retiro de dinero (decidido, falta construirlo).
- Autenticación y permisos (fuera de alcance por especificación).

**Discutido y descartado**

- **Tabla de reservas de fondos**: se descartó porque, sin motor de ejecución, una orden LIMIT nunca se ejecuta y los fondos reservados quedarían bloqueados para siempre. Se resolvió descontando lo comprometido al calcular.
- **Tabla de posiciones**: se descartó porque duplicaría información que ya está en las órdenes y habría que mantenerla sincronizada.

**Ideas "extra" que no se discutieron ni se implementaron** (podrían sumarse más adelante)

- Ejecución de órdenes LIMIT cuando el precio llega al límite.
- Costo promedio por lotes (el primero que entra es el primero que sale), si se necesitara para impuestos.
- Límites de monto por orden y por día, y horarios de mercado.
- Órdenes ejecutadas parcialmente.
- Historial de órdenes por usuario (con paginación, como el listado de instrumentos).

---

# Parte 2 — Decisiones técnicas

## 2.1 Tecnologías elegidas y por qué

| Pieza | Elección | Motivo |
| --- | --- | --- |
| Lenguaje | TypeScript estricto sobre Node.js 24 | El compilador detecta muchos errores antes de ejecutar. Elegimos Node 24 porque es la versión de soporte largo vigente; Node 20 ya salió de soporte. |
| Framework | NestJS | Organiza el código en módulos y capas, y facilita probar cada parte por separado. |
| Base de datos | PostgreSQL con SQL directo (`pg`), sin ORM | El esquema es chico y las órdenes necesitan control fino de transacciones y bloqueos. Con SQL explícito no hay sorpresas. |
| Pruebas | Jest | Es el estándar de NestJS y alcanza para todo lo pedido. |
| Validación | zod | Revisa que los pedidos y la configuración tengan el formato correcto. |
| Logs | pino (JSON) | Logs estructurados que cualquier herramienta de monitoreo entiende. |
| Dinero | decimal.js | Cálculos decimales exactos (ver 2.3). |

## 2.2 Arquitectura: capas y un "cerebro" aislado

El código está organizado como un restaurante con tres puestos que solo se hablan hacia abajo:

- **El mozo (capa HTTP)**: recibe el pedido, revisa que esté bien formado y lo pasa. No toma decisiones.
- **El encargado (servicios)**: coordina los pasos de cada operación y abre la transacción.
- **La despensa (repositorios)**: es el único lugar que habla con la base de datos.

Aparte hay un **cerebro** (`src/domain/`) con las reglas de negocio escritas como funciones puras: reciben datos, devuelven un resultado y no tocan base de datos, red ni logs. Una regla automática de código **prohíbe** que ahí se importe cualquier librería de infraestructura. La ventaja es que las cuentas más delicadas (saldos, costo promedio, rendimientos, validación de órdenes) se prueban en milisegundos y sin base de datos, contra los valores de referencia de los datos de ejemplo.

Una consecuencia: los saldos y posiciones se calculan en ese cerebro a partir de las órdenes del usuario, en lugar de repetir las reglas en consultas SQL. Así hay **una sola** implementación de cada regla. Si algún día un usuario llegara a tener una cantidad enorme de órdenes, se puede pasar parte del cálculo a SQL.

No hay eventos, colas ni mensajería: cada orden se procesa de forma sincrónica en una sola transacción, porque la respuesta debe traer el estado final (ejecutada o rechazada). Agregar eso hoy sería construir algo que nadie usa.

## 2.3 El dinero nunca se calcula con decimales "normales"

Los números decimales comunes de las computadoras no son exactos: `0,1 + 0,2` da `0,30000000000000004`. En un sistema de inversión eso es inaceptable, así que:

- En la base, el dinero es `NUMERIC` (decimal exacto).
- En el código se usa `decimal.js`; nunca `number` para plata.
- Entre la base y el código, los importes viajan como **texto**.
- En la API los importes salen como texto con dos decimales, y si alguien los envía como número, se convierten a texto sin pasar por un decimal flotante.
- El redondeo se hace **una sola vez**, al final, para mostrar. Las cuentas internas conservan toda la precisión.

## 2.4 Enviar una orden: una sola transacción y un cajero por cliente

Si dos órdenes del mismo usuario llegan a la vez, podrían ver el mismo saldo, aprobarse las dos y dejar la cuenta en negativo. Para evitarlo, cada orden hace todo dentro de una transacción y, al empezar, **bloquea al usuario**: es como una sucursal donde cada cliente tiene un solo cajero; si llegan dos pedidos del mismo cliente, el segundo espera a que termine el primero y recién ahí ve el saldo actualizado. Usuarios distintos no se bloquean entre sí.

Dentro de esa transacción se hace: bloquear al usuario, buscar el instrumento y su precio, calcular la cantidad, calcular lo que el usuario puede usar (descontando lo comprometido), decidir el estado de la orden y guardarla.

**Lo comprobamos de verdad.** Hay una prueba que lanza 8 compras simultáneas con saldo para 3. Con el bloqueo, se ejecutan exactamente 3 y se rechazan 5. Para estar seguros de que la prueba sirve, quitamos el bloqueo a propósito: se ejecutaron las 8 y la cuenta quedó en negativo. Después lo restauramos.

## 2.5 Qué cambiamos en la base de datos (y qué no)

La base inicial era muy permisiva: sin restricciones de valores, sin índices (solo claves primarias), con campos de texto libre donde solo tienen sentido unos pocos valores. Hicimos **dos cambios de esquema** (los archivos `002` y `003`), cada uno con instrucciones para deshacerlo. El primero agrega:

| Cambio | Para qué sirve | Sin esto |
| --- | --- | --- |
| Restricción sobre el **lado** de la orden (BUY, SELL, CASH_IN, CASH_OUT) | Todos los cálculos dependen de este texto exacto. | Un error de tipeo ("buy") sería ignorado en silencio por todos los saldos: plata mal calculada y sin ningún error. |
| Restricción sobre el **tipo** (MARKET, LIMIT) | De esto depende cómo se ejecuta la orden. | Un tipo desconocido no tiene comportamiento definido. |
| Restricción sobre el **estado** (NEW, FILLED, REJECTED, CANCELLED) | Los saldos usan FILLED, los compromisos usan NEW. | Un estado mal escrito haría desaparecer una orden de las cuentas. |
| Cantidad **mayor que cero** | El signo lo da el lado, no la cantidad. | Cantidades cero o negativas invertirían las cuentas. |
| **Ticker único** por instrumento | La búsqueda asume un instrumento por ticker. | Resultados duplicados o ambiguos. |
| Índice en órdenes por **usuario y estado** | Es la consulta que corre en cada portfolio y cada orden, dentro del bloqueo. | Recorrer todas las órdenes de todos los usuarios cada vez. |
| Índice en precios por **instrumento y fecha** | Buscar el último precio de cada instrumento. | Recorrer todo el historial de precios en cada consulta. |

El segundo (`003`) agrega **una sola columna**, `clientorderid`, en las órdenes, más un índice único por usuario y esa clave: es lo que permite que reintentar una orden no la duplique (ver 1.4). La columna admite vacíos solo porque las órdenes anteriores (como las de los datos de ejemplo) no tienen clave; la API la exige en toda orden nueva. A diferencia de la `002`, **la aplicación necesita esta columna para funcionar**: contra una base que no la tenga, enviar y cancelar órdenes falla (consultar el portfolio y buscar instrumentos siguen funcionando). Cualquier base a la que se conecte la API, incluida una remota, debe tener la `003` aplicada antes.

**Lo que no tocamos**: no agregamos otras columnas ni tablas y no cambiamos tipos de datos. En particular, **no hay tabla de posiciones**. Las restricciones se eligieron como "CHECK" y no como tipos enumerados porque permiten cambiar los valores permitidos con un simple `ALTER`.

**Cómo se aplican**: son archivos SQL numerados en `db/init/`. Al crear la base local con Docker Compose por primera vez se cargan en orden: primero el esquema y los datos originales (`001`), después las restricciones e índices (`002`) y por último la columna de idempotencia (`003`). No hay ninguna herramienta de migraciones ni tabla de control: la base es local y descartable, y para incorporar un cambio se la recrea (`docker compose down -v`). Aplicarlo en una base que ya existe es una acción manual, con `psql` y en una sola transacción (si algo falla, no queda nada a medias).

**El riesgo de aplicarla en una base que ya existe**: si ahí hubiera datos que no cumplen las restricciones (por ejemplo un estado en minúsculas, o dos instrumentos con el mismo ticker), el cambio falla —sin dejar cambios parciales— y, además, otros sistemas que escriban en la misma base con valores distintos empezarían a recibir errores. Por eso existe un archivo de **verificación previa** (`002-precheck.sql`), que solo lee y lista las filas problemáticas. Sus primeras cinco consultas deben devolver cero filas antes de aplicar el cambio a cualquier base remota, y esa decisión es del dueño del proyecto.

## 2.6 Base local con Docker Compose, separada de producción

Decidimos que **todo el desarrollo y las pruebas corran contra una base local descartable**, levantada con Docker Compose, y que producción use una base remota distinta. Los motivos:

- **Seguridad de los datos reales**: una prueba mal escrita o un cambio de esquema a medias nunca debe poder tocar datos de clientes.
- **Repetibilidad**: la base local se crea desde cero con los datos de ejemplo; cualquiera obtiene los mismos números. Se resetea con un comando (`docker compose down -v`).
- **Velocidad y autonomía**: no hace falta acceso a la red ni credenciales de nadie para desarrollar.

Esta separación no depende de la buena voluntad: hay varias barreras.

- El Compose contiene **solo** la base. La aplicación no está en el Compose porque en producción la despliega SRE como imagen.
- La base local escucha solo en `127.0.0.1`, en el puerto **5433** (para no chocar con un Postgres que ya tenga la persona en el 5432), con usuario y clave descartables.
- No existe ninguna herramienta en el proyecto que cambie el esquema de una base remota: los cambios de esquema se cargan solo al crear la base local, y aplicarlos en otra base es una acción manual y deliberada, con verificación previa.
- Las pruebas funcionales crean su propia base temporal (`portfolio_test`) dentro del Postgres local y la borran al terminar; también se niegan a correr si la dirección configurada no es local.
- Las credenciales: los archivos `.env` están excluidos del repositorio, el repositorio solo contiene un `.env.example` con valores de relleno, y la configuración compartida del asistente de código (`.claude/settings.json`) le niega la lectura de esos archivos con su herramienta de lectura (es una protección parcial: no bloquea, por ejemplo, un `cat` desde la terminal). La imagen de producción no lleva ninguna configuración adentro: recibe todo por variables de entorno.

Verificamos todo contra la base local; **en ningún momento se tocó una base remota**.

## 2.7 Operación: qué necesita SRE saber

- **Configuración validada al arrancar**: si falta o está mal una variable, el servicio no arranca y dice cuál (sin mostrar su valor, por si es una clave). Las variables están en la tabla del README.
- **Logs en JSON**, con un identificador por pedido (`x-request-id`; si el cliente lo manda, se respeta) y con los encabezados sensibles (`authorization`, `cookie`) ocultos.
- **Errores con un formato único**: `{ statusCode, error, message, requestId }`. Los errores inesperados devuelven un mensaje genérico y el detalle queda solo en los logs.
- **Chequeo de salud** (`GET /health`): 200 si el servicio y la base responden, 503 si la base no.
- **Apagado ordenado**: al recibir la señal de apagado, el servicio termina lo que tiene en curso y cierra las conexiones.
- **Imagen Docker** de producción: se construye en etapas, corre con un usuario sin privilegios y trae su chequeo de salud.
- **Conexiones a la base**: tienen tiempos máximos de espera (5 segundos para conectar, 10 para una consulta) y un tope configurable.

## 2.8 Cómo se probó

- **Pruebas unitarias del cerebro** y del resto del código (130 pruebas, sin base de datos). Incluyen una prueba que arranca la aplicación completa (sin base de datos), para detectar errores de cableado entre módulos.
- **Pruebas funcionales con base de datos** (53): usan la aplicación real contra una base temporal local. Cubren cada caso de la especificación: ejecución MARKET, orden LIMIT, compra por monto, rechazo por fondos, rechazo por tenencia, compromisos de LIMIT, instrumento sin precio, el portfolio de referencia del usuario 1 y la búsqueda; más la prueba de concurrencia de 2.4, el listado paginado de instrumentos, la idempotencia de órdenes (reintentos simultáneos incluidos) y los casos de cancelación (liberar compromisos, órdenes que no se pueden cancelar, cancelación repetida, órdenes de otro usuario y dos cancelaciones simultáneas).
- **Colección de Postman** (`docs/postman/`): 36 pedidos, uno por caso, con 141 verificaciones. Se ejecutó repetidas veces con Newman contra una base descartable. Ojo: los pedidos de órdenes **escriben** datos, por eso solo deben apuntar a una API conectada a la base local.

## 2.9 Limitaciones y convenciones técnicas vigentes

Cosas que conviene saber para continuar el proyecto:

1. **NestJS 12 solo publica código en el formato moderno de módulos (ESM)**, mientras el proyecto compila al formato clásico. Funciona porque Node 24 puede cargar ambos, pero obliga a ejecutar las pruebas con una opción experimental de Node y a usar Node 24. Si molestara, se puede pasar todo el proyecto a ESM.
2. **Las fechas de las órdenes se leen siempre como UTC.** El orden cronológico de las órdenes depende de una fecha guardada sin zona horaria; si se interpretara en la zona horaria del servidor, el costo promedio podría salir distinto según dónde corra.
3. **La configuración sale de variables de entorno.** Fuera de producción, la aplicación también lee un archivo `.env` si existe; en producción solo cuentan las variables de entorno.

## 2.10 Lo que consideramos y no implementamos (técnico)

**Antes de exponer el servicio a internet** (importante)

- **Autenticación y autorización**: hoy cualquiera puede operar por cualquier usuario.
- **Límite de pedidos por segundo (throttling)**: el servicio no se debe dejar abierto públicamente tal como está.

**Operación**

- **Chequeo de "vivo" separado del de salud**: hoy `/health` incluye la base. Si el orquestador lo usa para decidir si reiniciar el servicio, una caída de la base reiniciaría todas las instancias. Se debe usar como chequeo de "listo para recibir tráfico" o agregar uno aparte.
- **Cómo llegan los cambios de esquema a producción**: no hay un paso automático. SRE debe ejecutar el archivo `002` a mano, después de la verificación previa, o acordar un paso en el despliegue.
- **Comparar la base real contra el SQL inicial**: no hicimos esa verificación porque requiere acceso a la base remota, que no usamos a propósito.
- **Métricas y trazas**: hoy solo hay logs.
- **Logs más livianos**: cada línea de log repite los datos completos del pedido HTTP; es verboso pero funcional.
- **Automatización (CI)** con GitHub Actions, despliegue en AWS con Terraform y documentación OpenAPI: previstas en el plan, todavía no hechas.

**Base de datos**

- **`NOT NULL` en las columnas centrales de las órdenes**: las restricciones actuales dejan pasar valores vacíos; es el siguiente endurecimiento natural.
- **Unicidad de (instrumento, fecha) en los precios**, restricción sobre el tipo de instrumento y precios no negativos.
- **Revisar si el tipo de dato de los importes alcanza**: los precios admiten hasta 99.999.999,99.
- **Índices sobre las claves foráneas** y creación de índices sin bloquear la tabla en bases grandes.
- **Pasar cálculos a SQL** si algún usuario llegara a tener muchísimas órdenes.

**Capacidades futuras**

- Eventos o mensajería para notificaciones o auditoría (se evitó a propósito; si aparece un consumidor real, el camino previsto es registrar el evento en la misma transacción de la orden).
- Caché de precios, versionado de la API y réplicas de lectura.
- Paginación con cursor (en lugar de `offset`) en el listado de instrumentos, si el catálogo creciera mucho: con `offset`, un cambio del catálogo entre dos páginas podría saltear o repetir filas.

## 2.11 Lista corta antes de producción

1. Decidir autenticación y límite de pedidos.
2. Acordar cómo se aplican los cambios de esquema y correr la verificación previa contra la base real.
3. Comparar el esquema real contra el inicial.
4. Definir los chequeos de salud del orquestador.
5. Ejecutar la colección de Postman contra un entorno local con el servicio recién construido.
6. Revisar que no haya credenciales en el repositorio ni en su historial.
