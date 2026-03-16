import { Navigate } from 'react-router-dom';
import { useAuth, type AppRole } from '@/contexts/AuthContext';
import { Loader } from 'lucide-react';

interface RequireAuthProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export function RequireAuth({ children, allowedRoles }: RequireAuthProps) {
  const { session, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
