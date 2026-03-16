import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Users, Plus, Loader, AlertCircle, CheckCircle, Shield, Eye, UserPlus, X
} from 'lucide-react';

interface UserRecord {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  role: string;
  created_at: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('consulta');
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await supabase.functions.invoke('manage-user', {
        body: { action: 'list' },
      });
      if (res.error || res.data?.error) {
        setError(res.data?.error || res.error?.message || 'Erro ao carregar usuários');
      } else {
        setUsers(res.data?.users || []);
      }
    } catch (err) {
      setError('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreate = useCallback(async () => {
    if (!newUsername || !newEmail || !newPassword || !newRole) return;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'create',
          username: newUsername,
          email: newEmail,
          full_name: newFullName,
          password: newPassword,
          role: newRole,
        },
      });
      if (res.error || res.data?.error) {
        setError(res.data?.error || res.error?.message || 'Erro ao criar usuário');
      } else {
        setSuccess('Usuário criado com sucesso');
        setShowCreate(false);
        setNewUsername(''); setNewEmail(''); setNewFullName(''); setNewPassword(''); setNewRole('consulta');
        loadUsers();
      }
    } catch (err) {
      setError('Erro ao criar usuário');
    } finally {
      setCreating(false);
    }
  }, [newUsername, newEmail, newFullName, newPassword, newRole, loadUsers]);

  const handleUpdateRole = useCallback(async (userId: string, role: string) => {
    setError(null);
    try {
      const res = await supabase.functions.invoke('manage-user', {
        body: { action: 'update_role', user_id: userId, role },
      });
      if (res.error || res.data?.error) {
        setError(res.data?.error || 'Erro ao atualizar perfil');
      } else {
        setSuccess('Perfil atualizado');
        loadUsers();
      }
    } catch { setError('Erro ao atualizar'); }
  }, [loadUsers]);

  const handleToggleActive = useCallback(async (userId: string, isActive: boolean) => {
    setError(null);
    try {
      const res = await supabase.functions.invoke('manage-user', {
        body: { action: 'toggle_active', user_id: userId, is_active: !isActive },
      });
      if (res.error || res.data?.error) {
        setError(res.data?.error || 'Erro ao alterar status');
      } else {
        setSuccess(isActive ? 'Usuário inativado' : 'Usuário ativado');
        loadUsers();
      }
    } catch { setError('Erro ao alterar status'); }
  }, [loadUsers]);

  const roleLabel = (r: string) => {
    switch (r) {
      case 'admin': return { label: 'Admin', color: 'bg-red-100 text-red-800' };
      case 'analista': return { label: 'Analista', color: 'bg-blue-100 text-blue-800' };
      case 'consulta': return { label: 'Consulta', color: 'bg-gray-100 text-gray-700' };
      default: return { label: r, color: 'bg-gray-100 text-gray-600' };
    }
  };

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Gestão de Usuários</h2>
          <p className="text-sm text-muted-foreground">Criar, editar perfis e controlar acesso ao sistema.</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg transition-all hover:scale-[1.02]"
        >
          {showCreate ? <><X size={16} /> Cancelar</> : <><UserPlus size={16} /> Novo Usuário</>}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
          <AlertCircle className="text-destructive" size={16} />
          <span className="text-sm text-destructive">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs text-destructive hover:underline">Fechar</button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle className="text-green-600" size={16} />
          <span className="text-sm text-green-700">{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto text-xs text-green-600 hover:underline">Fechar</button>
        </div>
      )}

      {/* Create User Form */}
      {showCreate && (
        <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
          <h3 className="text-lg font-bold text-foreground mb-4">Criar Novo Usuário</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Usuário *</label>
              <input
                type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
                placeholder="nome.sobrenome"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <input
                type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nome Completo</label>
              <input
                type="text" value={newFullName} onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Nome Sobrenome"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Senha *</label>
              <input
                type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Perfil *</label>
              <select
                value={newRole} onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="consulta">Consulta</option>
                <option value="analista">Analista</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newUsername || !newEmail || !newPassword}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg bg-primary text-primary-foreground disabled:opacity-50 transition-all"
          >
            {creating ? <><Loader className="animate-spin" size={14} /> Criando...</> : <><Plus size={14} /> Criar Usuário</>}
          </button>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center"><Loader className="animate-spin text-primary mx-auto" size={24} /></div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Nenhum usuário encontrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold">Usuário</th>
                <th className="text-left px-4 py-3 font-semibold">Nome</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-center px-4 py-3 font-semibold">Perfil</th>
                <th className="text-center px-4 py-3 font-semibold">Status</th>
                <th className="text-center px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const rl = roleLabel(u.role);
                return (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{u.username}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.full_name || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                        className={`px-2 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer ${rl.color}`}
                      >
                        <option value="admin">Admin</option>
                        <option value="analista">Analista</option>
                        <option value="consulta">Consulta</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${u.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {u.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(u.id, u.is_active)}
                        className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all ${
                          u.is_active
                            ? 'bg-red-50 text-red-700 hover:bg-red-100'
                            : 'bg-green-50 text-green-700 hover:bg-green-100'
                        }`}
                      >
                        {u.is_active ? 'Inativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
