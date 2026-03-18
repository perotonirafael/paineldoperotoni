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
  if (!origin) {
    return EXACT_ALLOWED_ORIGINS[0]
  }

  if (EXACT_ALLOWED_ORIGINS.includes(origin)) {
    return origin
  }

  if (ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) {
    return origin
  }

  return EXACT_ALLOWED_ORIGINS[0]
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = resolveAllowedOrigin(origin)

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: 'Usuário e senha são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('email, is_active')
      .eq('username', username.trim())
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'Usuário ou senha inválidos' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!profile.is_active) {
      return new Response(
        JSON.stringify({ error: 'Usuário inativo. Entre em contato com o administrador.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!profile.email) {
      return new Response(
        JSON.stringify({ error: 'Usuário ou senha inválidos' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!
    )

    const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
      email: profile.email,
      password,
    })

    if (authError || !authData.session) {
      return new Response(
        JSON.stringify({ error: 'Usuário ou senha inválidos' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        session: authData.session,
        user: authData.user,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
