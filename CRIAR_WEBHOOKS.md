# Como Criar Webhooks do Discord - Guia Rápido

## IDs dos Canais Fornecidos

Você forneceu os seguintes IDs:
- logs-inject: `1467189259193684010`
- logs-application: `1467189372490219625`
- logs-chat: `1467189407391023347`
- logs-ticket: `1467189423304085545`
- logs-rewardkey: `1467189452349903052`
- logs-verificação: `1467189793120194703`
- logs-apps: `1467222949336711290`
- applications: `1467189494552985815`
- inject: `1467189520134045953`
- api-called: `1467189852964655289`

## Passo a Passo para Criar Webhooks

### Método 1: Via Interface do Discord

1. Abra o Discord e vá para o servidor "Scarlet - Logs"
2. Para cada canal acima:
   - Clique com botão direito no canal → **Editar Canal**
   - Vá em **Integrações** → **Webhooks**
   - Clique em **Novo Webhook** (ou **Create Webhook**)
   - Dê um nome (ex: "Scarlet Logger")
   - Clique em **Copiar URL do Webhook**
   - **SALVE ESSA URL** em um bloco de notas

### Método 2: Via Discord Developer Portal (Mais Rápido)

Se você tiver permissões de administrador, pode usar a API do Discord para criar todos de uma vez. Mas o Método 1 é mais simples.

## Formato da URL do Webhook

A URL deve ter este formato:
```
https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN
```

Exemplo (NÃO use este, é só exemplo):
```
https://discord.com/api/webhooks/1234567890/SEU_TOKEN_AQUI
```

## Depois de Criar

Quando tiver todas as 10 URLs, **me envie aqui** e eu atualizarei o arquivo `discord-logger.js` automaticamente!

Me envie no formato:
```
logs-inject: https://discord.com/api/webhooks/...
logs-application: https://discord.com/api/webhooks/...
logs-chat: https://discord.com/api/webhooks/...
logs-ticket: https://discord.com/api/webhooks/...
logs-rewardkey: https://discord.com/api/webhooks/...
logs-verificação: https://discord.com/api/webhooks/...
logs-apps: https://discord.com/api/webhooks/...
applications: https://discord.com/api/webhooks/...
inject: https://discord.com/api/webhooks/...
api-called: https://discord.com/api/webhooks/...
```
