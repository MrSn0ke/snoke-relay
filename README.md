# TikFinity → Website Relay

A tiny Node/Express + Socket.io relay to forward TikFinity LIVE events to your website.

## Deploy
- Railway/Render/Fly/Heroku/Any Node host.
- Create environment variable: `WEBHOOK_SECRET`.
- Expose `POST /webhooks/tikfinity`, keep the secret header.

## TikFinity side
- From the PC running TikFinity, send a POST for each LIVE event to:
  `https://<your-relay>/webhooks/tikfinity`
  with header: `x-webhook-secret: <WEBHOOK_SECRET>` and the event JSON body.

## Website side
- Include Socket.io client and connect to `NEXT_PUBLIC_RELAY_URL` or your relay URL.
- Render widgets using /public/js/live-widgets.js and /public/css/live-widgets.css.

## Event shape
```json
{ "type": "gift|follow|like|chat|goal_update|live_status",
  "user": { "id": "123", "name": "Noa", "avatar": "https://..." },
  "payload": { /* event-specific */ },
  "ts": 1723111111000 }
```
