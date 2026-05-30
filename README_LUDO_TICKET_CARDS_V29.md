# Ludo Ticket Cards v29

Reestructura las cards de tickets de EV/Cerebro para que sean más analíticas y menos ruidosas visualmente.

## Cambios

- Quita nombres exagerados tipo HR OVER FUERTE / ELITE / X5 del título visible.
- Usa títulos profesionales: Combinada conservadora, balanceada o agresiva si el nombre original no aporta.
- Muestra cuota total claramente.
- Muestra cantidad de picks, lado OVER/UNDER y riesgo.
- Cada pick muestra jugador, mercado, línea, cuota, valor/edge y motivos compactos.
- Recupera explicación del pick usando `analysis` cuando está disponible.
- Mantiene resultados ganados/perdidos y líneas falladas.

## Instalar

```bash
cd ~/Descargas
unzip ludo-ticket-cards-v29.zip -d ludo-ticket-cards-v29
cp -r ludo-ticket-cards-v29/* ~/stats-app/
cd ~/stats-app
rm -rf .next
npm run dev
```
