# AgroVida — Hoja de ruta

AgroVida nació como app de ganadería lechera, pero la visión es una plataforma de **administración agraria integral**. Todo lo listado hereda las reglas no negociables: offline-first con SQLite, outbox transaccional, RLS por finca, valores derivados nunca almacenados, copy es-CO centralizado.

**Estado actual (✅ en producción):** hato con genealogía y fotos, producción de leche con tendencias, salud con retiro de leche, reproducción con parto estimado, recordatorios derivados, exportación CSV, multi-finca/multi-usuario con roles, sincronización automática multi-dispositivo.

## Horizonte 1 — Profundizar ganadería (el usuario ya lo pidió o está cerca)

| Funcionalidad | Valor | Notas técnicas |
|---|---|---|
| **Notificaciones del sistema** | Los recordatorios avisan aunque la app esté cerrada (secado, parto, fin de retiro) | Requiere dev build (expo-notifications limitado en Expo Go); programación local desde los recordatorios ya derivados |
| **Peso y condición corporal** | Curvas de crecimiento de terneras y levante; decisiones de venta | Tabla `weight_records` idéntica en patrón a leche; gráfica por animal |
| **Padre/toro en genealogía** | Trazabilidad completa; evitar cruces consanguíneos | Campo `sire` (toro o pajilla) en inseminación y en la vaca |
| **Curva de lactancia y días en leche (DEL)** | Detectar caídas de producción por lactancia, no solo por semana | Derivado: días desde el último parto registrado |
| **Venta/liquidación de leche** | Registrar entregas a la cooperativa (litros, precio, calidad: grasa/proteína/UFC) → ingresos reales | Nueva tabla `milk_sales` por finca; cierra el ciclo producción → plata |

## Horizonte 2 — Economía y operación de la finca

| Funcionalidad | Valor | Notas técnicas |
|---|---|---|
| **Costos e insumos** | Gastos por categoría (alimento, medicamentos, nómina, combustible) → **margen por litro**, el número que todo lechero quiere | `expenses` + categorías; dashboard de rentabilidad mensual |
| **Inventario de droguería** | Stock y vencimientos de medicamentos/insumos, descuento automático al registrar un tratamiento | Se engancha con salud (un tratamiento consume inventario) |
| **Lotes y potreros** | Asignar animales a potreros, rotación de praderas, días de descanso y aforo | Primer puente hacia agro general: los potreros sirven para ganado y cultivos |
| **Pluviómetro / clima** | Registro diario de lluvias por finca — dato que casi toda finca anota en papel | Tabla mínima, gráfica mensual; offline trivial |
| **Bitácora de finca** | Diario libre de labores con fotos (arreglos de cerca, visitas del técnico) | Reutiliza el pipeline de fotos existente |

## Horizonte 3 — Administración agraria general (nuevas secciones)

| Funcionalidad | Valor | Notas técnicas |
|---|---|---|
| **Módulo de cultivos** | Lotes agrícolas, siembras, aplicaciones (fertilización/fumigación) y cosechas — mismo patrón evento-por-entidad que salud/reproducción | La entidad pasa de "vaca" a "lote"; el motor de sync no cambia |
| **Maquinaria y equipos** | Hoja de vida de tractores/equipos: mantenimientos, horómetro, recordatorios de servicio | Reutiliza recordatorios derivados |
| **Otras especies** | Registro configurable (cerdos, aves, ovejas) con eventos genéricos | Generalizar `cows` → `animals` con tipo; migración cuidadosa |
| **Dashboard web** | El propietario consulta desde el PC (reportes grandes, impresión) | Mismo backend Supabase; app web ligera (el RLS ya protege todo) |
| **Reportes avanzados** | Comparativas mes a mes, top/bottom productoras, anomalías | Derivados sobre datos ya existentes |
| **Inglés** | Ampliar mercado | Barato: todo el copy ya está centralizado en `strings.ts` |

## Criterio de priorización sugerido

1. **Lo que cierra ciclos de plata primero** (venta de leche → costos → margen): convierte la app de "cuaderno digital" a herramienta de decisión.
2. **Lo que ya tiene la infraestructura lista** (notificaciones sobre recordatorios existentes, peso con el patrón de leche).
3. **Lo que abre la puerta agraria general** (potreros → cultivos) cuando la base ganadera esté consolidada con usuarios reales.
