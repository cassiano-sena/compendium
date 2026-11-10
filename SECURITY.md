# 🔒 Política de Segurança e Uso em Rede / Security Policy

Este documento descreve a arquitetura de segurança do **Compêndio RPG & Tabletop VTT** e as melhores práticas para Mestres (GMs) e Jogadores durante sessões locais ou multiplayer.

---

## 1. Arquitetura de Segurança Local

1. **Prevenção contra *Path Traversal*:**
   - Os servidores locais (`server.js` e `server.ps1`) validam rigorosamente todos os caminhos de arquivos através de resolução canônica (`path.resolve` / `GetFullPath`), garantindo que nenhuma requisição possa ler, gravar ou excluir arquivos fora do diretório `public/`.
2. **Limites de Payload e Memória:**
   - Requisições de estado de sessão (`/api/session`) possuem limite estrito de tamanho (10 MB) e o histórico de rolagens é truncado automaticamente para evitar sobrecarga de memória.
3. **Execução de Mods:**
   - Mods declarativos em `.json` (`rulesPatch` e `customResources`) apenas alteram parâmetros matemáticos seguros do motor de regras.
   - Scripts de Mod em `.js` (`scriptCode`) devem ser importados apenas de fontes confiáveis revisadas pelo Mestre da campanha.

---

## 2. Boas Práticas para Sessões Multiplayer (Até 8 Jogadores)

O servidor integrado (`server.js` na porta `8080`) foi desenhado para partidas entre amigos em ambientes confiáveis:

- **Rede Local (Wi-Fi / Cabo LAN):** Totalmente seguro para uso doméstico entre dispositivos conectados ao mesmo roteador.
- **Jogo Online à Distância (Recomendado: VPN de Malha Privada):**
  - Para jogar pela internet com seus amigos com criptografia ponta-a-ponta e sem abrir portas no seu roteador, utilize uma rede virtual privada gratuita como **Tailscale**, **ZeroTier**, **Radmin VPN** ou **Hamachi**.
  - **Evite expor a porta 8080 diretamente na internet pública (Port Forwarding aberto)** sem uma camada de autenticação/HTTPS (como Cloudflare Access ou proxy reverso autenticado), pois qualquer pessoa com o IP público poderia acessar a mesa aberta.
- **PINs de Perfil:**
  - Os PINs de 4 dígitos dos perfis de jogador servem exclusivamente para evitar que um jogador mova o token ou veja a ficha de outro por engano na mesa. **Nunca utilize senhas pessoais reais** nos PINs do jogo.

---

## 3. Como Reportar Vulnerabilidades

Caso encontre algum problema de segurança no código-fonte:
- Abra uma *Issue* descrevendo o comportamento técnico de forma genérica (ou envie um *Pull Request* com a correção) **sem incluir dados pessoais, IPs reais ou arquivos de campanha privados**.
