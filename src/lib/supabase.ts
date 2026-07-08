import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

// Anon-key client used in the browser. RLS policies on the database are
// the security boundary for this client. Server-only operations use
// supabaseAdmin (service role) instead; never import that file from
// browser code, and never import it anywhere under app/(client).
export const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
