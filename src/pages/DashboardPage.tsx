import { usePublishedDataset } from '@/hooks/usePublishedDataset';
import { Loader, AlertCircle, Database } from 'lucide-react';
import Home from './Home';

export default function DashboardPage() {
  const { batchInfo, snapshot, isLoading, error } = usePublishedDataset();

  if (isLoading) {
    return (
      <div className="container py-20 text-center">
        <Loader className="animate-spin text-primary mx-auto mb-4" size={36} />
        <p className="text-muted-foreground">Carregando base publicada...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-20 text-center">
        <AlertCircle className="text-destructive mx-auto mb-4" size={36} />
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!snapshot || !batchInfo) {
    return (
      <div className="container py-20 text-center">
        <Database className="text-muted-foreground mx-auto mb-4" size={48} />
        <h2 className="text-xl font-bold text-foreground mb-2">Nenhuma base publicada</h2>
        <p className="text-muted-foreground">
          Aguarde um administrador ou analista publicar a base de dados.
        </p>
      </div>
    );
  }

  return (
    <Home
      publishedSnapshot={snapshot}
      hideHeader
    />
  );
}
