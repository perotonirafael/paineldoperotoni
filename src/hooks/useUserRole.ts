import { useAuth, type AppRole } from '@/contexts/AuthContext';

export function useUserRole() {
  const { role } = useAuth();

  const isAdmin = role === 'admin';
  const isAnalyst = role === 'analista';
  const isConsulta = role === 'consulta';
  const canUpload = isAdmin || isAnalyst;
  const canManageUsers = isAdmin;
  const canManageBase = isAdmin || isAnalyst;
  const canPublishBase = isAdmin || isAnalyst;
  const canViewAdminArea = isAdmin || isAnalyst;

  return {
    role,
    isAdmin,
    isAnalyst,
    isConsulta,
    canUpload,
    canManageUsers,
    canManageBase,
    canPublishBase,
    canViewAdminArea,
  };
}
