import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: claimsError } = await supabaseUser.auth.getClaims(token)
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
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
      return new Response(JSON.stringify({ error: 'Apenas administradores podem gerenciar usuários' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const { action } = body

    if (action === 'create') {
      const { username, password, email, full_name, role } = body
      if (!username || !password || !email || !role) {
        return new Response(JSON.stringify({ error: 'Campos obrigatórios: username, password, email, role' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (!['admin', 'analista', 'consulta'].includes(role)) {
        return new Response(JSON.stringify({ error: 'Role inválida' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Check username uniqueness
      const { data: existing } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', username.trim())
        .single()

      if (existing) {
        return new Response(JSON.stringify({ error: 'Username já está em uso' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Create auth user
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, full_name: full_name || '' },
      })

      if (authError || !authUser.user) {
        return new Response(JSON.stringify({ error: `Erro ao criar usuário: ${authError?.message}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const userId = authUser.user.id

      // Create profile
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({ id: userId, username: username.trim(), email, full_name: full_name || '', is_active: true })

      if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(userId)
        return new Response(JSON.stringify({ error: `Erro ao criar perfil: ${profileError.message}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Create role
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role })

      if (roleError) {
        await supabaseAdmin.auth.admin.deleteUser(userId)
        return new Response(JSON.stringify({ error: `Erro ao atribuir role: ${roleError.message}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ success: true, userId }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'update_role') {
      const { user_id, role } = body
      if (!user_id || !role || !['admin', 'analista', 'consulta'].includes(role)) {
        return new Response(JSON.stringify({ error: 'user_id e role válida são obrigatórios' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { error } = await supabaseAdmin
        .from('user_roles')
        .update({ role })
        .eq('user_id', user_id)

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'toggle_active') {
      const { user_id, is_active } = body
      if (!user_id || typeof is_active !== 'boolean') {
        return new Response(JSON.stringify({ error: 'user_id e is_active são obrigatórios' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', user_id)

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'list') {
      const { data: profiles, error } = await supabaseAdmin
        .from('profiles')
        .select('id, username, email, full_name, is_active, created_at')
        .order('created_at', { ascending: true })

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Get roles
      const { data: roles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id, role')

      const roleMap = new Map<string, string>()
      for (const r of roles || []) {
        roleMap.set(r.user_id, r.role)
      }

      const users = (profiles || []).map(p => ({
        ...p,
        role: roleMap.get(p.id) || 'consulta',
      }))

      return new Response(JSON.stringify({ users }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
