# RPG Compendium & VTT / Compêndio de RPG & Tabletop

**[PT-BR]** Aplicação web local (zero dependências externas) para centralizar campanhas de RPG de mesa (D&D 2024, D&D 2014, Modo Fatal, Old-School/3.5e ou sistemas customizados via Mods): fichas de monstros, NPCs, itens, personagens, mapas interativos, rolador universal de dados, combate tático e Tabletop VTT multiplayer para até 8 jogadores.

**[EN]** Zero-dependency local web application to centralize tabletop RPG campaigns (D&D 2024, D&D 2014, Gritty/Fatal Homebrew, Old-School/3.5e, or custom systems via Mods): monster stat blocks, NPCs, items, characters, interactive maps, universal dice engine, tactical combat tracker, and multiplayer VTT for up to 8 players.

---

## ⚙️ Requisitos e Tecnologias / Requirements & Tech Stack

| Componente / Component | Tecnologia / Technology | Observação / Note |
| :--- | :--- | :--- |
| **Frontend** | HTML5, CSS3 (`public/css/compendio.css`), Vanilla JS (`public/js/*.js`) | Zero bibliotecas externas / Zero external libraries |
| **Servidor Principal / Main Server** | **Node.js** (`>= 18.x`) | Usa apenas módulos nativos (`http`, `fs`, `path`) + **SSE Real-Time** (`/api/events`) |
| **Modo Janela de App / App Mode** | **Microsoft Edge** + **PowerShell** | Abre o Compêndio como aplicativo dedicado no Windows |
| **Alternativas / Alternatives** | **PowerShell 5.1+** ou **Docker** | Funciona mesmo sem Node.js (`server.ps1` ou `docker compose`) |

---

## 🚀 Principais Funcionalidades (PT-BR)

1. **⚙️ Motor de Regras Configurável & Sistema de Mods (`public/js/rules-mods.js`):**
   - Alterne com 1 clique entre **D&D 2024 (5.5e)**, **D&D 2014 (5e Clássico)**, **Modo Fatal 5.5e**, **Old-School / 3.5e** ou personalize regras de Crítico (`Dobrar Dados`, `Máximo + Rolagem`, `Total x2`), Exaustão, Descansos e Geometria de Grade (`1-1-1`, `5-10-5` ou `Euclidiana`).
   - Suporte nativo a **Mods (`.json` / `.js`)** via `window.CompendioModAPI` e descoberta automática na pasta `public/mods/`.
2. **🎲 Motor Universal de Dados & Statblocks Clicáveis (`public/js/dice-engine.js`):**
   - Bandeja flutuante com **Normal / Vantagem / Desvantagem / Crítico / Rolagem Oculta do GM** e histórico compartilhado em tempo real.
   - Todas as fichas 5etools (`{@hit}`, `{@dice}`, `{@damage}`), atributos, perícias e salvaguardas são botões clicáveis que rolam direto no log e permitem aplicar **-Dano / +Cura** com 1 clique.
3. **🔮 Runa de Combate, Iniciativa & Dados de Vida Unificados (`public/js/combat-sync.js`):**
   - Fila de Iniciativa ordenada automaticamente, contador de Rodadas, destaque luminoso do combatente ativo no Card e no Token do Tabletop, e botão **👑 Elite** (+50% PV, +2 CA).
   - Sincronização bidirecional instantânea de PV entre **Card da Runa ↔ Token do Tabletop ↔ Ficha de Personagem ↔ Dados de Vida**.
4. **🛡️ Ficha de Personagem Avançada (`public/js/character-vtt.js`):**
   - Importação universal (`.json` 5etools/Foundry/D&D Beyond, `.pdf`, `.html`), rolagens em 1 clique, **Salvaguardas contra a Morte**, **Inspiração**, **Exaustão**, **Espaços de Magia (1º ao 9º círculo)**, **Recursos de Classe/Mods** e **PV Temporário**.
5. **🗺️ Tabletop 2D Tático & Multiplayer Real-Time (`public/js/character-vtt.js`, `public/js/net-realtime.js`):**
   - Tokens com tamanho em grade (`1x1` a `4x4`), **Régua Tática** (arraste com botão direito), **Templates de Área (AoE)** arrastáveis, **Névoa de Guerra (Fog of War)** do Mestre e **Ping Visual** (`Alt + Clique`).
   - Sincronização em tempo real via **Server-Sent Events (`/api/events`)** e deltas cirúrgicos para até 8 jogadores na rede local/VPN.

---

## Como Executar

- **Modo App no Windows (Recomendado):** Dê dois cliques em `Iniciar Compendio.vbs`.
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

---

## 🛡️ Privacidade, Licenças, Autoria e Segurança / Privacy, Licenses & Legal

Este projeto adota os princípios de **Privacidade por Padrão (*Privacy-by-Design*)**, **Execução 100% Local (*Local-First*)**, **Zero Telemetria** e **Autoria Coletiva Pseudônima** para proteger tanto os dados dos jogadores quanto a identidade dos criadores e colaboradores:

- 📄 **[`LICENSE`](LICENSE)** — Código-fonte e motor da aplicação licenciados sob a **Licença MIT** (`Copyright (c) 2026 RPG Compendium Contributors`), fornecidos *"COMO ESTÃO" ("AS IS")* sem garantias.
- 🛡️ **[`PRIVACY.md`](PRIVACY.md)** — **Política de Privacidade e Soberania de Dados (LGPD / GDPR)**: Zero coleta externa, zero rastreadores, armazenamento 100% local no dispositivo do usuário e exclusão instantânea (`💀 Expurgar`).
- ⚖️ **[`NOTICE.md`](NOTICE.md)** — **Avisos de Direitos Autorais e Propriedade Intelectual de RPG**: Atribuição oficial do **SRD 5.1 sob Creative Commons (`CC-BY-4.0`)**, Política de Conteúdo de Fãs (*Fan Content Policy*) e separação entre o motor de software e conteúdos importados localmente pelo usuário.
- 👥 **[`AUTHORS.md`](AUTHORS.md)** — **Declaração de Autoria Coletiva & Preservação de Identidade**: Proteção da privacidade dos criadores e colaboradores sem exposição de dados civis (PII).
- 🤝 **[`CONTRIBUTING.md`](CONTRIBUTING.md)** — **Guia de Contribuição Segura**: Como contribuir usando pseudônimo e e-mail `noreply` no Git, evitando vazamento de caminhos locais, metadados EXIF ou sessões privadas.
- 🔒 **[`SECURITY.md`](SECURITY.md)** — **Política de Segurança**: Boas práticas para hospedagem multiplayer em rede local (LAN) ou VPN privada (Tailscale, ZeroTier, Radmin VPN).

