# ⚖️ Avisos Legais, Direitos Autorais e Licenças de RPG / Legal Notices & Attribution

Este documento esclarece a separação jurídica entre o **Motor de Software (Código-Fonte)**, as **Mecânicas de Sistema de RPG sob Licença Aberta (SRD)** e o **Conteúdo Criado ou Importado pelo Usuário**.

---

## 1. Direitos Autorais do Software (Código-Fonte e Interface)

```text
Copyright (c) 2026 RPG Compendium Contributors (Autores e Colaboradores do Projeto Compêndio RPG)
```

Todo o código-fonte original desta aplicação — incluindo a arquitetura em HTML5/CSS3/JavaScript (`public/index.html`, `public/css/compendio.css`, `public/js/*.js`), os servidores locais (`server.js`, `server.ps1`), os scripts de automação, o motor de dados (`CompendioDice`), o motor de regras (`CompendioRules`), a API de Mods (`CompendioModAPI`) e o sistema de Tabletop VTT — é licenciado sob a **Licença MIT** (consulte o arquivo [`LICENSE`](LICENSE)).

---

## 2. Atribuição Oficial D&D 5e SRD (Creative Commons CC-BY-4.0)

O motor de regras base deste aplicativo oferece suporte nativo às mecânicas do Documento de Referência do Sistema (**System Reference Document 5.1 / 5.2**), disponibilizado sob a licença aberta **Creative Commons Attribution 4.0 International (CC-BY-4.0)**. Conforme exigido pela licença, inclui-se a atribuição obrigatória abaixo:

> **Atribuição Obrigatória SRD 5.1 (CC-BY-4.0):**  
> Este trabalho inclui material retirado do *System Reference Document 5.1 ("SRD 5.1")* de autoria de **Wizards of the Coast LLC**, disponível em https://dnd.wizards.com/resources/systems-reference-document. O SRD 5.1 é licenciado sob a *Creative Commons Attribution 4.0 International License*, disponível em https://creativecommons.org/licenses/by/4.0/legalcode.

---

## 3. Declaração de Não-Afiliação e Política de Conteúdo de Fãs (Fan Content Policy)

1. **Projeto Independente e Não Oficial:** O *Compêndio RPG & Tabletop VTT* é uma ferramenta de software livre, gratuita e independente, criada por fãs para auxiliar mestres e jogadores em suas sessões privadas de RPG de mesa.
2. **Aviso da Política de Conteúdo de Fãs (Wizards of the Coast Fan Content Policy):**
   > *"Parte dos materiais utilizados ou suportados por esta ferramenta constitui Conteúdo de Fãs não oficial permitido sob a Política de Conteúdo de Fãs da Wizards of the Coast (Fan Content Policy). Este projeto não é aprovado, patrocinado ou endossado pela Wizards of the Coast. Partes dos materiais utilizados são propriedade da Wizards of the Coast. ©Wizards of the Coast LLC."*
   >
   > *(English: "Portions of the materials used may constitute unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.")*
3. **Marcas Registradas:** *Dungeons & Dragons*, *D&D*, *Dungeon Master*, *Curse of Strahd*, *Monster Manual* e seus respectivos nomes e referências são marcas registradas da **Wizards of the Coast LLC** nos EUA e em outros países. *5etools*, *Foundry VTT* e *Roll20* são marcas ou projetos de seus respectivos criadores, citados apenas para fins de interoperabilidade técnica de formatos de arquivo (`.json`).

---

## 4. Responsabilidade sobre Conteúdo Criado ou Importado pelo Usuário (*Safe Harbor* / Ferramenta Local)

O **Compêndio RPG & Tabletop VTT** opera tecnicamente como um **visualizador, editor e organizador local de arquivos** (análogo a um navegador web, leitor de PDF ou editor de documentos JSON/HTML/SVG):

- **Uso Pessoal e Doméstico:** Os arquivos JSON, PDFs, fichas de personagens, mapas (`.png`, `.svg`, `.html`), tokens, trilhas sonoras e notas de campanha que o usuário cria ou importa na aplicação ficam armazenados localmente em seu próprio dispositivo para uso privado em sua mesa de jogo.
- **Isenção dos Autores do Software:** Os autores e colaboradores do *RPG Compendium* não fornecem, não hospedam na internet e não comercializam livros protegidos por direitos autorais de terceiros, nem se responsabilizam pelo conteúdo que cada usuário decide importar ou compartilhar em sua rede local privada.
- **Distribuição Pública de Forks:** Caso você faça um *fork* ou redistribua este projeto publicamente na internet (por exemplo, no GitHub), certifique-se de **não incluir em seu repositório público** materiais protegidos por copyright fechado de terceiros (como livros comerciais completos, aventuras pagas ou artes proprietárias sem permissão). Mantenha no repositório público apenas o motor do software, conteúdos próprios (*homebrew*) ou conteúdos sob licença aberta (SRD CC-BY-4.0).

---

## 5. Dependências de Terceiros (Zero-Dependency Architecture)

Para máxima segurança, auditabilidade, longevidade e ausência de conflitos de licenças:
- **Pacotes NPM externos:** `0` (Zero).
- **Bibliotecas JavaScript/CSS externas (CDNs):** `0` (Zero).
- Todo o código executável utiliza exclusivamente APIs padrões da Web (W3C/WHATWG) e módulos nativos do sistema operacional (`node:http`, `node:fs`, `node:path`).
