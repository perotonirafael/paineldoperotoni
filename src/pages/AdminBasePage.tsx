import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkerDataProcessor } from '@/hooks/useWorkerDataProcessor';
import { useGoalProcessor } from '@/hooks/useGoalProcessor';
import {
  Upload, FileText, Target, DollarSign, Loader, CheckCircle,
  XCircle, Clock, AlertCircle, Database, RefreshCw, Download
} from 'lucide-react';
import { generateGoalTemplate } from '@/utils/generateGoalTemplate';

interface BatchRecord {
  id: string;
  version_name: string | null;
  status: string;
  file_count: number;
  published_at: string | null;
  created_at: string;
  created_by: string | null;
  notes: string | null;
}

export default function AdminBasePage() {
  const { user } = useAuth();
  const { processFiles: processFilesWithWorker, isProcessing, progress } = useWorkerDataProcessor();
  const { parseGoalsFile, parsePedidosFile } = useGoalProcessor();

  const [oppFile, setOppFile] = useState<File | null>(null);
  const [actFile, setActFile] = useState<File | null>(null);
  const [goalFile, setGoalFile] = useState<File | null>(null);
  const [pedidoFile, setPedidoFile] = useState<File | null>(null);
  const [oppFileName, setOppFileName] = useState('');
  const [actFileName, setActFileName] = useState('');
  const [goalFileName, setGoalFileName] = useState('');
  const [pedidoFileName, setPedidoFileName] = useState('');

  const [processedResult, setProcessedResult] = useState<any>(null);
  const [processedGoals, setProcessedGoals] = useState<any[]>([]);
  const [processedPedidos, setProcessedPedidos] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    const { data } = await supabase
      .from('data_batches')
      .select('id, version_name, status, file_count, published_at, created_at, created_by, notes')
      .order('created_at', { ascending: false })
      .limit(20);
    setBatches((data as BatchRecord[]) || []);
    setLoadingBatches(false);
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const handleProcess = useCallback(async () => {
    if (!oppFile && !actFile) return;
    setError(null);
    setProcessedResult(null);
    setPublishSuccess(false);

    try {
      const workerRes = await processFilesWithWorker(oppFile, actFile);
      setProcessedResult(workerRes);

      const [goalsResult, pedidosResult] = await Promise.allSettled([
        goalFile ? parseGoalsFile(goalFile) : Promise.resolve([]),
        pedidoFile ? parsePedidosFile(pedidoFile) : Promise.resolve([]),
      ]);

      if (goalsResult.status === 'fulfilled') setProcessedGoals(goalsResult.value);
      if (pedidosResult.status === 'fulfilled') setProcessedPedidos(pedidosResult.value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar');
    }
  }, [oppFile, actFile, goalFile, pedidoFile, processFilesWithWorker, parseGoalsFile, parsePedidosFile]);

  const handlePublish = useCallback(async () => {
    if (!processedResult || !user) return;
    setIsPublishing(true);
    setError(null);

    try {
      const versionName = `Base ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      const fileCount = [oppFile, actFile, goalFile, pedidoFile].filter(Boolean).length;

      const { data: batch, error: batchError } = await supabase
        .from('data_batches')
        .insert({
          version_name: versionName,
          status: 'processing',
          created_by: user.id,
          file_count: fileCount,
        })
        .select('id')
        .single();

      if (batchError || !batch) throw new Error(batchError?.message || 'Erro ao criar lote');

      const publishedGoals = processedGoals.length > 0
        ? processedGoals
        : goalFile
          ? await parseGoalsFile(goalFile)
          : [];
      const publishedPedidos = processedPedidos.length > 0
        ? processedPedidos
        : pedidoFile
          ? await parsePedidosFile(pedidoFile)
          : [];

      if (publishedGoals.length > 0 && processedGoals.length === 0) {
        setProcessedGoals(publishedGoals);
      }
      if (publishedPedidos.length > 0 && processedPedidos.length === 0) {
        setProcessedPedidos(publishedPedidos);
      }

      const slimOpportunities = (processedResult.rawOpportunities || []).map((opp: any) => ({
        'Oportunidade ID': opp['Oportunidade ID'],
        'Conta': opp['Conta'],
        'Conta ID': opp['Conta ID'],
        'Responsável': opp['Responsável'],
        'Representante': opp['Representante'],
        'Etapa': opp['Etapa'],
        'Pedido': opp['Pedido'],
        'Prob.': opp['Prob.'],
        'Valor Previsto': opp['Valor Previsto'],
        'Valor Fechado': opp['Valor Fechado'],
        'Previsão de Fechamento': opp['Previsão de Fechamento'],
        'Tipo de Oportunidade': opp['Tipo de Oportunidade'],
        'Subtipo de Oportunidade': opp['Subtipo de Oportunidade'],
        'Id ERP Usuário': opp['Id ERP Usuário'] || opp['Id ERP Usuario'],
      }));

      const slimActions = (processedResult.rawActions || []).map((act: any) => ({
        'Oportunidade ID': act['Oportunidade ID'],
        'Usuario': act['Usuario'] || act['Usuário'],
        'Categoria': act['Categoria'],
        'Atividade': act['Atividade'],
        'Data': act['Data'],
        'Duracao': act['Duracao'] || act['Duração'] || '',
        'Id Usuário ERP': act['Id Usuário ERP'] || act['Id Usuario ERP'] || act['ID USUARIO ERP'],
      }));

      const snapshot = {
        workerResult: processedResult,
        goals: publishedGoals,
        pedidos: publishedPedidos,
        rawOpportunities: slimOpportunities,
        rawActions: slimActions,
      };

      // 3. Upload snapshot to storage
      const snapshotPath = `snapshots/${batch.id}.json`;
      const snapshotBlob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });

      const { error: uploadError } = await supabase.storage
        .from('data-files')
        .upload(snapshotPath, snapshotBlob, { upsert: true });

      if (uploadError) throw new Error(`Erro ao salvar snapshot: ${uploadError.message}`);

      // 4. Archive previous published batch
      await supabase
        .from('data_batches')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('status', 'published');

      // 5. Publish new batch
      const { error: publishError } = await supabase
        .from('data_batches')
        .update({
          status: 'published',
          snapshot_path: snapshotPath,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', batch.id);

      if (publishError) throw new Error(`Erro ao publicar: ${publishError.message}`);

      // 6. Save file metadata
      const filesToSave = [
        { file: oppFile, type: 'opportunities' },
        { file: actFile, type: 'commitments' },
        { file: goalFile, type: 'goals' },
        { file: pedidoFile, type: 'orders' },
      ];

      for (const { file, type } of filesToSave) {
        if (!file) continue;
        await supabase.from('uploaded_files').insert({
          batch_id: batch.id,
          file_type: type,
          original_name: file.name,
          mime_type: file.type || 'application/octet-stream',
          file_size: file.size,
          uploaded_by: user.id,
        });
      }

      setPublishSuccess(true);
      setProcessedResult(null);
      loadBatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao publicar');
      // Mark batch as failed if it was created
    } finally {
      setIsPublishing(false);
    }
  }, [processedResult, processedGoals, processedPedidos, user, oppFile, actFile, goalFile, pedidoFile, loadBatches]);

  const statusLabel = (s: string) => {
    switch (s) {
      case 'published': return { label: 'Publicado', color: 'bg-green-100 text-green-800' };
      case 'processing': return { label: 'Processando', color: 'bg-blue-100 text-blue-800' };
      case 'failed': return { label: 'Falhou', color: 'bg-red-100 text-red-800' };
      case 'archived': return { label: 'Arquivado', color: 'bg-gray-100 text-gray-600' };
      default: return { label: s, color: 'bg-gray-100 text-gray-600' };
    }
  };

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Gestão da Base</h2>
        <p className="text-sm text-muted-foreground">Upload, processamento e publicação da base de dados oficial.</p>
      </div>

      {/* Upload Section */}
      <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
        <h3 className="text-lg font-bold text-foreground mb-4">Upload de Arquivos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Oportunidades', sub: 'Base 1 - Pipeline', color: 'green', accept: '.xlsx,.xls,.csv', fileName: oppFileName, onChange: (e: any) => { const f = e.target.files?.[0]; if (f) { setOppFile(f); setOppFileName(f.name); } } },
            { label: 'Ações/Comprom.', sub: 'Base 2 - Engajamento', color: 'blue', accept: '.xlsx,.xls,.csv', fileName: actFileName, onChange: (e: any) => { const f = e.target.files?.[0]; if (f) { setActFile(f); setActFileName(f.name); } } },
            { label: 'Metas', sub: 'Base 3 - Metas (.xlsx)', color: 'purple', accept: '.xlsx,.xls', fileName: goalFileName, onChange: (e: any) => { const f = e.target.files?.[0]; if (f) { setGoalFile(f); setGoalFileName(f.name); } } },
            { label: 'Pedidos CRM', sub: 'Base 4 - Pedidos (.csv)', color: 'orange', accept: '.csv', fileName: pedidoFileName, onChange: (e: any) => { const f = e.target.files?.[0]; if (f) { setPedidoFile(f); setPedidoFileName(f.name); } } },
          ].map(({ label, sub, color, accept, fileName, onChange }) => (
            <div key={label} className={`bg-background rounded-xl p-4 border-2 border-${color}-200 hover:border-${color}-400 transition-all`}>
              <div className="flex items-start gap-2 mb-3">
                <div className={`p-2 rounded-lg bg-gradient-to-br from-${color}-500 to-${color}-600 shadow-md`}>
                  {label === 'Metas' ? <Target className="text-white" size={16} /> :
                   label === 'Pedidos CRM' ? <DollarSign className="text-white" size={16} /> :
                   <FileText className="text-white" size={16} />}
                </div>
                <div>
                  <h4 className="text-xs font-bold">{label}</h4>
                  <p className="text-[10px] text-muted-foreground">{sub}</p>
                </div>
              </div>
              <label className="block">
                <input type="file" accept={accept} onChange={onChange} className="hidden" />
                <span className={`block w-full py-3 text-center text-sm font-medium rounded-lg border-2 border-dashed border-${color}-300 hover:border-${color}-500 hover:bg-${color}-50 transition-all cursor-pointer`}>
                  {fileName ? <span className="flex items-center justify-center gap-1.5"><FileText size={14} /> {fileName}</span> : 'Selecionar arquivo'}
                </span>
              </label>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={handleProcess}
            disabled={isProcessing || (!oppFile && !actFile)}
            className="flex items-center gap-2 px-6 py-3 text-sm font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02]"
          >
            {isProcessing ? <><Loader className="animate-spin" size={16} /> Processando...</> : <><Upload size={16} /> Processar Arquivos</>}
          </button>

          {processedResult && !publishSuccess && (
            <button
              onClick={handlePublish}
              disabled={isPublishing}
              className="flex items-center gap-2 px-6 py-3 text-sm font-bold rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02]"
            >
              {isPublishing ? <><Loader className="animate-spin" size={16} /> Publicando...</> : <><Database size={16} /> Publicar Base</>}
            </button>
          )}

          <button
            onClick={generateGoalTemplate}
            className="flex items-center gap-2 px-5 py-3 text-sm font-medium rounded-xl border-2 border-purple-300 text-purple-700 hover:bg-purple-50 transition-all hover:scale-[1.02]"
          >
            <Download size={16} /> Baixar Modelo de Metas
          </button>
        </div>

        {/* Progress */}
        {isProcessing && progress && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground mb-2">{progress.message}</p>
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress.progress}%` }} />
            </div>
          </div>
        )}

        {/* Processed summary */}
        {processedResult && !publishSuccess && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm font-semibold text-green-800">
              ✅ Processamento concluído: {processedResult.records?.length || 0} registros processados
              {processedGoals.length > 0 && ` · ${processedGoals.length} metas`}
              {processedPedidos.length > 0 && ` · ${processedPedidos.length} pedidos`}
            </p>
            <p className="text-xs text-green-600 mt-1">Clique em "Publicar Base" para tornar esses dados a base oficial.</p>
          </div>
        )}

        {publishSuccess && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
            <CheckCircle className="text-green-600" size={20} />
            <div>
              <p className="text-sm font-semibold text-green-800">Base publicada com sucesso!</p>
              <p className="text-xs text-green-600">Todos os usuários agora verão a nova base no dashboard.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="text-red-600" size={18} />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}
      </div>

      {/* Batch History */}
      <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground">Histórico de Lotes</h3>
          <button onClick={loadBatches} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw size={12} /> Atualizar
          </button>
        </div>

        {loadingBatches ? (
          <div className="py-8 text-center"><Loader className="animate-spin text-primary mx-auto" size={24} /></div>
        ) : batches.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">Nenhum lote importado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 font-semibold text-foreground">Versão</th>
                  <th className="text-left px-3 py-2 font-semibold text-foreground">Status</th>
                  <th className="text-center px-3 py-2 font-semibold text-foreground">Arquivos</th>
                  <th className="text-left px-3 py-2 font-semibold text-foreground">Publicado em</th>
                  <th className="text-left px-3 py-2 font-semibold text-foreground">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const st = statusLabel(b.status);
                  return (
                    <tr key={b.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="px-3 py-2.5 font-medium">{b.version_name || '-'}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">{b.file_count}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {b.published_at ? new Date(b.published_at).toLocaleString('pt-BR') : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {new Date(b.created_at).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
