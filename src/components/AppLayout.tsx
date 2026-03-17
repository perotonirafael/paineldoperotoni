import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { usePublishedDataset } from '@/hooks/usePublishedDataset';
import { BarChart3, Database, Users, LogOut, User } from 'lucide-react';

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const { isAdmin, canManageBase, canManageUsers } = useUserRole();
  const { batchInfo } = usePublishedDataset();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-green-600 to-emerald-700 text-white shadow-lg">
        <div className="container py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm">
              <BarChart3 size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold">Acompanhamento Venda GTN</h1>
              <div className="flex flex-col gap-0.5 text-xs text-green-100">
                <span>Funil de Vendas · Oportunidades</span>
                {batchInfo?.publishedAt ? (
                  <span className="bg-white/15 px-2 py-0.5 rounded-full w-fit">
                    Última atualização: {formatDate(batchInfo.publishedAt)}
                    {batchInfo.createdByName ? ` por ${batchInfo.createdByName}` : ''}
                  </span>
                ) : (
                  <span className="bg-amber-500/30 px-2 py-0.5 rounded-full">
                    Nenhuma base publicada até o momento.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Nav + User */}
          <div className="flex items-center gap-4">
            {/* Navigation */}
            <nav className="flex items-center gap-1">
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    isActive ? 'bg-white/25 text-white' : 'text-green-100 hover:bg-white/10'
                  }`
                }
              >
                <span className="flex items-center gap-1.5"><BarChart3 size={14} /> Dashboard</span>
              </NavLink>
              {canManageBase && (
                <NavLink
                  to="/admin/base"
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      isActive ? 'bg-white/25 text-white' : 'text-green-100 hover:bg-white/10'
                    }`
                  }
                >
                  <span className="flex items-center gap-1.5"><Database size={14} /> Gestão da Base</span>
                </NavLink>
              )}
              {canManageUsers && (
                <NavLink
                  to="/admin/usuarios"
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      isActive ? 'bg-white/25 text-white' : 'text-green-100 hover:bg-white/10'
                    }`
                  }
                >
                  <span className="flex items-center gap-1.5"><Users size={14} /> Usuários</span>
                </NavLink>
              )}
            </nav>

            {/* User Info */}
            <div className="flex items-center gap-2 pl-3 border-l border-white/20">
              <div className="text-right">
                <div className="text-xs font-semibold">{profile?.full_name || profile?.username || 'Usuário'}</div>
                <div className="text-[10px] text-green-200 capitalize">{useUserRole().role || ''}</div>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
                title="Sair"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <Outlet />
    </div>
  );
}
