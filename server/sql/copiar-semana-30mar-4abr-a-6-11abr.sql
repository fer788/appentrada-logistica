-- Copia viajes lun 30 mar – sáb 4 abr 2026 → lun 6 – sáb 11 abr 2026 (+7 días).
-- Mismo slot y datos; entregado = 0 en la copia. Omite casillas destino ya ocupadas.

INSERT INTO viajes (fecha, slot, cliente_id, chofer_id, patente, producto_id, precio, tipo_venta, observaciones, entregado)
SELECT DATE_ADD(v.fecha, INTERVAL 7 DAY),
       v.slot,
       v.cliente_id,
       v.chofer_id,
       v.patente,
       v.producto_id,
       v.precio,
       v.tipo_venta,
       v.observaciones,
       0
FROM viajes v
LEFT JOIN viajes ex ON ex.fecha = DATE_ADD(v.fecha, INTERVAL 7 DAY) AND ex.slot = v.slot
WHERE v.fecha >= '2026-03-30' AND v.fecha <= '2026-04-04'
  AND ex.id IS NULL;
