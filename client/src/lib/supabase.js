import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://lishkggqvlgnxgkwhsgz.supabase.co',
  'sb_publishable_GEpqTKGI8w4slC4mCIzLCA_KADwc58s'
)

export function getImageUrl(path) {
  if (!path) return null
  return supabase.storage.from('recipe-images').getPublicUrl(path).data.publicUrl
}
