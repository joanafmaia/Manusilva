/**
 * Gera um par de chaves VAPID para Web Push (avisos com a PWA fechada).
 *
 * Uso (uma vez):
 *   npm run vapid:keys
 *
 * Cole o output nas Variables da Railway. Não commits as chaves.
 */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log(`
Web Push (VAPID) — cole na Railway → Variables:

VAPID_PUBLIC_KEY=${keys.publicKey}
VAPID_PRIVATE_KEY=${keys.privateKey}
VAPID_SUBJECT=mailto:manusilva.lda@gmail.com

Não partilhe a chave privada. Depois de gravar, faça redeploy.
Também execute no Supabase SQL Editor: pwa/supabase/migrations/043_push_subscriptions.sql
`);
