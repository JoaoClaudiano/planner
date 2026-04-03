# Changelog

Todas as mudanças notáveis neste projeto serão documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [Não lançado]

### Adicionado
- `manifest.json`: atalhos de app (`shortcuts`) para Agenda semanal e Frequência
- `CHANGELOG.md`: registro de alterações do projeto
- Comentários de configuração em `config.js` documentando como usar instância própria do Supabase

### Alterado
- Chip de faltas movido do cabeçalho para abaixo do calendário, ao lado das dicas de interação
- `supabase.js`: erros de sincronização exibem toast visual em vez de apenas `console.error`
- Todos os `console.error` / `console.warn` removidos do código de produção
- Acessibilidade: todos os `<label>` de formulários agora possuem atributo `for` associado ao campo correspondente

---

## [v6] — Service Worker v6 (mobile UX)

### Adicionado
- Melhorias de UX mobile: chips do cabeçalho expansíveis, correções de sobreposição do rodapé, suporte a `safe-area-inset`

## [v5] — Splash screen com vaga-lumes

### Adicionado
- Animação de vaga-lumes aprimorada na tela de splash

## [v4 e anteriores]

- Funcionalidades principais: agenda semanal com drag-and-drop, controle de frequência por disciplina, tarefas e tópicos de estudo, sincronização offline via IndexedDB, autenticação com Supabase (e-mail/senha + Google OAuth), modo claro/escuro, tour de boas-vindas, geofencing de campus, exportação/importação XLSX
