# AgroVida

App móvil offline-first para gestión de hato lechero (Android primero). React Native + Expo SDK 56 + TypeScript estricto, SQLite como fuente inmediata de verdad, sincronización automática con Supabase mediante outbox transaccional y RLS.

Estado del proyecto y bitácora por fases: `docs/IMPLEMENTATION_STATUS.md`.

## Desarrollo

```sh
npm install               # dependencias
cp .env.example .env      # completar con el proyecto Supabase (URL + anon key)
npm start                 # Metro / Expo dev server
npm run android           # abrir en dispositivo/emulador Android

npm run typecheck         # tsc --noEmit
npm run lint              # eslint
npm test                  # jest (dominio + integración con better-sqlite3)
npm run doctor            # expo-doctor
npx expo export --platform android   # verificar que el bundle compila
```

Backend (requiere Docker para la pila local): ver `supabase/README.md`
(`npx supabase db reset`, `npx supabase test db`, `npx supabase db push`).

Sin `.env` la app arranca en modo local y lo indica en la pantalla de login;
la sincronización queda deshabilitada hasta configurar Supabase.

## Estructura

- `src/app/` — rutas Expo Router (15 pantallas del MVP)
- `src/features/` — casos de uso de auth, bootstrap, rebaño y sync
- `src/components/` — componentes visuales reutilizables
- `src/db/` — driver SQLite, esquema y migraciones locales
- `src/repositories/` — persistencia de dominio (la UI no emite SQL)
- `src/sync/` — outbox, motor de sync, cursor, conflictos, fotos
- `src/lib/` — cliente Supabase, env, logger, tokens de diseño, i18n es-CO
- `supabase/` — migraciones versionadas, RLS y tests pgTAP
- `tests/` — unit e integración (Jest, better-sqlite3)

## Fuente de verdad documental

Leer en este orden: `CLAUDE.md` → `docs/DECISIONS.md` → `docs/PRODUCT_SPEC.md` → `docs/ARCHITECTURE.md` → `docs/DESIGN_SPEC.md`. `references/AgroVida.dc.html` es solo referencia visual; no es código de producción.
