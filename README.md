# flow.planner

> Sistema pessoal de frequência acadêmica e agenda semanal — leve, offline-first e de código aberto.

![PWA](https://img.shields.io/badge/PWA-ready-7c3aed?style=flat-square)
![License](https://img.shields.io/badge/licença-MIT-2563eb?style=flat-square)
![HTML](https://img.shields.io/badge/stack-HTML%20%2F%20CSS%20%2F%20JS-f59e0b?style=flat-square)

---

## ✨ O que é

O **flow.planner** é uma aplicação web para estudantes que precisam controlar frequências, organizar a agenda semanal e gerenciar tarefas — tudo em um lugar só. Funciona direto no navegador, sem necessidade de instalação, e pode ser adicionado à tela inicial como um app nativo (PWA).

---

## 🚀 Funcionalidades

| Recurso | Descrição |
|---|---|
| 📅 **Agenda semanal** | Visualize aulas e eventos por semana com navegação por teclado (`←` `→`) |
| ✅ **Controle de frequência** | Marque presença em cada aula e acompanhe o percentual por disciplina |
| 📝 **Disciplinas** | Cadastre matérias com horários, local, turma, semestre e cor personalizada |
| ⏱ **Tarefas e tópicos** | Listas de tarefas e tópicos de estudo integradas ao app |
| 📤 **Exportar / Importar** | Faça backup dos seus dados em planilha `.xlsx` |
| 🔗 **Sincronização em nuvem** | Login opcional via Supabase para sincronizar entre dispositivos |
| 🔌 **Offline-first** | Todos os dados ficam no dispositivo (localStorage/IndexedDB); a nuvem é opcional |
| 🌙 **Tema claro/escuro** | Alterna automaticamente pelo sistema operacional ou manualmente |
| 📲 **PWA instalável** | Adicione à tela inicial no iOS, Android ou desktop |

---

## 🗂 Estrutura do projeto

```
flow.planner/
├── index.html          # App principal (agenda + frequência + anotações)
├── login.html          # Tela de entrada (convidado ou conta)
├── como-funciona.html  # Documentação completa do sistema
├── sobre.html          # Sobre o projeto
├── status.html         # Status dos serviços em tempo real
├── contato.html        # Formulário de contato
├── termos.html         # Termos de uso
├── privacidade.html    # Política de privacidade
├── style.css           # Estilos globais (tema, componentes, login)
├── app.js              # Lógica principal do app
├── db.js               # Camada de persistência (localStorage + Supabase) — ver assets/js/modules/supabase.js
├── sw.js               # Service Worker (cache offline)
└── manifest.json       # Manifesto PWA
```

---

## 🛠 Como usar

### Sem conta (modo convidado)

1. Acesse o app em [joaoclaudiano.github.io/planner](https://joaoclaudiano.github.io/planner/)
2. Na tela de login, clique em **Entrar** sem preencher e-mail ou senha
3. Todos os dados ficam salvos no seu navegador

### Com conta (sincronização em nuvem)

1. Clique em **criar conta** na tela de login
2. Informe seu e-mail para receber um link mágico (sem senha!)
3. Confirme o acesso pelo e-mail e comece a usar com sincronização automática

### Instalar como PWA

- **Chrome/Edge (desktop):** ícone de instalar na barra de endereços
- **iOS (Safari):** menu *Compartilhar* → *Adicionar à Tela Inicial*
- **Android (Chrome):** menu *⋮* → *Adicionar à tela inicial*

---

## ⚙️ Configuração local

O projeto é 100% estático — não há build, nem servidor necessário.

```bash
# Clone o repositório
git clone https://github.com/JoaoClaudiano/planner.git
cd planner

# Sirva localmente com qualquer servidor HTTP estático, ex:
npx serve .
# ou
python3 -m http.server 8080
```

Acesse `http://localhost:8080` no navegador.

### Variáveis do Supabase

Para habilitar sincronização em nuvem, substitua as constantes em `login.html`:

```js
const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_KEY = 'sua_chave_anon_publica';
```

As mesmas constantes precisam ser atualizadas em `assets/js/modules/config.js`.

### ⚠️ Configuração do Supabase para autenticação Google (OAuth)

Se o usuário for redirecionado para `localhost` após fazer login com Google em produção, o problema é a configuração da **URL do site** no painel do Supabase.

Acesse **Supabase Dashboard → Authentication → URL Configuration** e configure:

| Campo | Valor |
|-------|-------|
| **Site URL** | `https://SEU_USUARIO.github.io/planner/` |
| **Redirect URLs** | `https://SEU_USUARIO.github.io/planner/**` |

> O `redirectTo` passado no código usa a URL base do app (ex.: `https://joaoclaudiano.github.io/planner/`). Ela precisa corresponder exatamente ao **Site URL** configurado no Supabase — caso contrário, o Supabase ignora o redirecionamento e usa o valor padrão (geralmente `localhost:3000` do ambiente de desenvolvimento).

---

## 🧱 Stack

- **HTML5 / CSS3 / JavaScript (Vanilla)** — sem frameworks
- **[Supabase](https://supabase.com/)** — backend opcional (auth + banco de dados)
- **[SheetJS](https://sheetjs.com/)** — exportação/importação de planilhas `.xlsx`
- **[Space Grotesk & Space Mono](https://fonts.google.com/)** — tipografia via Google Fonts
- **Service Worker** — cache offline e comportamento de app nativo

---

## 🔒 Privacidade

- **Modo convidado:** nenhum dado é enviado a servidores externos. Tudo fica no dispositivo.
- **Modo conta:** os dados são sincronizados com o Supabase sob sua conta pessoal.
- Consulte a [política de privacidade](privacidade.html) para mais detalhes.

---

## 📄 Licença

MIT © 2024–<span id="y"></span> [JoaoClaudiano](https://github.com/JoaoClaudiano)

---

*flow.planner · todos os direitos reservados*
