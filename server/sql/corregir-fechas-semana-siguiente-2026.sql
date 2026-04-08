-- Corrige fechas si cargaste viajes en la semana equivocada:
-- semana en pantalla era lun 30 mar – sáb 4 abr 2026 y los datos corresponden a
-- lun 6 – sáb 11 abr 2026 (sumar 7 días).
-- Ejecutá solo si aplica; revisá el rango WHERE antes.

UPDATE viajes
SET fecha = DATE_ADD(fecha, INTERVAL 7 DAY)
WHERE fecha >= '2026-03-30' AND fecha <= '2026-04-05';
