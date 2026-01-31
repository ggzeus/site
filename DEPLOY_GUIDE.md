# Guia de Deploy - Sem Firebase Storage

## ✅ Solução Implementada

O sistema agora armazena fotos de perfil **diretamente no Firestore** com compressão automática, **sem necessidade de Firebase Storage**.

---

## 🚀 Configuração de Produção (Simples!)

### 1. Configurar URL do Backend

**Arquivo**: `script.js` (linha 6)

Substitua pela URL real do seu backend em produção:

```javascript
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : 'https://SEU-BACKEND-AQUI.discloud.app'; // ⬅️ COLOQUE A URL REAL AQUI
```

**Exemplos por plataforma:**
- **Discloud**: `https://seu-app.discloud.app`
- **Render**: `https://seu-app.onrender.com`
- **Railway**: `https://seu-app.railway.app`
- **Heroku**: `https://seu-app.herokuapp.com`

---

## 📋 Checklist de Deploy

### Backend

- [ ] Fazer push do código para seu host (Discloud/Render/etc)
- [ ] Verificar que `firebase-service-account.json` está incluído
- [ ] Anotar a URL do backend

### Frontend  

- [ ] Abrir `script.js`
- [ ] Atualizar a URL do backend na linha 6
- [ ] Fazer deploy (Netlify/Vercel/etc)

### Testes

- [ ] Acessar site em produção
- [ ] Fazer login (deve funcionar sem "Erro de conexão")
- [ ] Ir em Configurações → Perfil
- [ ] Fazer upload de uma foto
- [ ] Logout e login novamente
- [ ] Abrir em outro dispositivo/navegador
- [ ] **Foto deve carregar!** ✅

---

## 🧪 Como Testar Localmente

```bash
# Iniciar servidor
node server.js

# Acessar em: http://localhost:3000

# Fazer login e ir em Configurações → Perfil
# Fazer upload de uma foto grande (ex: 5MB)
# Sistema comprime automaticamente!
# Clicar em "Salvar Alterações"
```

**O que observar:**
- Notificação "Comprimindo imagem..." (se foto > 800KB)
- Notificação "Imagem otimizada! (X MB)"
- Preview da foto aparece imediatamente
- Após salvar, foto deve aparecer no menu superior

---

## ✅ Verificar se Funcionou

### 1. Verificar Compressão

Abra o Console do navegador (F12) e veja:
```
Imagem original: 4.52 MB
Imagem comprimida: 0.65 MB
```

### 2. Verificar Firestore

Acesse Firebase Console:
1. Vá em **Firestore Database**
2. Coleção `users`
3. Encontre seu usuário
4. Campo `profile_pic` deve ter valor longo começando com `data:image/jpeg;base64,`

### 3. Verificar em Outro Dispositivo

- Abra o site em outro celular/computador
- Faça login
- Foto deve aparecer! ✅

---

## 🔧 Solução de Problemas

### "Erro de conexão" ao fazer login

**Causa**: URL do backend não configurada

**Solução**:
1. Abra `script.js`, linha 6
2. Cole a URL **exata** do backend (sem barra final)
3. Exemplo correto: `https://seu-app.discloud.app`
4. Exemplo **incorreto**: `https://seu-app.discloud.app/`

### "Imagem muito grande mesmo após compressão"

**Causa**: Imagem extremamente grande (raro)

**Solução**:
- Use uma ferramenta online para comprimir antes (ex: tinypng.com)
- Ou tire um screenshot da imagem e use o screenshot

### Foto não aparece após salvar

**Causa 1**: Erro na compressão

**Solução**: Verifique Console do navegador (F12) para erros

**Causa 2**: Firestore offline

**Solução**: Verifique Firebase Console se está funcionando

---

## 💡 Dicas

### Tamanho Ideal de Fotos

- **Recomendado**: 500x500px a 1000x1000px
- **Formato**: JPG ou PNG
- **Tamanho**: Qualquer (sistema comprime automaticamente)

### Compressão Automática

O sistema **sempre** comprime fotos maiores que 800KB:
- Redimensiona para máximo 800x800px
- Converte para JPEG
- Ajusta qualidade (70% ou menor se necessário)
- Resultado final: 300-700KB típico

### Sem Firebase Storage!

Essa solução **não usa Firebase Storage**, então:
- ✅ Zero configuração na Firebase Console
- ✅ Sem custos adicionais
- ✅ Plano gratuito funciona perfeitamente

---

## 📊 Limites do Sistema

### Firestore (Plano Gratuito)

- **Armazenamento**: 1GB total
- **Foto média**: ~500KB
- **Capacidade**: ~2000 usuários com fotos

Para 2000+ usuários, considerar:
- Firebase Storage (se justificar upgrade)
- Serviço externo gratuito (ImgBB, Cloudinary)

### Foto por Usuário

- **Tamanho máximo**: ~900KB (validado pelo backend)
- **Resolução máxima**: 800x800px (compressão automática)
- **Formato final**: JPEG

---

## 🎯 Resumo

**Configuração necessária:**
1. Adicionar URL do backend em `script.js` ← **SÓ ISSO!**

**Não precisa:**
- ❌ Ativar Firebase Storage
- ❌ Configurar regras de Storage
- ❌ Migrar fotos antigas
- ❌ Upgrade de plano

**Resultado:**
- ✅ Fotos funcionam em todos os dispositivos
- ✅ Compressão automática inteligente
- ✅ Deploy simples
- ✅ Zero custos adicionais

---

## 📞 Suporte

Se encontrar problemas:

1. **Console do navegador** (F12 → Console): Veja erros no frontend
2. **Logs do servidor**: Veja erros no backend
3. **Firebase Console → Firestore**: Verifique se dados estão sendo salvos  
4. **Teste local primeiro**: Sempre teste em `localhost` antes de fazer deploy

---

**Pronto para fazer deploy! 🚀**
