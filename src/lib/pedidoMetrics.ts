import type { PedidoRecord } from '@/types/goals';

export function getPedidoAggregationKey(pedido: PedidoRecord): string {
  return (pedido.numeroPedido || pedido.idOportunidade || '').trim();
}

export function aggregateEligiblePedidoRows(pedidos: PedidoRecord[]): PedidoRecord[] {
  if (pedidos.length === 0) return [];

  const groups = new Map<string, PedidoRecord[]>();

  for (const pedido of pedidos) {
    const key = getPedidoAggregationKey(pedido);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(pedido);
  }

  const eligibleRows: PedidoRecord[] = [];

  for (const rows of groups.values()) {
    const hasServico = rows.some((row) => (row.servicoValorLiquido || 0) !== 0);
    if (!hasServico) continue;
    eligibleRows.push(...rows);
  }

  return eligibleRows;
}
