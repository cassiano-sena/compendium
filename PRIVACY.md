# 🛡️ Política de Privacidade e Soberania de Dados / Privacy Policy

**Última atualização / Last updated:** 2026  
**Escopo:** Aplicativo Web Local *Compêndio RPG & Tabletop VTT* (`RPG Compendium`)

---

## 1. Resumo Executivo (Princípio *Privacy-by-Design* & *Local-First*)

O **Compêndio RPG & Tabletop VTT** foi projetado desde a sua arquitetura inicial sob os princípios de **Privacidade por Padrão (*Privacy-by-Design*)**, **Execução 100% Local (*Local-First*)** e **Zero Telemetria**.

- **Nós NÃO coletamos seus dados:** Os autores e colaboradores deste projeto não possuem servidores centrais, não recolhem dados pessoais, não exigem cadastro/e-mail e não têm acesso às suas campanhas, fichas, mapas ou sessões.
- **Zero Rastreamento:** O código-fonte não contém Google Analytics, Meta Pixel, telemetria oculta, cookies de publicidade, rastreadores de terceiros ou bibliotecas externas de monitoramento.
- **Seus Dados Pertencem a Você:** Tudo o que você cria, importa ou edita permanece armazenado exclusivamente no seu próprio computador ou navegador.

---

## 2. Onde e Como os Dados dos Usuários São Armazenados

Todos os dados gerados durante o uso do aplicativo ficam sob controle físico e exclusivo do próprio usuário:

1. **Armazenamento no Navegador (`localStorage`):**
   - Fichas de personagens, cards da Runa de Combate, estado do Tabletop, histórico de dados, regras customizadas (`CompendioRules`), Mods instalados e rascunhos são salvos no armazenamento local (`localStorage`) do próprio navegador do usuário.
   - Caso você inicie o aplicativo pelo atalho `Iniciar Compendio.vbs`, o navegador roda com um perfil isolado na pasta local `perfil-app/` (que é automaticamente ignorada pelo Git via `.gitignore`).
2. **Persistência Local em Disco (`public/` e `public/dados.js`):**
   - Quando o servidor local (`server.js` em Node.js ou `server.ps1` em PowerShell) está ativo na máquina do Mestre (GM), as páginas criadas ou importadas são salvas diretamente na pasta `public/` do próprio computador do usuário.
3. **Estado de Sessão Multiplayer (`public/session-state.json`):**
   - Durante sessões multiplayer, o estado atual da mesa (posições de tokens, PV, rolagens de dados e PINs simples de perfil da mesa) é mantido apenas na memória da sessão e no arquivo local `public/session-state.json` da máquina que está hospedando a partida.

---

## 3. Funcionamento do Modo Multiplayer (Até 8 Jogadores)

- No modo multiplayer, o computador do Mestre (GM) atua como o **único servidor da sessão** (em rede local LAN ou VPN privada como Tailscale, ZeroTier, Radmin VPN ou Hamachi).
- A comunicação (via *Server-Sent Events* `/api/events` e requisições `/api/session`) ocorre **diretamente entre os navegadores dos jogadores e o computador do Mestre**, sem passar por qualquer servidor externo dos criadores do software.
- **PINs de Perfil:** O sistema de PIN disponível na barra lateral destina-se apenas a evitar cliques acidentais ou visualização involuntária de fichas entre jogadores na mesma mesa amigável. **Nunca utilize senhas reais** (como senhas bancárias, de e-mail ou redes sociais) no campo de PIN do perfil de jogo.

---

## 4. Conexões Externas Opcionais (Transparência Técnica)

O aplicativo funciona 100% offline. A única situação em que o seu navegador pode realizar uma requisição externa ocorre quando:
- Você visualiza uma ficha de monstro no formato JSON do *5etools* que **não possui imagem de token/arte salva localmente** no seu computador. Nesse caso, a tag `<img>` do seu navegador pode tentar buscar a imagem em espelhos públicos da comunidade (como `5e.tools` ou `raw.githubusercontent.com`).
- **Como operar 100% sem conexões externas:** Basta anexar seus próprios tokens/artes no Criador Visual (que são salvos localmente em Base64 ou na pasta `public/`) ou utilizar o aplicativo desconectado da internet.

---

## 5. Direitos dos Usuários e Exclusão Total de Dados (LGPD / GDPR)

Em conformidade com a **Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)** do Brasil e o **Regulamento Geral sobre a Proteção de Dados (GDPR — UE 2016/679)**:
- Como não há coleta ou processamento de dados por parte dos desenvolvedores, **o próprio usuário é o único Controlador e Operador dos seus dados locais**.
- A qualquer momento, você pode exercer controle total sobre seus dados diretamente pela interface lateral do aplicativo:
  - **Portabilidade / Exportação:** Clique em **`⬇ Backup`** ou **`⚡ Código Único`** para baixar todos os seus dados em um arquivo `.json` aberto e legível.
  - **Eliminação / Exclusão Total:** Clique no botão **`💀 Expurgar`** no rodapé da barra lateral (ou apague as pastas `perfil-app/` e `public/session-state.json` do seu computador) para remover instantaneamente todos os registros locais.

---

## 6. Proteção de Privacidade dos Autores e Colaboradores

Este projeto também protege rigorosamente a privacidade de seus criadores e colaboradores:
- Nenhuma informação pessoal identificável (PII) dos desenvolvedores é exigida ou embutida no software.
- Contribuições de código são aceitas sob pseudônimos/handles e endereços de e-mail anônimos (`noreply`), conforme documentado em [`AUTHORS.md`](AUTHORS.md) e [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## 7. English Summary (Privacy Policy)

- **100% Local-First & Zero Telemetry:** *RPG Compendium & Tabletop VTT* collects **zero** personal data. There are no cloud databases, analytics scripts, tracking cookies, or telemetry calls.
- **Local Storage Only:** All campaign data, character sheets, maps, and session states reside strictly on your own device (`localStorage`, `public/`, and `perfil-app/`).
- **Direct LAN/VPN Multiplayer:** Multiplayer traffic flows directly between players and the GM's self-hosted local server (`server.js` or `server.ps1`).
- **Full Data Sovereignty:** You can export (`⬇ Backup`) or permanently wipe (`💀 Expurgar`) all local data at any time with a single click.
