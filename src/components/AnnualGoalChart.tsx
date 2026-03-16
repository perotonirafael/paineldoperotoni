import React, { useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Line, ComposedChart,
} from 'recharts';
import { TrendingUp, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import type { AnnualGoalResult } from '@/hooks/useAnnualGoalMetrics';
import type { PedidoRecord } from '@/types/goals';

interface AnnualGoalChartProps {
  data: AnnualGoalResult | null;
  year?: string;
  allPedidos?: PedidoRecord[];
}

const formatCurrency = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

const formatK = (v: number) => `R$ ${(v / 1000).toFixed(0)}k`;

const getColor = (percentage: number): string => {
  if (percentage >= 100) return '#10b981';
  if (percentage >= 75) return '#f59e0b';
  if (percentage >= 50) return '#f97316';
  return '#ef4444';
};

const getColorClass = (percentage: number): string => {
  if (percentage >= 100) return 'bg-green-600';
  if (percentage >= 75) return 'bg-amber-600';
  if (percentage >= 50) return 'bg-orange-600';
  return 'bg-red-600';
};

const pedidoToExportRow = (p: PedidoRecord) => ({
  'Nº Pedido': p.numeroPedido,
  'ID Oportunidade': p.idOportunidade,
  'Etapa': p.idEtapaOportunidade,
  Proprietário: p.proprietarioOportunidade,
  'ID ERP Proprietário': p.idErpProprietario,
  'Data Fechamento': p.dataFechamento,
  'Ano Fechamento': p.anoFechamento,
  'Mês Fechamento': p.mesFechamento,
  Produto: p.produto,
  'Código Módulo': p.produtoCodigoModulo,
  'Produto/Módulo': p.produtoModulo,
  'Valor Licença': p.produtoValorLicenca || 0,
  'Valor Licença Canal': p.produtoValorLicencaCanal || 0,
  'Valor Manutenção': p.produtoValorManutencao || 0,
  'Valor Manutenção Canal': p.produtoValorManutencaoCanal || 0,
  Serviço: p.servico,
  'Tipo Faturamento': p.servicoTipoDeFaturamento,
  'Qtde Horas': p.servicoQtdeDeHoras || 0,
  'Valor Hora': p.servicoValorHora || 0,
  'Valor Bruto': p.servicoValorBruto || 0,
  'Valor Over': p.servicoValorOver || 0,
  'Valor Desconto': p.servicoValorDesconto || 0,
  'Valor Canal': p.servicoValorCanal || 0,
  'Valor Líquido Serviço': p.servicoValorLiquido || 0,
});

export const AnnualGoalChart: React.FC<AnnualGoalChartProps> = ({ data, year, allPedidos = [] }) => {
  const handleExportXLSX = useCallback(() => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    // Aba 1: Composição das Metas
    if (data.goalComposition?.length) {
      const metas = data.goalComposition.map(g => ({
        Produto: g.produto,
        Rubrica: g.rubrica,
        Janeiro: g.janeiro, Fevereiro: g.fevereiro, Março: g.marco,
        Abril: g.abril, Maio: g.maio, Junho: g.junho,
        Julho: g.julho, Agosto: g.agosto, Setembro: g.setembro,
        Outubro: g.outubro, Novembro: g.novembro, Dezembro: g.dezembro,
        'Total Ano': g.totalAno,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metas), 'Composição Metas');
    }

    // Aba 2: Pedidos Identificados (detalhado por linha de pedido)
    let pedidoRows: ReturnType<typeof pedidoToExportRow>[] = [];
    if (data.matchedPedidos?.length) {
      pedidoRows = data.matchedPedidos.map(p => ({
        'Nº Pedido': p.numeroPedido,
        'ID Oportunidade': p.idOportunidade,
        'Etapa': p.etapaOportunidade,
        Proprietário: p.proprietario,
        'ID ERP Proprietário': p.idErpProprietario,
        'Data Fechamento': p.dataFechamento,
        'Ano Fechamento': p.anoFechamento,
        'Mês Fechamento': p.mesFechamento,
        Produto: p.produto,
        'Código Módulo': p.produtoCodigoModulo,
        'Produto/Módulo': p.produtoModulo,
        'Valor Licença': p.valorLicenca,
        'Valor Licença Canal': p.valorLicencaCanal,
        'Valor Manutenção': p.valorManutencao,
        'Valor Manutenção Canal': p.valorManutencaoCanal,
        Serviço: p.servico,
        'Tipo Faturamento': p.servicoTipoDeFaturamento,
        'Qtde Horas': p.servicoQtdeDeHoras,
        'Valor Hora': p.servicoValorHora,
        'Valor Bruto': p.servicoValorBruto,
        'Valor Over': p.servicoValorOver,
        'Valor Desconto': p.servicoValorDesconto,
        'Valor Canal': p.servicoValorCanal,
        'Valor Líquido Serviço': p.servicoValorLiquido,
      }));
    } else if (allPedidos.length > 0 && year) {
      pedidoRows = allPedidos.filter(p => p.anoFechamento === year).map(pedidoToExportRow);
    }
    if (pedidoRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pedidoRows), 'Pedidos Identificados');
    }

    // Aba 3: Evolução Mensal
    if (data.monthlyData?.length) {
      const mensal = data.monthlyData.map(m => ({
        Mês: m.mes,
        'Meta Lic+Serv Acum': m.metaLicServAcum,
        'Real Lic+Serv Acum': m.realLicServAcum,
        'Meta Recorrente Acum': m.metaRecorrenteAcum,
        'Real Recorrente Acum': m.realRecorrenteAcum,
        'Atingimento Acum (%)': Number(m.atingimentoAcum.toFixed(2)),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mensal), 'Evolução Mensal');
    }

    XLSX.writeFile(wb, `Meta_Anual_${year || new Date().getFullYear()}.xlsx`);
  }, [data, year]);

  if (!data) {
    return (
      <div className="h-64 flex flex-col items-center justify-center bg-muted/20 rounded-lg border border-dashed border-border">
        <TrendingUp size={32} className="text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground text-sm font-medium">Nenhum dado de evolução anual disponível</p>
        <p className="text-muted-foreground/70 text-xs mt-1">
          Carregue os arquivos de Metas e Pedidos para visualizar
        </p>
      </div>
    );
  }

  const pctLS = data.metaLicencasServicos > 0 ? (data.realLicencasServicos / data.metaLicencasServicos) * 100 : 0;
  const pctR = data.metaRecorrente > 0 ? (data.realRecorrente / data.metaRecorrente) * 100 : 0;

  return (
    <div className="w-full space-y-6">
      {/* Export button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExportXLSX} className="gap-2">
          <Download size={14} />
          Exportar XLSX
        </Button>
      </div>
      {/* KPI Cards - same as GoalChart */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Licenças + Serviços */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
          <p className="text-xs font-medium text-blue-700 mb-1">Licenças + Serviços (50%)</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-lg font-bold text-blue-900">{formatCurrency(data.realLicencasServicos)}</p>
              <p className="text-xs text-blue-600">Meta: {formatCurrency(data.metaLicencasServicos)}</p>
              <p className="text-[10px] text-blue-500 mt-0.5">
                Licença: {formatCurrency(data.realLicenca)} · Serviço: {formatCurrency(data.realServico)}
              </p>
            </div>
            <span className={`px-2 py-1 rounded-full text-white text-xs font-bold ${getColorClass(pctLS)}`}>
              {data.metaLicencasServicos > 0 ? `${pctLS.toFixed(1)}%` : 'N/A'}
            </span>
          </div>
          {data.metaLicencasServicos > 0 && (
            <div className="mt-2 h-2 bg-blue-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(pctLS, 100)}%`, backgroundColor: getColor(pctLS) }}
              />
            </div>
          )}
        </div>

        {/* Manutenção / Recorrente */}
        <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
          <p className="text-xs font-medium text-purple-700 mb-1">Manutenção / Recorrente (50%)</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-lg font-bold text-purple-900">{formatCurrency(data.realRecorrente)}</p>
              <p className="text-xs text-purple-600">Meta: {formatCurrency(data.metaRecorrente)}</p>
            </div>
            <span className={`px-2 py-1 rounded-full text-white text-xs font-bold ${getColorClass(pctR)}`}>
              {data.metaRecorrente > 0 ? `${pctR.toFixed(1)}%` : 'N/A'}
            </span>
          </div>
          {data.metaRecorrente > 0 && (
            <div className="mt-2 h-2 bg-purple-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(pctR, 100)}%`, backgroundColor: getColor(pctR) }}
              />
            </div>
          )}
        </div>

        {/* Atingimento Ponderado */}
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 border border-emerald-200">
          <p className="text-xs font-medium text-emerald-700 mb-1">Atingimento Ponderado Anual</p>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-bold" style={{ color: getColor(data.percentualAtingimento) }}>
              {data.percentualAtingimento.toFixed(1)}%
            </p>
            <span className={`px-3 py-1.5 rounded-full text-white text-sm font-bold ${getColorClass(data.percentualAtingimento)}`}>
              {data.percentualAtingimento >= 100 ? 'Atingida' : 'Em andamento'}
            </span>
          </div>
          <div className="mt-2 h-2 bg-emerald-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(data.percentualAtingimento, 100)}%`, backgroundColor: getColor(data.percentualAtingimento) }}
            />
          </div>
        </div>
      </div>

      {/* Cumulative monthly chart - atingimento % evolution */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3">Evolução do Atingimento Acumulado Mensal</h4>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data.monthlyData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} />
            <YAxis
              yAxisId="currency"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={formatK}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(255,255,255,0.97)',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                fontSize: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'Atingimento %') return [`${value.toFixed(1)}%`, name];
                return [formatCurrency(value), name];
              }}
            />
            <Legend />
            <Bar yAxisId="currency" dataKey="realLicServAcum" name="Real Lic+Serv" fill="#3b82f6" opacity={0.7} radius={[2, 2, 0, 0]} />
            <Bar yAxisId="currency" dataKey="realRecorrenteAcum" name="Real Recorrente" fill="#a855f7" opacity={0.7} radius={[2, 2, 0, 0]} />
            <Line yAxisId="currency" type="monotone" dataKey="metaLicServAcum" name="Meta Lic+Serv" stroke="#1d4ed8" strokeWidth={2} strokeDasharray="6 3" dot={false} />
            <Line yAxisId="currency" type="monotone" dataKey="metaRecorrenteAcum" name="Meta Recorrente" stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 3" dot={false} />
            <Line yAxisId="pct" type="monotone" dataKey="atingimentoAcum" name="Atingimento %" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
