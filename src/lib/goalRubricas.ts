function normalizeLabel(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function isRecurringGoalRubrica(rubrica: string): boolean {
  const normalized = normalizeLabel(rubrica);
  return (
    normalized.includes('recorrente') ||
    normalized.includes('manutencao') ||
    normalized.includes('mensalidade') ||
    normalized.includes('assinatura')
  );
}

export function isLicencaServicoGoalRubrica(rubrica: string): boolean {
  const normalized = normalizeLabel(rubrica);

  if (isRecurringGoalRubrica(normalized)) {
    return false;
  }

  return (
    normalized.includes('setup') ||
    normalized.includes('licenca') ||
    normalized.includes('servico') ||
    normalized.includes('implantacao')
  );
}
