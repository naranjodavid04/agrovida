# AgroVida — inicio con Claude Code

Esta carpeta contiene la especificación canónica para construir AgroVida desde cero.

## Fuente de verdad
Claude Code debe leer, en este orden:

1. `CLAUDE.md`
2. `docs/DECISIONS.md`
3. `docs/PRODUCT_SPEC.md`
4. `docs/ARCHITECTURE.md`
5. `docs/DESIGN_SPEC.md`
6. `references/AgroVida.dc.html` solo como referencia visual

El HTML no es código de producción. No deben copiarse sus componentes web, estilos inline ni lógica del entorno de diseño.

## Inicio

1. Abre una terminal en esta carpeta.
2. Inicializa Git si aún no existe: `git init`.
3. Ejecuta `claude` desde la raíz.
4. Pega el prompt indicado en `PROMPT_PARA_PEGAR.md`.

Claude debe implementar por fases y registrar el progreso en `docs/IMPLEMENTATION_STATUS.md`.
