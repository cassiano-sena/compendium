# 🤝 Guia de Contribuição Segura & Privada / Contributing Guide

Obrigado pelo interesse em contribuir com o **Compêndio RPG & Tabletop VTT**! Este guia explica como colaborar com código, regras ou Mods **protegendo 100% a sua identidade e privacidade**, bem como a privacidade dos usuários.

---

## 1. Como Proteger Sua Identidade no Git (Antes de Fazer *Commit*)

O Git grava o nome (`user.name`) e o e-mail (`user.email`) permanentemente no histórico de cada *commit*. Para contribuir **sem expor seu nome real ou e-mail pessoal**, execute os comandos abaixo na pasta do projeto antes de commitar:

```bash
# 1. Defina um pseudônimo ou handle (apenas para este repositório)
git config --local user.name "SeuHandleOuPseudonimo"

# 2. Defina um e-mail anônimo noreply (ex: do GitHub/GitLab ou genérico noreply)
git config --local user.email "seu-handle@users.noreply.github.com"
```

Verifique se ficou configurado corretamente com:
```bash
git config --local --list
```

---

## 2. Checklist de Privacidade Antes de Enviar um *Pull Request* ou Compartilhar

Antes de publicar alterações ou compartilhar sua pasta do Compêndio, verifique:

1. **Nunca inclua arquivos de sessão ativa ou backups pessoais:**
   - O arquivo `.gitignore` já bloqueia automaticamente `perfil-app/`, `*.log`, `public/session-state.json` e `*backup*.json`.
   - Caso tenha criado fichas de personagens reais dos seus amigos ou notas privadas de campanha dentro de `public/dados.js`, use o botão **`⬇ Backup`** para salvá-las fora do repositório antes de publicar um *commit* de código.
2. **Não inclua caminhos absolutos do seu computador:**
   - Sempre utilize caminhos relativos (ex.: `./monster/data/...` ou `map/terreo.svg`). Nunca escreva caminhos como `C:\Users\SeuNome\...` no código ou em arquivos JSON.
3. **Metadados EXIF de Imagens:**
   - Fotos tiradas com celulares ou câmeras podem conter coordenadas GPS ou nome do dispositivo nos metadados EXIF. Ao adicionar artes ou mapas ao repositório público, dê preferência a imagens exportadas sem metadados EXIF ou gráficos vetoriais (`.svg` / `.webp` / `.png` limpos).
4. **Zero Dependências Externas e Zero Telemetria:**
   - Não adicione bibliotecas externas via CDN, *scripts* de rastreamento, fontes externas que façam chamadas de rede ocultas ou pacotes NPM desnecessários. O projeto deve permanecer 100% *Local-First* e autônomo.

---

## 3. Criando e Compartilhando Mods (`.json` / `.js`)

A maneira mais limpa de adicionar novas regras, edições (ex.: Pathfinder, Tormenta, OSR, Cyberpunk, Call of Cthulhu) ou mecânicas caseiras sem alterar o núcleo do aplicativo é criando um **Mod** na pasta `public/mods/`:

```json
{
  "id": "meu-mod-custom",
  "name": "Nome do Meu Mod",
  "version": "1.0.0",
  "author": "SeuPseudonimo",
  "description": "Descrição curta do que o Mod altera.",
  "rulesPatch": {
    "critRule": "max-plus-roll",
    "extraConditions": ["Congelado", " Abençoado"]
  },
  "customResources": [
    { "name": "Pontos de Destino", "max": 3, "recharge": "long" }
  ]
}
```

---

## 4. Acordo de Licença de Colaborador (Inbound = Outbound)

Ao submeter uma contribuição (código, correção, estilo ou documentação) para este projeto, você declara que:
1. Tem o direito de submeter a contribuição; e
2. Concorda em licenciar sua contribuição sob a mesma **Licença MIT** do projeto (veja [`LICENSE`](LICENSE)), sob a atribuição coletiva e anônima/pseudônima `RPG Compendium Contributors`, sem exigir exposição da sua identidade civil.
