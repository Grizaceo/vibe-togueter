// Kick chat source — estado real de la API (verificado 2026-11-01):
//
// OFICIAL: Kick Events API webhook. App en kick.com → Developer → webhooks →
//   https://<tu-tunnel>/webhook/kick + suscripción a chat.message.sent para el
//   canal (app token + broadcaster_user_id). server.js verifica la firma RSA
//   (GET /public/v1/public-key) antes de aceptar eventos.
//   Setup: node scripts/kick-subscribe.mjs --token <app_token> --user <broadcaster_user_id>
//
// NO-OFICIAL (MUERTA): Kick abandonó el cloud Pusher — la key pública
//   (32cbd69e4b950bf97679, ws-us2) ahora responde 4001 "not in this cluster" en
//   todos los clusters. El gateway actual wss://websockets.kick.com/viewer/v1/connect
//   exige token de sesión single-use obtenido con cookies de navegador +
//   X-CLIENT-TOKEN, Cloudflare-bloqueado fuera del browser. No es viable
//   server-side sin automatización de navegador (rompería ToS y es frágil).
//
// Para enviar mensajes (respuestas del bot): POST https://api.kick.com/public/v1/chat
//   con user token scope chat:write (OAuth PKCE del broadcaster o bot account).

export async function sendKickChat({ accessToken, broadcasterUserId, content, type = 'user' }) {
  const res = await fetch('https://api.kick.com/public/v1/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(type === 'bot' ? { type: 'bot', content } : { type: 'user', broadcaster_user_id: broadcasterUserId, content }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`kick chat send ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  return res.json().catch(() => ({}));
}
