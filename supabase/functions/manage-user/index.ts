import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXACT_ALLOWED_ORIGINS = [
  'http://perotoni.comercial.ws',
  'https://perotoni.comercial.ws',
  'https://paineldoperotoni.vercel.app',
  'https://paineldoperotoni.lovable.app',
]

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/.*\.lovableproject\.com$/,
  /^https:\/\/.*\.lovable\.app$/,
  /^https:\/\/.*\.vercel\.app$/,
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
]

function resolveAllowedOrigin(origin: string) {
  if (!origin) return EXACT_ALLOWED_ORIGINS[0]
  if (EXACT_ALLOWED_ORIGINS.includes(origin)) return origin
  if (ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin))) return origin
  return EXACT_ALLOWED_ORIGINS[0]
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = resolveAllowedOrigin(origin)
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  }
}

function jsonResponse(body: Record<string, any>, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers })
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Não autorizado' }, 401, cors)
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: claimsError } = await supabaseUser.auth.getClaims(token)
    if (claimsError || !claims?.claims) {
      return jsonResponse({ error: 'Token inválido' }, 401, cors)
    }

    const callerUserId = claims.claims.sub

    // Check admin role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUserId)
      .single()

    if (!callerRole || callerRole.role !== 'admin') {
      return jsonResponse({ error: 'Apenas administradores podem gerenciar usuários' }, 403, cors)
    }

    const body = await req.json()
    const { action } = body

    // ─── CREATE ───
    if (action === 'create') {
      const { username, password, email, full_name, role } = body
      if (!username || !password || !email || !role) {
        return jsonResponse({ error: 'Campos obrigatórios: username, password, email, role' }, 400, cors)
      }
      if (!['admin', 'analista', 'consulta'].includes(role)) {
        return jsonResponse({ error: 'Role inválida' }, 400, cors)
      }

      const { data: existing } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', username.trim())
        .single()

      if (existing) {
        return jsonResponse({ error: 'Username já está em uso' }, 409, cors)
      }

      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, full_name: full_name || '' },
      })

      if (authError || !authUser.user) {
        return jsonResponse({ error: `Erro ao criar usuário: ${authError?.message}` }, 500, cors)
      }

      const userId = authUser.user.id

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({ id: userId, username: username.trim(), email, full_name: full_name || '', is_active: true })

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(userId)
        return jsonResponse({ error: `Erro ao criar perfil: ${profileError.message}` }, 500, cors)
      }

      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role })

      if (roleError) {
        await supabaseAdmin.auth.admin.deleteUser(userId)
        return jsonResponse({ error: `Erro ao atribuir role: ${roleError.message}` }, 500, cors)
      }

      return jsonResponse({ success: true, userId }, 201, cors)
    }

    // ─── UPDATE ROLE ───
    if (action === 'update_role') {
      const { user_id, role } = body
      if (!user_id || !role || !['admin', 'analista', 'consulta'].includes(role)) {
        return jsonResponse({ error: 'user_id e role válida são obrigatórios' }, 400, cors)
      }

      const { error } = await supabaseAdmin
        .from('user_roles')
        .update({ role })
        .eq('user_id', user_id)

      if (error) return jsonResponse({ error: error.message }, 500, cors)
      return jsonResponse({ success: true }, 200, cors)
    }

    // ─── TOGGLE ACTIVE ───
    if (action === 'toggle_active') {
      const { user_id, is_active } = body
      if (!user_id || typeof is_active !== 'boolean') {
        return jsonResponse({ error: 'user_id e is_active são obrigatórios' }, 400, cors)
      }

      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', user_id)

      if (error) return jsonResponse({ error: error.message }, 500, cors)
      return jsonResponse({ success: true }, 200, cors)
    }

    // ─── LIST ───
    if (action === 'list') {
      const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('id, username, email, full_name, is_active, created_at')
        .order('created_at', { ascending: true })

      if (error) return jsonResponse({ error: error.message }, 500, cors)

      const { data: roles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id, role')

      const roleMap = new Map<string, string>()
      for (const r of roles || []) roleMap.set(r.user_id, r.role)

      const users = (profiles || []).map(p => ({
        ...p,
        role: roleMap.get(p.id) || 'consulta',
      }))

      return jsonResponse({ users }, 200, cors)
    }

    return jsonResponse({ error: 'Ação inválida' }, 400, cors)
  } catch (err) {
    console.error('[manage-user] Error:', err)
    return jsonResponse({ error: 'Erro interno' }, 500, getCorsHeaders(req))
  }
})
