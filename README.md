# RPG Compendium / Compêndio de RPG

**[PT-BR]** Aplicação web local para criar, organizar e consultar conteúdos de campanhas de RPG (D&D 5e): fichas de monstros, NPCs, itens mágicos, mapas interativos e sessões.

**[EN]** Local web application to create, organize, and browse tabletop RPG campaign content (D&D 5e): monster stat blocks, NPCs, magic items, interactive maps, and session notes.

---

## ⚙️ Requisitos e Tecnologias / Requirements & Tech Stack

| Componente / Component | Tecnologia / Technology | Observação / Note |
| :--- | :--- | :--- |
| **Frontend** | HTML5, CSS3, Vanilla JS | Zero bibliotecas externas / Zero external libraries |
| **Servidor Principal / Main Server** | **Node.js** (`>= 18.x`) | Usa apenas módulos nativos (`http`, `fs`, `path`) |
| **Modo Janela de App / App Mode** | **Microsoft Edge** + **PowerShell** | Abre o Compêndio como aplicativo dedicado no Windows |
| **Alternativas / Alternatives** | **PowerShell 5.1+** ou **Docker** | Funciona mesmo sem Node.js (`server.ps1` ou `docker compose`) |

### Instalação Rápida dos Requisitos / Quick Requirements Setup

Para verificar e baixar automaticamente o **Node.js LTS** e dependências no Windows, execute no PowerShell:
*(To automatically check and install **Node.js LTS** and dependencies on Windows, run in PowerShell:)*

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar-requisitos.ps1
```

---

## 🇧🇷 Português (Brasil)

### Como Executar

- **Modo App no Windows (Recomendado):** Dê dois cliques em `Iniciar Compendio.vbs`. O servidor iniciará oculto e abrirá o Compêndio em uma janela dedicada. Ao fechar a janela, o servidor é encerrado automaticamente.
- **Via Node.js / NPM:**
  ```bash
  npm start
  # ou: node server.js
  ```
  Acesse `http://localhost:8080`.
- **Via PowerShell (sem Node.js):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\server.ps1
  ```
- **Via Docker (somente leitura):**
  ```bash
  docker compose up -d
  ```

### Funcionalidades

- **Importação do 5etools:** Cole o JSON de monstros ou itens do 5etools e edite visualmente.
- **Criador Visual:** Crie e edite fichas de monstros, NPCs, itens mágicos, mapas (com zoom/pan) e planos de sessão diretamente pelo navegador.
- **Salvamento Local Automático:** Todas as alterações feitas pela interface são salvas diretamente na pasta `public/` e no índice `public/dados.js`.

---

## 🇺🇸 English

### How to Run

- **Windows App Mode (Recommended):** Double-click `Iniciar Compendio.vbs`. It starts the local server in the background and opens the Compendium in a dedicated app window. Closing the window automatically stops the server.
- **Using Node.js / NPM:**
  ```bash
  npm start
  # or: node server.js
  ```
  Open `http://localhost:8080`.
- **Using PowerShell (no Node.js required):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\server.ps1
  ```
- **Using Docker (read-only):**
  ```bash
  docker compose up -d
  ```

### Features

- **5etools Import:** Paste monster or item JSONs from 5etools and customize them in the visual editor.
- **Visual Creator:** Create and edit monster stat blocks, NPCs, magic items, interactive maps (zoom/pan), and session notes directly in the browser.
- **Automatic Local Save:** Changes made in the UI are saved directly to the `public/` directory and indexed in `public/dados.js`.
