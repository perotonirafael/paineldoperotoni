export function normalizeLoose(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/�/g, '')
    .replace(/[^a-z0-9\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeHeaderKey(value: string): string {
  return normalizeLoose(value).replace(/[^a-z0-9]/g, '');
}

function consonantSignature(value: string): string {
  return normalizeHeaderKey(value).replace(/[aeiou]/g, '');
}

function scoreHeaderMatch(header: string, candidate: string): number {
  const headerKey = normalizeHeaderKey(header);
  const candidateKey = normalizeHeaderKey(candidate);

  if (!headerKey || !candidateKey) return 0;
  if (headerKey === candidateKey) return 100;
  if (headerKey.includes(candidateKey) || candidateKey.includes(headerKey)) return 80;

  const headerSign = consonantSignature(header);
  const candidateSign = consonantSignature(candidate);

  if (headerSign && candidateSign && (headerSign.includes(candidateSign) || candidateSign.includes(headerSign))) {
    return 60;
  }

  return 0;
}

export function findHeaderByCandidates(headers: string[], candidates: string[]): string | undefined {
  let bestHeader: string | undefined;
  let bestScore = 0;

  for (const header of headers) {
    for (const candidate of candidates) {
      const score = scoreHeaderMatch(header, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestHeader = header;
      }
      if (bestScore === 100) return bestHeader;
    }
  }

  return bestScore >= 60 ? bestHeader : undefined;
}

export function cleanHeaderName(header: string): string {
  return String(header || '').replace(/^\uFEFF/, '').trim();
}
