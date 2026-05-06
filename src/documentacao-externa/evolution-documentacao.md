# Evolution API v2 — Referência Prática

> **Base URL:** `http://sistemas-externos-evolution-api.wxvjid.easypanel.host`  
> **Versão instalada:** 2.3.7  
> **Docs oficiais:** https://doc.evolution-api.com/v2/en/  

---

## Headers obrigatórios em todas as requisições

```
Content-Type: application/json
apikey: SUA_API_KEY_GLOBAL
```

A `apikey` é a chave definida no `.env` da instância (`API_KEY` ou `AUTHENTICATION_API_KEY`).

---

## 1. Instâncias

### Criar instância (com Chatwoot)

`POST /instance/create`

```json
{
  "instanceName": "fadas_whatsapp",
  "qrcode": true,
  "integration": "WHATSAPP-BAILEYS",
  "chatwootAccountId": "2",
  "chatwootToken": "VXwPyWFTkwyAXz4dcbfqCv9A",
  "chatwootUrl": "https://sistemas-externos-chatwoot.wxvjid.easypanel.host",
  "chatwootSignMsg": false,
  "chatwootReopenConversation": true,
  "chatwootConversationPending": false,
  "chatwootImportContacts": true,
  "chatwootNameInbox": "fadas_whatsapp",
  "chatwootMergeBrazilContacts": true,
  "chatwootImportMessages": true,
  "chatwootDaysLimitImportMessages": 3
}
```

> ⚠️ `integration` deve ser exatamente `"WHATSAPP-BAILEYS"` (maiúsculas). Nunca `"CHATWOOT"`.  
> ⚠️ `chatwootAccountId` deve ser **string** com aspas, não número inteiro.  
> ⚠️ `chatwootUrl` sem barra `/` no final.

---

### Listar instâncias

`GET /instance/fetchInstances`

---

### Conectar / gerar QR Code

`GET /instance/connect/{instanceName}`

Retorna a URL do QR Code para escanear com o WhatsApp.

---

### Estado da conexão

`GET /instance/connectionState/{instanceName}`

Retorna: `open` (conectado), `close` (desconectado), `connecting`.

---

### Reiniciar instância

`PUT /instance/restart/{instanceName}`

---

### Deslogar instância (mantém no sistema)

`DEL /instance/logout/{instanceName}`

---

### Deletar instância

`DEL /instance/delete/{instanceName}`

---

## 2. Envio de Mensagens

> Todas as rotas de mensagem usam `{instanceName}` no path.

### Texto simples

`POST /message/sendText/{instanceName}`

```json
{
  "number": "5571999990000",
  "text": "Olá! Como posso ajudar?"
}
```

O número deve incluir DDI + DDD + número, sem `+` ou espaços.

---

### Mídia (imagem, vídeo, documento)

`POST /message/sendMedia/{instanceName}`

```json
{
  "number": "5571999990000",
  "mediatype": "image",
  "mimetype": "image/jpeg",
  "caption": "Legenda da imagem",
  "media": "https://url-da-imagem.com/foto.jpg"
}
```

`mediatype` pode ser: `image`, `video`, `document`, `audio`.

---

### Áudio (mensagem de voz)

`POST /message/sendWhatsAppAudio/{instanceName}`

```json
{
  "number": "5571999990000",
  "audio": "https://url-do-audio.com/audio.mp3",
  "encoding": true
}
```

---

### Localização

`POST /message/sendLocation/{instanceName}`

```json
{
  "number": "5571999990000",
  "name": "Fadas do Bem",
  "address": "Salvador, BA",
  "latitude": -12.9714,
  "longitude": -38.5014
}
```

---

### Reação a mensagem

`POST /message/sendReaction/{instanceName}`

```json
{
  "key": {
    "remoteJid": "5571999990000@s.whatsapp.net",
    "fromMe": false,
    "id": "ID_DA_MENSAGEM"
  },
  "reaction": "👍"
}
```

---

## 3. Webhook

### Configurar webhook

`POST /webhook/set/{instanceName}`

```json
{
  "url": "https://seu-sistema.com/webhook/whatsapp",
  "webhook_by_events": false,
  "webhook_base64": false,
  "events": [
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "SEND_MESSAGE",
    "CONNECTION_UPDATE",
    "CALL"
  ]
}
```

Eventos úteis:
- `MESSAGES_UPSERT` — nova mensagem recebida
- `MESSAGES_UPDATE` — status de entrega atualizado
- `CONNECTION_UPDATE` — mudança no estado da conexão
- `QRCODE_UPDATED` — QR Code atualizado

---

### Consultar webhook

`GET /webhook/find/{instanceName}`

---

## 4. Integração com Chatwoot (instância já criada)

### Configurar ou atualizar Chatwoot

`POST /chatwoot/set/{instanceName}`

```json
{
  "enabled": true,
  "accountId": "2",
  "token": "VXwPyWFTkwyAXz4dcbfqCv9A",
  "url": "https://sistemas-externos-chatwoot.wxvjid.easypanel.host",
  "signMsg": false,
  "reopenConversation": true,
  "conversationPending": false,
  "nameInbox": "fadas_whatsapp",
  "mergeBrazilContacts": true,
  "importContacts": true,
  "importMessages": true,
  "daysLimitImportMessages": 3,
  "autoCreate": true
}
```

### Consultar config do Chatwoot

`GET /chatwoot/find/{instanceName}`

---

## 5. Contatos e Chats

### Verificar se número tem WhatsApp

`POST /chat/whatsappNumbers/{instanceName}`

```json
{
  "numbers": ["5571999990000", "5511988880000"]
}
```

---

### Buscar contatos

`POST /chat/findContacts/{instanceName}`

```json
{
  "where": { "id": "5571999990000@s.whatsapp.net" }
}
```

---

### Buscar mensagens

`POST /chat/findMessages/{instanceName}`

```json
{
  "where": {
    "key": { "remoteJid": "5571999990000@s.whatsapp.net" }
  },
  "limit": 20
}
```

---

## 6. Configurações da Instância

### Definir configurações

`POST /settings/set/{instanceName}`

```json
{
  "rejectCall": true,
  "msgCall": "No momento não consigo atender chamadas.",
  "groupsIgnore": false,
  "alwaysOnline": true,
  "readMessages": false,
  "readStatus": false
}
```

---

## Fluxo de uso básico

1. `POST /instance/create` — cria instância com Chatwoot configurado
2. `GET /instance/connect/{instanceName}` — obtém QR Code
3. Escaneia o QR Code com o WhatsApp do número desejado
4. `GET /instance/connectionState/{instanceName}` — confirma que `state: "open"`
5. O inbox aparece automaticamente no Chatwoot (se `autoCreate: true`)
6. `POST /message/sendText/{instanceName}` — envia mensagens

---

## Notas importantes

- Números no formato: `5571999990000` (DDI + DDD + número, sem `+`)
- JIDs individuais: `55719999900000@s.whatsapp.net`
- JIDs de grupo: `120363XXXXXXXXX@g.us`
- A Evolution API reinicia automaticamente a conexão quando o contêiner é reiniciado
- Logs ficam em `/instance/{instanceName}` e podem ser monitorados pelo Manager em `/manager`