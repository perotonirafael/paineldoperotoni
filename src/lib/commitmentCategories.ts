import { normalizeLoose } from './headerMatching';

export function normalizeCategory(value: string): string {
  return normalizeLoose(value).replace(/\s+/g, ' ').trim();
}

export function isDemoCommitmentCategory(value: string): boolean {
  const normalized = normalizeCategory(value);
  if (!normalized) return false;

  const hasDemoRoot = normalized.includes('demonstr');
  const hasMode = normalized.includes('presencial') || normalized.includes('remot');

  return hasDemoRoot && hasMode;
}

export function isEligibleCommitmentCategory(value: string): boolean {
  const normalized = normalizeCategory(value);
  if (!normalized) return false;

  if (isDemoCommitmentCategory(normalized)) return true;

  if (normalized.includes('analise') && normalized.includes('aderenc')) return true;
  if (normalized.includes('analise') && (normalized.includes('rfp') || normalized.includes('rfi'))) return true;
  if (normalized.includes('etn') && normalized.includes('apoio')) return true;
  if (normalized.includes('termo') && normalized.includes('referenc')) return true;
  if (normalized.includes('edital')) return true;

  return (
    normalized.includes('analise') &&
    normalized.includes('arquiteto') &&
    normalized.includes('software') &&
    normalized.includes('gtn')
  );
}
