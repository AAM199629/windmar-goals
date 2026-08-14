# Reglas y lógica de las competencias — Dashboard de Metas

Documento de referencia para entender **exactamente** qué cuenta, qué no cuenta y cómo se
calcula cada tarjeta del dashboard. Todo lo que está aquí refleja el código actual
(`lib/config.ts`, `lib/metrics.ts`, `app/api/*`), no la intención del negocio: donde el código
y la regla de negocio no coinciden, está marcado con ⚠️.

Última revisión: 13 de agosto de 2026.

---

## Parte 0 — Fundamentos comunes (leer primero)

Todas las competencias comparten estas reglas base. Si algo no cuadra en un número, casi
siempre la causa está en esta sección.

### 0.1 De dónde sale la data

| Concepto | Tabla / campo en Redshift |
|---|---|
| Vendedores y jerarquía | `dw_zoho.dim_sales_team_member` |
| Ventas (deals) | `dwh.fact_deals` |
| Producto de la venta | `dwh.dim_profiles.pipeline` |
| Estado del deal | `dwh.dim_status_reason` (`stage`, `on_hold_status`) |
| Vendedor del deal | `dwh.dim_staff.sales_rep` |
| Marca de venta de trainee | `dwh.dim_staff.trainee_sales` |
| Leads y citas (promotores) | `dwh.fact_leads`, `dwh.dim_employee`, `dwh.dim_lead*` |

### 0.2 Qué es una "venta válida"

Un deal cuenta para **cualquier** competencia solo si cumple las tres:

1. Tiene `closing_date` y esa fecha cae **dentro de la ventana de la competencia**.
   La fecha que manda siempre es la de **cierre**, no la de creación ni la de instalación.
2. **No está cancelado** → `stage <> 'Cancelled'`.
3. **No está en hold** → `on_hold_status` vacío o nulo. Cualquier "On Hold – …" lo saca.

Un deal que se cancela después de haberse contado **desaparece** del conteo en el siguiente
sync. Los números pueden bajar; eso es correcto.

### 0.3 A quién se le acredita la venta (atribución)

El deal se une al vendedor por **`dim_staff.sales_rep` = `member_id`** del vendedor.
No se usa el email (el email es nulo o no reconcilia en muchos deals; usarlo perdía ~50% de
las ventas asistidas).

### 0.4 Roles

Solo estos 7 `sales_role` aparecen en el dashboard y en los leaderboards:

`Consultor` · `Empleado - Consultor` · `Lider` · `Empleado - Lider` · `Gerente` ·
`Empleado - Gerente` · `Gerente Accionista`

Quedan **fuera de todo lo de vendedores**: Trainee, Promotor, Supervisor Regional,
Canvassing Coordinator, Otro/Empleado y rol nulo.

Para efectos de metas y premios los roles se colapsan a 4 niveles:

- cualquier cosa con "gerente" → **gerente** (incluye Gerente Accionista y Empleado - Gerente)
- cualquier cosa con "lider"/"líder" → **líder**
- cualquier cosa con "consultor" → **consultor**
- todo lo demás → **trainee**

Además, el miembro tiene que estar **activo**: el check `Inactive` sin marcar. Si alguien se
marca inactivo, desaparece del dashboard y de los rankings.

### 0.5 Jerarquía / genealogía

- **Primera línea (línea directa)** = todos los miembros cuyo `sponsor_id` es tu `member_id`.
  Es decir, la gente que **tú reclutaste directamente**.
- Para subir varios niveles se recorre la cadena de `sponsor_id` hacia arriba.
- ⚠️ Las columnas `upline_level_1..4` de la tabla **no sirven** para esto: guardan el nombre
  del upline, no su ID. Usarlas dejó el "equipo" en 0 para todo el mundo (bug corregido).
- El árbol se arma con **todos** los miembros (incluidos trainees, promotores e inactivos)
  para no perder las líneas que cuelgan de ellos. Ese árbol solo se usa para sumar; a esa
  gente no se le muestra dashboard.

### 0.6 Productos (pipelines) y su nombre interno

| Nombre en el negocio | Valor en la data |
|---|---|
| Solar residencial | `residential solar` |
| Solar comercial | `commercial solar` |
| Roofing / Techo | `roofing` |
| Agua | `water products` |
| Anker / PPS | `pps` |

### 0.7 Ventana semanal y mensual

- **Semana** = lunes a domingo.
- **Mes** = día 1 al último día del mes natural.

### 0.8 Frescura de los datos

- Las **tarjetas del dashboard individual** (`/p/[zohoId]`) leen un *snapshot* que graba el
  sync (corre cada hora). La hora del snapshot se muestra arriba en la página.
- Los **leaderboards** (`/leaderboard`, `/leaderboard-tesla`, `/leaderboard-lideres`,
  `/plinko-ruleta`) consultan Redshift en vivo, con caché de 1 hora.
- Por eso una tarjeta y un leaderboard pueden diferir por minutos. No es un descuadre.

---

## Parte 1 — Metas anuales / de largo plazo

### 1.1 TESLA MODEL Y — meta 250

**Quién:** todos los vendedores (los 7 roles).
**Ventana:** semestre en curso. Enero–junio = `01 ene – 30 jun`; julio–diciembre =
`01 jul – 31 dic`. Cambia automáticamente al pasar a julio.
**Meta:** 250 ventas.

**Qué cuenta (1 venta = 1 punto):** solo **Solar residencial, Solar comercial y Roofing**.
Agua y Anker **no cuentan** en esta meta.

**Cómo se suma:**

```
Total = Ventas personales + Ventas de equipo
```

- **Personal** = tus propias ventas de solar/roofing en la ventana.
- **Equipo** = las ventas de solar/roofing de tu descendencia hasta **4 niveles de
  profundidad** (tú → 1ª línea → 2ª → 3ª → 4ª). Se reparte la venta de cada vendedor entre
  sus 4 uplines, subiendo por `sponsor_id`.
- El equipo incluye ventas de **cualquiera** en esas 4 líneas, incluidos trainees.

**Ejemplo:** Kenneth La Quay: 6 personales + 335 de equipo = **341 / 250**.

---

### 1.2 CRUISE COMPETITION — meta 70 pts

**Quién:** todos los vendedores.
**Ventana:** **01 ene – 31 dic 2026** (fija; no se puede cambiar por variable de entorno,
a propósito).
**Meta:** **70 puntos totales**. Referencia adicional: **50 puntos personales**.

**Puntos por venta personal:**

| Producto | Puntos |
|---|---|
| Solar residencial | 1 |
| Solar comercial | 1 |
| Roofing | 1 |
| Agua | 0.5 |
| Anker (PPS) | 0.5 |

**Puntos por venta asistida: 0.5 c/u.**
Una **venta asistida** es la **1ª, 2ª, 3ª o 4ª venta de un trainee**. Los puntos van al
**mentor**, que es el `sponsor_id` de ese trainee. Cualquier producto cuenta.

**Puntos por graduación de tu primera línea** (solo 1ª línea, solo graduaciones con fecha
dentro del **año natural en curso**):

| Se gradúa a… | Puntos |
|---|---|
| Consultor | 1 |
| Líder | 5 |
| Gerente | 10 |

```
Total crucero = pts ventas personales + pts asistidas + pts graduaciones de 1ª línea
```

**Nota de ritmo (pace):** en el leaderboard, a quien entró durante 2026 se le calcula el
ritmo desde su fecha de rol más temprana en vez de desde el 1 de enero, para no penalizarlo
por los meses en que no estaba.

---

## Parte 2 — Competencia Tesla (el viaje)

**Página:** tarjeta "COMPETENCIA TESLA" + leaderboard en `/leaderboard-tesla`.

### 2.1 Ventana

**01 julio – 15 octubre 2026.** Corte final: +6 días para que entren los deals rezagados.

### 2.2 Quién participa

| Rol | ¿Participa? |
|---|---|
| Consultor | **Sí, todos** — no hay lista |
| Líder | **Solo los de la lista** de participantes |
| Gerente | **Solo los de la lista** de participantes |
| Trainee | **Nunca** |
| Cualquier otro rol (Supervisor Regional, Promotor, etc.) | No |

La lista de líderes y gerentes vive en el código (`COMPTESLA_PARTICIPANT_IDS`, 66 IDs a
agosto 2026) y sale de la hoja de asistencia del evento. Un líder o gerente que **no** esté en
la lista **no ve la tarjeta** y **no aparece** en el leaderboard. Esto es intencional, no un
error de datos.

⚠️ La lista se desfasa con el tiempo porque el rol o el status de la persona cambia después
de haberla reconciliado. Casos ya resueltos: quien pasó de Consultor a Líder hay que
**añadirlo** (como consultor competía automáticamente, como líder perdería la tarjeta);
quien renunció hay que **quitarlo**; quien se reactivó hay que **volver a añadirlo**.

### 2.3 Qué es una "venta Tesla"

Un deal cuenta si **y solo si**:

- `battery_qty > 0` (lleva al menos una batería), **y**
- `battery_type` contiene la palabra **"tesla"**.

Y además cumple las condiciones de venta válida de la sección 0.2.

**Con solar vs. sola** se decide por el tamaño del sistema:

- `system_size_kw1 > 0` → **batería con solar**
- `system_size_kw1` en 0 o nulo → **batería sola**

### 2.4 Sistema de puntos

| Concepto | Puntos |
|---|---|
| Batería Tesla con solar | **1 pt por batería** |
| Batería Tesla sola | **0.5 pt por batería** |
| Venta asistida con Tesla | **0.5 pt por venta** |

**Regla crítica — puntos vs. ventas se cuentan distinto:**

- Los **PUNTOS** se cuentan **por cantidad de baterías** (`battery_qty`).
  Un deal con 2 baterías Tesla con solar = **2 puntos**.
- Las **VENTAS** (las que van al mínimo de 10) se cuentan **por deal**.
  Ese mismo deal con 2 baterías = **1 venta**.
- Las **asistidas** dan 0.5 pt **por venta asistida**, sin importar cuántas baterías traiga.

**Asistida Tesla** = 1ª–4ª venta de un trainee **que además sea una venta con batería Tesla**.
Los 0.5 pts van al mentor (`sponsor_id` del trainee).

### 2.5 Requisitos para clasificar

1. **Mínimo 10 ventas Tesla** en el periodo (por deal, no por batería).
2. **Mínimo 1 venta al mes.** Si un mes queda en cero → descalificado.
   ⚠️ **Esto NO está implementado en el dashboard.** El sistema solo valida el total de 10.
   El chequeo mes a mes hay que hacerlo **a mano** al cerrar la competencia.

### 2.6 Ganadores

**Top 10 consultores + top 10 líderes + top 10 gerentes** = 30 ganadores.
Se rankea **por puntos, de mayor a menor, dentro de cada rol**.
⚠️ No hay criterio de desempate definido en el sistema; si hay empate en el corte, se
resuelve manualmente.

---

## Parte 3 — Gerente Accionista

**Quién:** **solo gerentes** (Gerente, Empleado - Gerente, Gerente Accionista). Un accionista
actual sigue siendo elegible.
**Ventana:** **año 2026**. Las promociones cuentan si su fecha es **≤ 31 dic 2026**.
**Ganadores: máximo 2 personas.**

Hay **dos formatos**; se puede clasificar por cualquiera de los dos. **El Primario tiene
prioridad sobre el Secundario** al escoger a los 2 ganadores. ⚠️ Esa selección final es
**manual**: el dashboard solo informa quién cumple.

### 3.1 Formato Primario — 2 · 4 · 6

Graduar, **en tu primera línea** y dentro de 2026:

- **2 gerentes**
- **4 líderes**
- **6 consultores**

Cada graduación se cuenta por la fecha del nivel correspondiente
(`gerente_start_date`, `lider_start_date`, `consultor_start_date`).

Una misma persona puede aportar a **más de una** cuota si subió dos escalones en el año
(p. ej. pasó a consultor en marzo y a líder en septiembre = cuenta en ambas).

El número grande de la tarjeta es **cuántas de las 3 cuotas ya están completas (0–3)**, no
cuántas graduaciones llevas.

### 3.2 Formato Secundario — 11 pts de desarrollo Y 40 ventas

Hay que cumplir **las dos** condiciones:

**(a) Puntos de desarrollo ≥ 11.** Por cada promoción de primera línea en 2026:

| Promoción | Puntos |
|---|---|
| Gerente | 5 |
| Líder | 2 |
| Consultor | 0.5 |

Son acumulativos (2 gerentes = 10 pts; 1 gerente + 3 líderes = 11 pts ✓).

**(b) Ventas personales ponderadas ≥ 40.** Usa la misma ventana y los mismos conteos del
crucero (año 2026):

| Concepto | Puntos |
|---|---|
| Solar residencial / comercial | 1 |
| Roofing | 1 |
| Agua | 0.5 |
| Anker (PPS) | 0.5 |
| **Venta asistida** | **1** ← ojo, aquí vale 1, no 0.5 como en el crucero |

### 3.3 Ranking

El top 10 de gerentes se ordena por **puntos de desarrollo** (desc) y, en empate, por
**puntos de ventas**.

### 3.4 Limitaciones conocidas

- ⚠️ **Transferidos y heredados no son detectables** con la data disponible. El sistema cuenta
  **todas** las graduaciones de primera línea. La regla del negocio dice que los transferidos
  no aplican → hay que **ajustarlo a mano**.
- Los miembros de primera línea **inactivos** o con rol fuera de los 7 permitidos quedan
  fuera del conteo.

---

## Parte 4 — Competencia Líderes 2026

**Página:** tarjeta "COMPETENCIA LÍDERES" + leaderboard en `/leaderboard-lideres`.
**Fuente:** comunicado "Competencia Lideres 2026" (José Alicea, VP de Ventas, 08/01/2026).

### 4.1 Ventana

**01 agosto – 31 diciembre 2026** (Ago · Sep · Oct · Nov · Dic), por **fecha de cierre**.
**Fecha de corte: 06 de enero de 2027** — hasta esa fecha se siguen reconciliando documentos de
deals ya cerrados dentro de la ventana. El corte **no** amplía la ventana de cierre.

### 4.2 Quién participa

**Todos los líderes activos** — `Lider` y `Empleado - Lider`. **No hay allow-list**: a diferencia
de la Competencia Tesla, participa todo el que sea líder y esté activo al momento del sync.

Consultores, gerentes y trainees **no ven la tarjeta** (`competenciaLideres` = `null`).

### 4.3 Sistema de puntos

Es **competencia individual**. La venta de tu trainee vale **exactamente lo mismo** que la tuya:

| Tipo de venta | Personal | De tu trainee |
|---|---|---|
| Solar (residencial y comercial) | 1 | 1 |
| Roofing | 1 | 1 |
| Water | ½ | ½ |
| Anker (PPS) | ½ | ½ |

```
Total = pts de tus ventas + pts de las ventas de tus trainees
```

**Venta de trainee** = 1ª–4ª venta de un trainee de tu **primera línea** (mismo criterio que la
asistida del crucero: `dim_staff.trainee_sales IN ('1st Sale'…'4th Sale')`, y el mentor es el
`sponsor_id` del trainee).

⚠️ **Ojo, esta es la diferencia técnica con todo lo demás:** en el crucero y en Gerente Accionista
la asistida es un **conteo plano** (× 0.5 y × 1 respectivamente). Aquí se pondera **por producto**,
así que el sync corre una consulta aparte que trae las ventas de trainee **desglosadas por
pipeline**.

### 4.4 Requisito para clasificar

**Mínimo 9 puntos** durante el periodo. Quien no llegue a 9 no puede ganar aunque quede dentro de
las 15 primeras posiciones — el leaderboard lo muestra sin premio.

### 4.5 Premios — Top 15

$50,000 repartidos entre los quince líderes con más puntos al cierre:

| Posición | Premio | Posición | Premio |
|---|---|---|---|
| 1° — Campeón | $10,000 | 9° | $1,750 |
| 2° | $8,000 | 10° | $1,500 |
| 3° | $6,500 | 11° | $1,250 |
| 4° | $5,250 | 12° | $1,000 |
| 5° | $4,250 | 13° | $800 |
| 6° | $3,500 | 14° | $700 |
| 7° | $2,750 | 15° | $500 |
| 8° | $2,250 | **TOTAL** | **$50,000** |

Se toman en cuenta **ventas netas**: con documentos completos y al día. Es responsabilidad de cada
quien confirmarlo con las asistentes de documentos — el dashboard no valida eso.

⚠️ No hay criterio de desempate definido; si hay empate en el corte, se resuelve manualmente.

---

## Parte 5 — Metas recurrentes (mes y semana)

### 5.1 MONTHLY TOTAL SALES

**Ventana:** mes en curso. **Cuenta:** todos los productos.

| Producto | Valor |
|---|---|
| Anker (PPS) | 0.5 |
| Todo lo demás (solar, roofing, **agua**) | 1 |

⚠️ Aquí el **agua vale 1**, a diferencia del crucero/plinko/graduación donde vale 0.5.
Es la única métrica donde pasa esto — confirmar si es intencional.

**Meta según el mes:**

- **Abril – septiembre: 5 ventas**
- **Octubre – marzo: 3 ventas**

---

### 5.2 PLINKO

**Ventana:** **semana en curso, lunes a domingo.** Se reinicia cada lunes.

**Productos elegibles y su valor:**

| Producto | Valor |
|---|---|
| Solar (con o sin batería) | 1 |
| Roofing | 1 |
| Anker (PPS) | 0.5 |
| Agua | 0.5 |

**Meta por rol (todo el año, no cambia por temporada):**

| Rol | Meta semanal |
|---|---|
| Trainee / Consultor | **2** |
| Líder / Gerente | **3** |

Se clasifica al llegar a la meta. La página `/plinko-ruleta` muestra semana por semana quién
clasificó dentro del mes seleccionado.

⚠️ Aviso que va en la tarjeta: *la lista final y oficial del Plinko se envía en los
respectivos chats.* El dashboard es referencia, no la lista oficial.

---

### 5.3 RULETA WINDMAR

**Ventana:** **mes natural en curso.**

**Productos elegibles: SOLO Solar (residencial y comercial) y Roofing.**
Agua y Anker **no cuentan** en la Ruleta (a diferencia del Plinko). Se cuenta **por venta**
(1 venta = 1), sin ponderación.

**Meta por rol y temporada:**

| Rol | Abril – septiembre | Octubre – marzo |
|---|---|---|
| Consultor | 6 | 4 |
| Líder | 8 | 6 |
| Gerente | 10 | 8 |
| Trainee | **No elegible** | **No elegible** |

Un trainee no ve la tarjeta de Ruleta.

⚠️ La lista oficial y final se publica en los chats. Dudas: Office Manager o Asistente
Administrativa.

---

### 5.4 GRADUACIÓN

Mide el progreso hacia **el próximo nivel**, no el actual.

| Tu rol hoy | Estás trabajando hacia | Meta |
|---|---|---|
| Trainee | Consultor | 20 pts |
| Consultor | Líder | 20 pts |
| Líder | Gerente | 40 pts |
| Gerente | (se queda en gerente) | 40 pts |

**Ventana: mes en curso.**

**Puntos por venta, según el nivel al que aspiras:**

| Producto | Hacia Consultor / Líder | Hacia Gerente |
|---|---|---|
| Solar residencial / comercial | 1 | 1 |
| Roofing | 1 (hacia consultor) / 0.5 (hacia líder) | 0.5 |
| Anker (PPS) | 0.5 | 0.5 |
| Agua | 0.5 | 0.5 |

Es decir: **de consultor hacia arriba, el roofing vale la mitad.**

---

### 5.5 TEAM BUILDER

**Quién:** **solo gerentes.**
**Meta: 10 puntos.**
**Ventana: ninguna** — es una foto de **cómo está tu primera línea hoy**, no de lo que
graduaste este año.

| Quién está en tu 1ª línea | Puntos c/u |
|---|---|
| Gerente | 5 |
| Líder | 2 |

Consultores y trainees de tu primera línea **no suman** en esta tarjeta.

---

## Parte 6 — Promotores

Los promotores **no venden**: generan leads y coordinan citas para que un vendedor cierre.

**Están excluidos de TODO lo de vendedores:** crucero, Tesla Model Y, Competencia Tesla,
Gerente Accionista, Plinko, Ruleta, Graduación y monthly sales.

**Dónde se ve:** dashboard individual en `/p/[zohoId]` (se detecta el rol y se muestra la
vista de promotor) y resumen para supervisores en `/promotores`, con filtro de mes.

**Solo se listan promotores activos:** `Status = 'Activo'` **y** el check `Inactive` sin marcar.

### 6.1 Meta

**25 leads registrados por semana** (lunes a domingo).

### 6.2 Definiciones de cada número

| Métrica | Definición |
|---|---|
| **Leads creados** | Leads registrados por el promotor **en el mes** (fecha de creación del lead) |
| **Citas creadas** | Leads con **fecha de cita** dentro del mes |
| **Casos vendidos** | Leads con estado `Caso Vendido` |
| **Esta semana** | Leads registrados en la semana en curso (meta 25) |

Los estados de lead que cuentan como **cita generada**: `Cita Coordinada`, `Cita Confirmada`,
`Cita Realizada`, `Cita en Espera`, `Caso Vendido`.

En `/promotores` **todos los números son clickables** → abren el desglose de esos leads.

### 6.3 Detalle técnico importante (por qué los números son correctos)

En la data, los campos de Zoho engañan:

- `sales_rep_email` = campo **"Sales Rep"** = el **dueño actual** del lead. Antes de asignar
  vendedor es el promotor; **después del handoff pasa a ser el vendedor**.
- `gerente_asignado` = campo **"Sales Assist"** = **el promotor**, y se conserva durante todo
  el ciclo (el nombre de la columna es engañoso).

Por eso los leads de un promotor se buscan por **cualquiera de los dos** campos. Si se buscara
solo por `sales_rep_email` se perderían todas las citas ya reasignadas a un vendedor.

El **"vendedor asignado"** que se muestra es el `sales_rep_email` resuelto a nombre: el
vendedor real tras el handoff, o el propio promotor si el lead sigue a su nombre.

---

## Parte 7 — Resumen de diferencias que más confunden

| Pregunta | Respuesta |
|---|---|
| ¿El agua cuenta? | Crucero **0.5** · Plinko **0.5** · Graduación **0.5** · Gerente Accionista **0.5** · Competencia Líderes **0.5** · Ruleta **no** · Tesla Model Y **no** · Monthly **1** ⚠️ |
| ¿Anker/PPS cuenta? | Igual que el agua en todas, excepto Monthly donde vale **0.5** |
| ¿Cuánto vale una asistida / venta de trainee? | Crucero **0.5** · Competencia Tesla **0.5** · Gerente Accionista **1** · Competencia Líderes **lo mismo que la venta personal, ponderada por producto** (1 / 1 / ½ / ½) |
| ¿Roofing siempre vale 1? | Sí, **excepto** en Graduación hacia Líder o Gerente, donde vale **0.5** |
| ¿Qué es "primera línea"? | Solo quienes tienen tu `member_id` como `sponsor_id`. No incluye 2ª línea en adelante |
| ¿Qué meta usa varios niveles? | Solo **Tesla Model Y** (4 niveles de profundidad) |
| ¿Qué mide la fecha? | Siempre la **fecha de cierre** del deal |
| ¿Por qué bajó mi número? | Un deal se canceló o entró en hold |
| ¿Por qué no veo la tarjeta Competencia Tesla? | Eres líder o gerente y no estás en la lista de participantes del viaje |
| ¿Por qué no veo Ruleta? | Eres trainee |
| ¿Por qué no veo Team Builder / Gerente Accionista? | No eres gerente |
| ¿Por qué no veo Competencia Líderes? | No eres líder (`Lider` / `Empleado - Lider`). Aquí **no** hay lista de participantes: todo líder activo la ve |

---

## Parte 8 — Cosas que el sistema NO hace (ajuste manual)

1. **Competencia Tesla:** no valida el mínimo de 1 venta mensual. Solo el total de 10.
2. **Gerente Accionista:** no distingue graduaciones transferidas o heredadas — las cuenta todas.
3. **Gerente Accionista:** no escoge a los 2 ganadores; solo muestra quién cumple cada formato.
4. **Competencia Tesla:** la lista de líderes/gerentes participantes se mantiene **a mano**;
   hay que revisarla cuando alguien cambia de rol, renuncia o se reactiva.
5. **Plinko y Ruleta:** las listas oficiales se publican en los chats, no salen del dashboard.
6. **Competencia Líderes:** no valida que las ventas sean "netas" (documentos completos y al día)
   — cuenta toda venta válida según la sección 0.2. Esa verificación es con las asistentes de
   documentos.
7. **Competencia Líderes:** la selección final de los 15 ganadores y el cierre al **06 ene 2027**
   son manuales; el dashboard solo informa el ranking al momento del sync.
8. No hay criterio automático de desempate en ningún ranking.

---

## Parte 9 — Cómo repetir una competencia el año que viene

La **Competencia Tesla**, **Gerente Accionista** y la **Competencia Líderes** están construidas
para repetirse cambiando **solo las fechas**. No hace falta SQL nuevo ni cambios de interfaz.

1. Cambiar las fechas de inicio/fin de esa competencia (variables de entorno
   `COMPTESLA_START_DATE` / `COMPTESLA_END_DATE`, `GERENTEA_START_DATE` / `GERENTEA_END_DATE`,
   `CLIDERES_START_DATE` / `CLIDERES_END_DATE`, o los valores por defecto en `lib/config.ts`).
2. Para la Competencia Tesla: **actualizar la lista de participantes** con los IDs de los
   líderes y gerentes de esa edición. La Competencia Líderes no tiene lista.
3. Si cambian los premios o el mínimo de puntos: `CLIDERES_PRIZES` y `CLIDERES_MIN_POINTS`
   (`CLIDERES_TOP_N` se deriva de la cantidad de premios que definas).
4. Correr el sync para repoblar los datos.

Todo lo demás — métricas, ranking, tarjeta y desglose — ya queda conectado.
