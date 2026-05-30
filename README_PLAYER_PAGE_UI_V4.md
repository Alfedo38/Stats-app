# Player Page UI Upgrade v4 — MoskProps

Patch visual sobre la versión que ya recuperó barras, Q1/H1/H2 e histórico.

## Qué cambia

- Gráfico principal con barras más coloridas:
  - verde = supera línea
  - rojo = no supera línea
  - amarillo = push
  - labels del eje X con rival + W/L cuando está disponible
  - línea de prop más visible
  - overlay de Pot AST / REB Chances conservado

- Supporting Data sin gris plano:
  - MIN = cian
  - Usage/Touches/Pases = violeta
  - FGA/3PA/FTM/volumen = naranja
  - FG%/3P% = amarillo
  - Pot AST / REB Chances = teal/verde
  - slider con color por categoría
  - estrella de correlación mantenida

- Layout izquierdo más estable:
  - roster con scroll propio
  - injury report fijo abajo dentro de la columna
  - evita que injuries se esconda al scrollear

- Nav principal más compacto:
  - 64px cerrado
  - 224px expandido al hover
  - layout principal pasa a `md:pl-16`

- CSS nuevo:
  - `app/player-page-polish.css`
  - importado desde `app/layout.tsx`

## Instalación

```bash
cd ~/Descargas
unzip player-page-ui-upgrade-v4-patch.zip -d player-page-ui-upgrade-v4-patch
cp -r player-page-ui-upgrade-v4-patch/* ~/stats-app/

cd ~/stats-app
rm -rf .next
npm run dev
```

## Probar

1. Abrir player page.
2. Verificar que FULL / Q1 / H1 / H2 siguen mostrando barras.
3. Scrollear y confirmar que Injury Report no se pierde.
4. Mover sliders de Supporting Data y revisar chips.
5. Revisar que el nav izquierdo ocupe menos espacio.
