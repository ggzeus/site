# Configuração dos Webhooks do Discord

Este arquivo contém as instruções para configurar os webhooks do Discord para o sistema de logs.

## Como Obter URLs de Webhook

1. Acesse o servidor Discord "Scarlet - Logs"
2. Para cada canal listado abaixo, clique com o botão direito > **Editar Canal**
3. Vá em **Integrações** > **Webhooks** > **Novo Webhook**
4. Dê um nome ao webhook (ex: "Scarlet Logger")
5. Copie a URL do webhook

## Canais e Webhooks Necessários

### LOGS (Categoria Normal)
- **#logs-inject**: Logs de login de Loader (Auth API)
- **#logs-application**: Acesso à aba Applications
- **#logs-chat**: Mensagens de chat e posts no Feed  
- **#logs-ticket**: Logs de tickets (não implementado ainda)
- **#logs-rewardkey**: Resgate de licenças/instalação
- **#logs-verificação**: Vinculação de contas Discord
- **#logs-apps**: Gerenciamento de keys (criar, resgatar, deletar)

### LOGS SUSPEITAS
- **#applications**: Acesso ilegal/suspeito à aba Applications
- **#inject**: Suspeitas de crack ou SQL Injection

### LOGS APIS
- **#api-called**: Todas as chamadas de API

## Onde Configurar

Depois de obter todas as URLs, edite o arquivo:
```
c:\Users\User\Downloads\site-main\site-main\discord-logger.js
```

Na seção `DISCORD_WEBHOOKS` (linhas 11-28), substitua `'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN'` pelas URLs reais.

### Exemplo:
```javascript
const DISCORD_WEBHOOKS = {
    'logs-inject': 'https://discord.com/api/webhooks/1234567890/AbCdEfGhIjKlMnOpQrStUvWxYz',
    'logs-application': 'https://discord.com/api/webhooks/0987654321/ZyXwVuTsRqPoNmLkJiHgFeDcBa',
    // ... etc
};
```

## Verificação

Após configurar, reinicie o servidor:
```bash
# Pare o servidor atual (Ctrl+C no terminal)
npm start
```

## Teste

Para testar se os webhooks estão funcionando:

1. **logs-chat**: Envie uma mensagem no chat do site
2. **logs-inject**: Execute um login através do Loader
3. **logs-apps**: Crie uma nova key em Applications
4. **logs-verificação**: Vincule uma conta do Discord
5. **api-called**: Faça qualquer chamada de API

Verifique nos canais do Discord se os logs aparecem corretamente.

## Troubleshooting

- Se os webhooks não estiverem funcionando, verifique os logs do console do servidor
- Procure por mensagens `[DISCORD-LOG]` no console
- Se aparecer "webhook_not_configured", significa que a URL ainda não foi configurada
