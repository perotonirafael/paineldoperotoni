// Tipos para Metas e Pedidos

export interface GoalRecord {
  produto: string; // "HCM Senior", "HCM Konviva", "HCM JobConvo", "Total Gestão"
  idUsuario: string; // ID do usuário (ex: "11124")
  rubrica: string; // "Setup + Licenças", "Serviços Não Recorrentes", "Recorrente"
  janeiro: number;
  fevereiro: number;
  marco: number;
  primeiroTrimestre: number;
  abril: number;
  maio: number;
  junho: number;
  segundoTrimestre: number;
  julho: number;
  agosto: number;
  setembro: number;
  terceiroTrimestre: number;
  outubro: number;
  novembro: number;
  dezembro: number;
  quartoTrimestre: number;
  totalAno: number;
}

export interface PedidoRecord {
  idOportunidade: string;
  idEtapaOportunidade: string;
  proprietarioOportunidade: string;
  idErpProprietario: string;
  produto: string;
  produtoCodigoModulo: string;
  produtoModulo: string;
  produtoValorLicenca: number;
  produtoValorLicencaCanal: number;
  produtoValorManutencao: number;
  produtoValorManutencaoCanal: number;
  servico: string;
  servicoTipoDeFaturamento: string;
  servicoQtdeDeHoras: number;
  servicoValorHora: number;
  servicoValorBruto: number;
  servicoValorOver: number;
  servicoValorDesconto: number;
  servicoValorCanal: number;
  servicoValorLiquido: number;
}

export interface GoalMetrics {
  idUsuario: string;
  etn: string;
  periodo: string; // "Janeiro", "1ºTrimestre", etc
  metaLicencasServicos: number; // Setup + Licenças + Serviços Não Recorrentes
  realLicencasServicos: number;
  metaRecorrente: number;
  realRecorrente: number;
  percentualAtingimento: number; // (realLicencasServicos/metaLicencasServicos * 0.5) + (realRecorrente/metaRecorrente * 0.5)
}

export interface GoalData {
  goals: GoalRecord[];
  pedidos: PedidoRecord[];
  metricas: GoalMetrics[];
}
