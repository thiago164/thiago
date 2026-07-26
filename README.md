# PostFlow — Automação de Postagens (protótipo)

Clone funcional inspirado na proposta do MeuSacoTools: cadastro/login, contas do
Instagram com janela de horário e vídeos/dia, upload em lote com legendas e
ciclos, agendamento automático e um "publicador" simulado que marca os vídeos
como postados/erro quando chega a hora (sem integração real com a API do
Instagram — isso fica como próximo passo).

## Rodando localmente

```bash
npm install
npm start
```

Acesse http://localhost:3000. O primeiro usuário que criar conta vira admin
automaticamente.

Os dados ficam em `data/db.json` (criado sozinho) e os vídeos enviados em
`uploads/`.

## Deploy no Railway — passo a passo

1. **Suba o projeto pro GitHub**
   ```bash
   git init
   git add .
   git commit -m "primeiro commit"
   ```
   Crie um repositório vazio no GitHub e depois:
   ```bash
   git remote add origin <url-do-seu-repo>
   git branch -M main
   git push -u origin main
   ```

2. **Crie o projeto no Railway**
   - Entre em https://railway.app e faça login (dá pra usar sua conta GitHub).
   - Clique em "New Project" → "Deploy from GitHub repo".
   - Autorize o Railway a acessar seus repositórios e selecione este.

3. **Configure variáveis de ambiente**
   No painel do serviço, aba "Variables", adicione:
   - `JWT_SECRET` → uma string aleatória longa (ex: gere com `openssl rand -hex 32`)
   - O Railway já define `PORT` sozinho — o servidor já lê `process.env.PORT`.

4. **Build e start**
   O Railway detecta automaticamente que é um projeto Node (pelo `package.json`)
   e roda `npm install` seguido de `npm start`. Não precisa configurar nada a mais.

5. **Domínio público**
   Na aba "Settings" do serviço, clique em "Generate Domain" para receber uma
   URL pública tipo `seuprojeto.up.railway.app`.

6. **Atenção ao armazenamento**
   O sistema de arquivos do Railway é efêmero: a cada novo deploy, `data/db.json`
   e os vídeos em `uploads/` podem ser apagados. Para produção de verdade, troque
   por:
   - Um banco gerenciado (Railway oferece Postgres com um clique) no lugar do
     `db.json`.
   - Um bucket S3-compatível (Cloudflare R2, Backblaze B2) para os vídeos, no
     lugar da pasta local `uploads/`.

## O que eu expandiria primeiro

1. **Banco de dados de verdade (Postgres)** — o `db.json` é ótimo pra
   prototipar, mas não aguenta escrita concorrente nem sobrevive a redeploys.
   Troque por Postgres (Railway já oferece) usando algo simples como `pg` ou
   Prisma.
2. **Armazenamento de vídeo em object storage (R2/S3)** — hoje os vídeos vão
   para o disco local, que é o maior risco de perda de dados no Railway.
3. **Integração real com a API do Instagram (Graph API)** — o "publicador" hoje
   só simula sucesso/erro. O próximo passo de verdade é trocar o
   `setInterval` do `server.js` por chamadas reais à Graph API da Meta,
   usando o access token cadastrado em cada conta.
4. **Fila de jobs (BullMQ + Redis)** em vez de `setInterval` — mais robusto
   para volume alto e para não perder jobs se o servidor reiniciar.
5. **Multi-tenant mais forte** — hoje cada usuário só vê os próprios dados,
   o que já está certo, mas vale adicionar limites de plano (quantas contas,
   quantos vídeos/mês) se isso virar um SaaS pago.
