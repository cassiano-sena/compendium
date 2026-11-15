/* ============================================================================
   CALCULADORA DE MAGIA SELVAGEM & GERADOR DE MAGIA ALEATÓRIA (EXCLUSIVO HOST/GM)
   - Exclusiva ao Host/GM (ui, navegação, persistência e sync isolados)
   - Calculadora com regras PHB, Tensão Progressiva, Círculo, d100% e Marés do Caos
   - 160 Efeitos Selvagens embutidos (Clássica PHB 01-100 + Arcana/Caótica + Cósmica/Hadar)
   - 182 Magias embutidas (0º Truque ao 9º Círculo, 8 escolas) + Mutação + Síntese Procedural
   - Importação inteligente (.json / 5etools / .csv / .txt / .md), Exportação e Biblioteca
   ============================================================================ */

(function() {
    const STORAGE_KEY_WILD_MAGIC = 'compendio_rpg_wildmagic_v1';

    const SCHOOLS = [
        'Abjuração',
        'Adivinhação',
        'Conjuração',
        'Encantamento',
        'Evocação',
        'Ilusão',
        'Necromancia',
        'Transmutação',
        'Caótica / Homebrew'
    ];

    const SCHOOL_ABBR_MAP = {
        A: 'Abjuração',
        ABJ: 'Abjuração',
        D: 'Adivinhação',
        DIV: 'Adivinhação',
        C: 'Conjuração',
        CONJ: 'Conjuração',
        E: 'Encantamento',
        ENC: 'Encantamento',
        ENCH: 'Encantamento',
        V: 'Evocação',
        EVO: 'Evocação',
        EVOC: 'Evocação',
        I: 'Ilusão',
        ILL: 'Ilusão',
        ILU: 'Ilusão',
        N: 'Necromancia',
        NEC: 'Necromancia',
        NECR: 'Necromancia',
        T: 'Transmutação',
        TRANS: 'Transmutação'
    };

    const CLASSES_LIST = [
        'Bardo',
        'Bruxo',
        'Clérigo',
        'Druida',
        'Feiticeiro',
        'Mago',
        'Paladino',
        'Patrulheiro'
    ];

    const SCROLL_STATS_BY_LEVEL = {
        0: { rarity: 'Comum', dc: 13, atk: '+5' },
        1: { rarity: 'Comum', dc: 13, atk: '+5' },
        2: { rarity: 'Incomum', dc: 13, atk: '+5' },
        3: { rarity: 'Incomum', dc: 15, atk: '+7' },
        4: { rarity: 'Raro', dc: 15, atk: '+7' },
        5: { rarity: 'Raro', dc: 17, atk: '+9' },
        6: { rarity: 'Muito Raro', dc: 17, atk: '+9' },
        7: { rarity: 'Muito Raro', dc: 18, atk: '+10' },
        8: { rarity: 'Muito Raro', dc: 18, atk: '+10' },
        9: { rarity: 'Lendário', dc: 19, atk: '+11' }
    };

    const CHAOS_MUTATIONS = [
        { name: 'Ressonância Cromática', note: 'Altere o tipo de dano/energia desta magia para outro elemento aleatório (Ácido, Frio, Fogo, Elétrico, Trovejante ou Psíquico).' },
        { name: 'Eco do Vazio', note: 'No início do próximo turno do conjurador, um eco espectral repete 50% do efeito sobre o mesmo ponto ou alvo.' },
        { name: 'Centelha Espelhada', note: 'Um aliado ou inimigo aleatório a até 9 m também recebe os benefícios ou 1 dado do efeito desta magia.' },
        { name: 'Inversão Gravitacional', note: 'Todas as criaturas na área (ou a 3 m do conjurador) flutuam 1,5 m no ar até o fim do turno seguinte.' },
        { name: 'Selo Instável', note: 'O alcance da magia dobra, mas o conjurador sofre 1d6 de dano de força por recuo arcano.' },
        { name: 'Explosão de Esporos Luminosos', note: 'A conjuração preenche um raio de 6 m com poeira cintilante que anula invisibilidade por 1 rodada.' },
        { name: 'Troca Dimensional', note: 'Logo após conjurar, o conjurador se teletransporta 3 m em uma direção aleatória (1d8).' },
        { name: 'Sobrecarga Concentrada', note: 'Adicione +2 à CD de resistência ou ao bônus de ataque da magia; em contrapartida, a próxima magia terá chance de surto dobrada.' },
        { name: 'Polaridade Invertida', note: 'Se qualquer dado de dano ou cura rolar o valor máximo, o conjurador recupera 1d6 PV temporários.' },
        { name: 'Voz das Estrelas', note: 'Componentes verbais ecoam em Abissal/Celestial a 90 m e concedem vantagem no próximo teste de Arcanismo.' },
        { name: 'Fenda Minúscula', note: 'Um pequeno rasgo etéreo surge onde a magia acertar, criando terreno difícil sombrio de 3 m por 2 rodadas.' },
        { name: 'Pulso Vampírico', note: 'Metade do primeiro dado de dano causado retorna como cura ou PV temporários para uma criatura aleatória a até 4,5 m.' },
        { name: 'Bifurcação Selvagem', note: 'Se a magia tiver alvo único, ela tenta atingir uma segunda criatura aleatória a até 3 m (com desvantagem ou metade do efeito).' },
        { name: 'Silêncio Súbito', note: 'Todo som num raio de 4,5 m do ponto de impacto desaparece até o início do próximo turno do conjurador.' },
        { name: 'Chama Fria', note: 'Todo calor na área é drenado: luzes não mágicas se apagam e água rasa congela instantaneamente.' },
        { name: 'Eco Ilusório', note: 'Duas duplicatas translúcidas do conjurador surgem ao redor dele e se desfazem ao serem tocadas (ou após 1 rodada).' },
        { name: 'Distorção Temporal', note: 'O alvo ou o conjurador perde a reação até o final da rodada atual em troca de +3 m de deslocamento.' },
        { name: 'Magnetismo Arcano', note: 'Objetos metálicos soltos a até 6 m são puxados 1,5 m em direção ao epicentro da magia.' },
        { name: 'Perfume de Ozônio e Enxofre', note: 'Criaturas a até 3 m têm desvantagem no próximo ataque corpo a corpo devido à fumaça cintilante.' },
        { name: 'Marca da Estrela Faminta', note: 'Tentáculos de sombra inofensivos contornam a sombra do alvo, destacando sua posição com luz violeta fraca por 1 minuto.' },
        { name: 'Estilhaço Defensivo', note: 'O conjurador ganha +2 de CA contra o próximo ataque recebido antes de seu próximo turno.' },
        { name: 'Rima Involuntária', note: 'O conjurador e o alvo principal só conseguem falar em versos rimados durante os próximos 30 segundos.' },
        { name: 'Salto Cinético', note: 'Qualquer criatura afetada pela magia é empurrada 3 m para longe do centro do efeito.' },
        { name: 'Aceleração Espasmódica', note: 'A conjuração é tão rápida que concede +1,5 m de movimento bônus imediato sem provocar ataques de oportunidade.' },
        { name: 'Fardo de Chumbo', note: 'Até o fim do turno, todos os dados rolando 1 nesta magia são tratados como 2.' },
        { name: 'Fragmentação Prismática', note: 'O feixe se divide em faíscas coloridas; criaturas com cegueira ou visão no escuro ficam ofuscadas por 1 turno se falharem em CON CD 13.' },
        { name: 'Sussurro de Vetor', note: 'O efeito ignora meia cobertura, dobrando obstáculos em ângulos impossíveis.' },
        { name: 'Carga Residual', note: 'O próximo ataque armado dentro de 1 minuto contra o mesmo alvo causa +1d4 de dano de força adicional.' }
    ];

    // ------------------------------------------------------------------------
    // TABELA 1: 50 EFEITOS CLÁSSICOS D&D 5e PHB (01-100 EM FAIXAS COMPLETAS)
    // Formato: [min, max, title, category, severity, duration, rollFormula, description]
    // ------------------------------------------------------------------------
    const RAW_CLASSIC_EFFECTS = [
        [1, 2, 'Cascata Selvagem Contínua', 'Caos / Mutação', 'perigoso', '1 minuto', '', 'Role nesta tabela no início de cada um de seus turnos pelo próximo minuto, ignorando este resultado em novas rolagens.'],
        [3, 4, 'Olhos de Além do Véu', 'Benefício', 'benefico', '1 minuto', '', 'Pelo próximo minuto, você enxerga qualquer criatura invisível se tiver linha de visão direta para ela.'],
        [5, 6, 'Modron Extraviado', 'Invocação', 'neutro', '1 minuto', '', 'Um Modron escolhido e controlado pelo Mestre surge em um espaço desocupado a até 1,5 m de você e desaparece após 1 minuto.'],
        [7, 8, 'Bola de Fogo Autocentrada', 'Combate', 'catastrofico', 'Instantânea', '8d6', 'Você conjura Bola de Fogo como magia de 3º círculo centrada em si mesmo (8d6 de dano de fogo em esfera de 6 m, salvaguarda de DES reduz à metade).'],
        [9, 10, 'Saraivada de Mísseis Mágicos', 'Combate', 'benefico', 'Instantânea', '7d4+7', 'Você conjura Mísseis Mágicos como magia de 5º círculo (7 dardos de 1d4+1 de dano de força cada, em alvos à sua escolha).'],
        [11, 12, 'Alteração Súbita de Estatura', 'Caos / Mutação', 'neutro', 'Permanente (até Restauração)', '1d10', 'Role 1d10. Sua altura muda um número de polegadas (x2,5 cm) igual ao resultado: se ímpar, você encolhe; se par, você cresce.'],
        [13, 14, 'Aura de Confusão', 'Combate', 'perigoso', '1 minuto', '', 'Você conjura Confusão centrada em si mesmo (esfera de 3 m, salvaguarda de SAB ou age aleatoriamente por 1 minuto).'],
        [15, 16, 'Regeneração Arcana', 'Benefício', 'benefico', '1 minuto', '', 'Pelo próximo minuto, você recupera 5 Pontos de Vida no início de cada um de seus turnos.'],
        [17, 18, 'Barba de Penas Espasmódica', 'Roleplay / Bizarro', 'neutro', 'Até espirrar', '', 'Uma longa barba feita de penas cresce instantaneamente em seu rosto e permanece até você espirrar, quando todas as penas explodem e somem.'],
        [19, 20, 'Poça de Graxa Subitânea', 'Controle de Campo', 'neutro', '1 minuto', '', 'Você conjura Área Escorregadia (Grease) centrada em si mesmo (quadrado de 3 m, salvaguarda de DES ou cai derrubado).'],
        [21, 22, 'Alvo Luminoso em Combate', 'Combate', 'perigoso', '1 minuto', '', 'Criaturas têm vantagem em jogadas de ataque contra você pelo próximo minuto enquanto contornos cintilantes envolvem seu corpo.'],
        [23, 24, 'Pele Azul Etérea', 'Roleplay / Bizarro', 'neutro', 'Permanente (até Remover Maldição)', '', 'Sua pele adquire um tom azul vibrante permanente. A magia Remover Maldição (ou efeito similar) encerra essa coloração.'],
        [25, 26, 'Terceiro Olho Clarividente', 'Benefício', 'benefico', '1 minuto', '', 'Um terceiro olho luminoso abre-se na sua testa pelo próximo minuto, concedendo vantagem em testes de Sabedoria (Percepção) baseados em visão.'],
        [27, 28, 'Conjuração Relâmpago (Ação Bônus)', 'Benefício', 'benefico', '1 minuto', '', 'Pelo próximo minuto, qualquer magia que você conjurar com tempo de conjuração de 1 ação passa a ter tempo de conjuração de 1 ação bônus.'],
        [29, 30, 'Salto Errático', 'Movimento', 'neutro', 'Instantânea', '', 'Você se teletransporta até 18 metros para um espaço desocupado à sua escolha que consiga ver.'],
        [31, 32, 'Viagem Astral Momentânea', 'Caos / Mutação', 'perigoso', 'Até o fim do próximo turno', '', 'Você é transportado ao Plano Astral até o final do seu próximo turno, retornando então ao espaço que ocupava antes (ou ao mais próximo livre).'],
        [33, 34, 'Dano Máximo Desenfreado', 'Benefício', 'benefico', '1 minuto (próxima magia)', '', 'Maximize o dano da próxima magia causadora de dano que você conjurar dentro do próximo minuto.'],
        [35, 36, 'Envelhecimento ou Rejuvenescimento', 'Caos / Mutação', 'neutro', 'Permanente (até Restauração Maior)', '1d10', 'Role 1d10. Sua idade muda em anos igual ao resultado: se ímpar, fica mais jovem (mínimo 1 ano); se par, fica mais velho.'],
        [37, 38, 'Enxame de Flumphs Assustados', 'Invocação', 'neutro', '1 minuto', '1d6', '1d6 Flumphs controlados pelo Mestre surgem em espaços livres a até 18 m de você, amedrontados com você, e desaparecem após 1 minuto.'],
        [39, 40, 'Cura Vigorosa Instantânea', 'Benefício', 'benefico', 'Instantânea', '2d10', 'Você recupera 2d10 Pontos de Vida imediatamente.'],
        [41, 42, 'Metamorfose em Vaso de Planta', 'Caos / Mutação', 'perigoso', '1 rodada', '', 'Você se transforma em um vaso de planta até o início do seu próximo turno. Enquanto vaso, fica incapacitado e tem vulnerabilidade a todo dano; ao cair a 0 PV, retorna à forma normal.'],
        [43, 44, 'Passo Nebuloso em Cadeia', 'Benefício', 'benefico', '1 minuto', '', 'Pelo próximo minuto, você pode usar uma ação bônus em cada turno para se teletransportar até 6 metros para um espaço desocupado que possa ver.'],
        [45, 46, 'Levitação Involuntária', 'Movimento', 'neutro', '1 minuto', '', 'Você conjura Levitação sobre si mesmo, flutuando até 6 metros acima do solo sem controle imediato da descida.'],
        [47, 48, 'Unicórnio Protetor', 'Invocação', 'benefico', '1 minuto', '', 'Um Unicórnio controlado pelo Mestre surge em um espaço a até 1,5 m de você e então desaparece após 1 minuto.'],
        [49, 50, 'Voz Transformada em Bolhas Rosas', 'Roleplay / Bizarro', 'perigoso', '1 minuto', '', 'Você não consegue falar pelo próximo minuto. Sempre que tenta emitir som ou componente verbal, bolhas cor-de-rosa flutuam da sua boca.'],
        [51, 52, 'Escudo Espectral Orbitante', 'Benefício', 'benefico', '1 minuto', '', 'Um escudo espectral paira ao seu redor pelo próximo minuto, concedendo +2 na CA e imunidade à magia Mísseis Mágicos.'],
        [53, 54, 'Ressaca Etérea Arcana', 'Roleplay / Bizarro', 'neutro', '5d6 dias', '5d6', 'Você fica completamente imune à embriaguez causada por álcool pelos próximos 5d6 dias.'],
        [55, 56, 'Mudança Capilar Instantânea', 'Roleplay / Bizarro', 'neutro', '24 horas', '', 'Todo o seu cabelo cai imediatamente, mas cresce de volta por completo dentro de 24 horas.'],
        [57, 58, 'Toque Incendiário', 'Combate', 'neutro', '1 minuto', '', 'Pelo próximo minuto, qualquer objeto inflamável que você tocar e que não esteja sendo vestido ou carregado irrompe em chamas.'],
        [59, 60, 'Recarga Arcana de 1º Círculo', 'Benefício', 'benefico', 'Instantânea', '', 'Você recupera imediatamente seu espaço de magia gasto de menor círculo (priorizando 1º círculo).'],
        [61, 62, 'Declaração em Gritos Estrondosos', 'Roleplay / Bizarro', 'neutro', '1 minuto', '', 'Pelo próximo minuto, você precisa gritar sempre que tentar falar (audível a 90 metros).'],
        [63, 64, 'Cortina de Névoa Súbita', 'Controle de Campo', 'neutro', '1 minuto', '', 'Você conjura Névoa Obscurecente centrada em si mesmo (esfera de 6 m fortemente obscurecida).'],
        [65, 66, 'Arcos Elétricos nos Próximos', 'Combate', 'perigoso', 'Instantânea', '4d10', 'Até três criaturas à sua escolha dentro de 9 m de você sofrem 4d10 de dano elétrico cada uma.'],
        [67, 68, 'Fobia Temporária de Criatura Próxima', 'Combate', 'perigoso', '1 rodada', '', 'Você fica Amedrontado em relação à criatura mais próxima até o final do seu próximo turno.'],
        [69, 70, 'Invisibilidade Coletiva em Raio', 'Benefício', 'benefico', '1 minuto', '', 'Cada criatura a até 9 m de você fica Invisível pelo próximo minuto. A invisibilidade termina para uma criatura se ela atacar ou conjurar magia.'],
        [71, 72, 'Vigor de Resistência Total', 'Benefício', 'benefico', '1 minuto', '', 'Você ganha resistência a todos os tipos de dano pelo próximo minuto.'],
        [73, 74, 'Envenenamento Aleatório Próximo', 'Combate', 'neutro', '1d4 horas', '1d4', 'Uma criatura aleatória a até 18 m de você fica Envenenada por 1d4 horas.'],
        [75, 76, 'Aureola Solar Intensa', 'Roleplay / Bizarro', 'neutro', '1 minuto', '3d6', 'Você brilha com luz plena num raio de 9 m pelo próximo minuto. Qualquer criatura que encerrar o turno a até 1,5 m de você fica Cega até o fim do próximo turno.'],
        [77, 78, 'Metamorfose em Ovelha', 'Caos / Mutação', 'perigoso', '1 hora', '', 'Você conjura Metamorfose em si mesmo. Se falhar na salvaguarda de SAB, transforma-se em uma Ovelha pela duração.'],
        [79, 80, 'Nuvem de Borboletas e Pétalas', 'Roleplay / Bizarro', 'neutro', '1 minuto', '', 'Centenas de borboletas e pétalas ilusórias esvoaçam no ar num raio de 3 m ao seu redor pelo próximo minuto.'],
        [81, 82, 'Ação Adicional Instantânea', 'Benefício', 'benefico', 'Instantânea', '', 'Você pode realizar uma ação adicional imediatamente neste mesmo turno!'],
        [83, 84, 'Sifão Vital Sombrio', 'Combate', 'perigoso', 'Instantânea', '1d10', 'Cada criatura a até 9 m de você sofre 1d10 de dano necrótico. Você recupera PV igual à soma de todo o dano necrótico causado.'],
        [85, 86, 'Imagem Espelhada Súbita', 'Benefício', 'benefico', '1 minuto', '', 'Você conjura Reflexos (Mirror Image) em si mesmo sem gastar espaço de magia ou concentração.'],
        [87, 88, 'Voo Descontrolado sobre Alvo Aleatório', 'Movimento', 'neutro', '1 minuto', '', 'Você conjura Voo em uma criatura aleatória dentro de 18 m de você.'],
        [89, 90, 'Véu de Invisibilidade e Silêncio', 'Benefício', 'benefico', '1 minuto', '', 'Você fica Invisível pelo próximo minuto. Durante esse período, ninguém além de você consegue ouvi-lo, e o efeito encerra apenas se você atacar ou conjurar.'],
        [91, 92, 'Segura de Reencarnação Imortal', 'Benefício', 'benefico', '1 minuto', '', 'Se você morrer dentro do próximo minuto, retorna imediatamente à vida como pelo efeito da magia Reencarnação.'],
        [93, 94, 'Crescimento Titânico', 'Caos / Mutação', 'benefico', '1 minuto', '', 'Seu tamanho aumenta em uma categoria (ex.: Médio para Grande) pelo próximo minuto (+1d4 de dano corpo a corpo e vantagem em testes de Força).'],
        [95, 96, 'Fragilidade a Perfuração em Área', 'Combate', 'perigoso', '1 minuto', '', 'Você e todas as criaturas a até 9 m ganham vulnerabilidade a dano perfurante pelo próximo minuto.'],
        [97, 98, 'Fanfarra Etérea Fada', 'Roleplay / Bizarro', 'neutro', '1 minuto', '', 'Você fica cercado por música suave e etérea de harpa e flauta pelo próximo minuto, audível a 9 m.'],
        [99, 100, 'Plenitude da Fonte Caótica', 'Benefício', 'benefico', 'Instantânea', '', 'Você recupera imediatamente todos os seus Pontos de Feitiçaria gastos (ou recupera 1 espaço de magia de até 5º círculo).']
    ];

    // ------------------------------------------------------------------------
    // TABELA 2: 60 EFEITOS EXPANDIDOS ARCANOS & CAÓTICOS (HOMEBREW / TÁTICO)
    // Formato: [code, title, category, severity, duration, rollFormula, description]
    // ------------------------------------------------------------------------
    const RAW_CHAOS_EFFECTS = [
        ['C-01', 'Inversão de Inimigo e Aliado', 'Combate', 'perigoso', '1 rodada', '', 'Os dois combatentes com maior e menor iniciativa trocam instantaneamente de posição no mapa e de turno na fila.'],
        ['C-02', 'Tempestade de Estilhaços Prateados', 'Combate', 'perigoso', 'Instantânea', '4d6', 'Estilhaços arcanos explodem num raio de 4,5 m: 4d6 de dano de força em todos exceto o conjurador (DES CD 15 metade).'],
        ['C-03', 'Gravidade Lateral de Parede', 'Controle de Campo', 'perigoso', '1 rodada', '', 'A gravidade muda 90 graus para Leste num raio de 6 m por 1 rodada; criaturas devem passar em FOR CD 14 ou escorregar 6 m.'],
        ['C-04', 'Duplicata Ilusória Tagarela', 'Ilusão / Caos', 'neutro', '1 minuto', '', 'Uma cópia ilusória perfeita sua surge a 3 m, imita seus gestos em atraso de 1 segundo e narra suas intenções táticas em voz alta.'],
        ['C-05', 'Arma Viva Encantada', 'Benefício', 'benefico', '1 minuto', '1d8', 'A arma mais próxima de você ganha +2 em ataque e dano e causa +1d8 de dano elétrico extra pelo próximo minuto.'],
        ['C-06', 'Pulso Antimagia Breve', 'Controle de Campo', 'catastrofico', '1 rodada', '', 'Uma esfera de 4,5 m ao redor do conjurador suprime toda magia ativa e itens mágicos até o início de seu próximo turno.'],
        ['C-07', 'Chuva de Sapos Espectrais', 'Roleplay / Bizarro', 'neutro', '3 rodadas', '', 'Sapos translúcidos coloridos chovem numa área de 9 m por 3 rodadas, criando terreno difícil e coaxando melodias de taberna.'],
        ['C-08', 'Dardo Ricocheteante Infinito', 'Combate', 'neutro', 'Instantânea', '3d8', 'Um raio prismático acerta o inimigo mais próximo (3d8 radiante), depois salta para um aliado (cura 2d8 PV) e apaga numa faísca.'],
        ['C-09', 'Troca Elemental Completa', 'Caos / Mutação', 'neutro', '10 minutos', '', 'Todo dano elemental que você causar pelos próximos 10 minutos troca aleatoriamente (1d6: 1 Fogo, 2 Frio, 3 Ácido, 4 Elétrico, 5 Veneno, 6 Trovejante).'],
        ['C-10', 'Fome Subita de Poções', 'Roleplay / Bizarro', 'neutro', 'Instantânea', '', 'Uma poção comum aleatória se materializa no seu bolso, mas seu cantil inteiro vira vinagre doce e brilhante.'],
        ['C-11', 'Escudo de Graveto e Cristal', 'Benefício', 'benefico', '1 minuto', '2d10+5', 'Você recebe 2d10+5 PV temporários envolto em cristais flutuantes que estalam quando atingidos.'],
        ['C-12', 'Eco da Última Magia', 'Benefício', 'benefico', '1 rodada', '', 'No início do seu próximo turno, sua última magia de 1º ou 2º círculo é reconjurada gratuitamente sobre o mesmo ponto (ou alvo aleatório).'],
        ['C-13', 'Olhar de Pedra Fraca', 'Combate', 'perigoso', '1 rodada', '', 'A primeira criatura que olhar diretamente para seus olhos até o próximo turno sofre Restringida por petrificação parcial (CON CD 14 nega).'],
        ['C-14', 'Deslocamento Acidental em Espiral', 'Movimento', 'neutro', 'Instantânea', '1d8', 'Você e todas as criaturas a até 3 m se teletransportam 4,5 m em uma direção aleatória (1d8 rosa dos ventos).'],
        ['C-15', 'Passos de Fogo Congelante', 'Controle de Campo', 'neutro', '1 minuto', '1d6', 'Cada quadrado onde você pisar por 1 minuto fica coberto de fogo azul que queima e congela (1d6 frio + 1d6 fogo ao entrar).'],
        ['C-16', 'Reversão de Dano em Cura Breve', 'Benefício', 'benefico', '1 rodada', '', 'O próximo ataque que acertar você antes do próximo turno, em vez de causar dano, cura metade do valor rolado (mínimo 1).'],
        ['C-17', 'Pequena Fênix Irritada', 'Invocação', 'neutro', '1 minuto', '1d6', 'Uma microfênix (como Familiar Coruja que causa 1d6 fogo em rasante) surge pousada no seu ombro e exige petiscos de pólvora ou carvão.'],
        ['C-18', 'Sombra Rebelde', 'Caos / Mutação', 'perigoso', '1 minuto', '2d6', 'Sua sombra se solta e age como Sombra hostil à criatura mais próxima (2d6 necrótico) sem distinguir aliados de inimigos.'],
        ['C-19', 'Velocidade Excessiva', 'Combate', 'neutro', '1 minuto', '', 'Seu deslocamento dobra pelo próximo minuto, mas se você andar menos da metade em seu turno, cai Derrubado por inércia.'],
        ['C-20', 'Muralha de Vidro Colorido', 'Controle de Campo', 'neutro', '1 minuto', '', 'Uma parede translúcida de vitral mágico (6 m x 3 m, CA 12, 25 PV) brota exatamente entre você e o inimigo mais próximo.'],
        ['C-21', 'Confissão Honesta Involuntária', 'Roleplay / Bizarro', 'neutro', '1 minuto', '', 'Todas as criaturas a até 6 m (incluindo você) ficam sob efeito de Zona da Verdade sem direito a salvaguarda inicial por 1 minuto.'],
        ['C-22', 'Concentração Dupla Temporária', 'Benefício', 'benefico', '1 minuto', '', 'Pelo próximo minuto, você consegue manter concentração em DUAS magias simultaneamente! Ao fim do minuto, uma se dissipa.'],
        ['C-23', 'Armadura Pesada em Pena', 'Caos / Mutação', 'neutro', '1 minuto', '', 'Todas as armaduras metálicas a até 9 m perdem 90% do peso (desvantagem em Furtividade removida, mas quem usá-la é empurrado +3 m por golpes).'],
        ['C-24', 'Implosão Gravitacional', 'Combate', 'catastrofico', 'Instantânea', '5d8', 'Todas as criaturas entre 3 m e 9 m são puxadas 4,5 m em direção a você (FOR CD 16 resiste) e sofrem 5d8 de dano de força se colidirem.'],
        ['C-25', 'Rosto Sem Expressão de Mármore', 'Roleplay / Bizarro', 'neutro', '10 minutos', '', 'Seu rosto assume a aparência lisa de uma estátua clássica, dando vantagem em Intimidação e desvantagem em Persuasão por 10 minutos.'],
        ['C-26', 'Onda de Cansaço Síncrono', 'Combate', 'catastrofico', '1 minuto', '', 'Você e cada criatura a até 4,5 m fazem CON CD 15 ou ganham 1 nível de Exaustão temporário por 1 minuto.'],
        ['C-27', 'Mão Gigante Desastrada', 'Controle de Campo', 'neutro', '1 minuto', '2d8', 'Uma mão arcana translúcida aparece e empurra ou agarra aleatoriamente qualquer criatura que passar a 3 m dela (CD 14).'],
        ['C-28', 'Sinfonia Trovejante', 'Combate', 'perigoso', 'Instantânea', '3d10', 'Uma nota grave explode de seu peito: cone de 9 m sofre 3d10 trovejante e fica Surdo por 1 rodada (CON CD 15 metade).'],
        ['C-29', 'Esfera de Silêncio Ambulante', 'Controle de Campo', 'perigoso', '1 minuto', '', 'Uma aura de Silêncio de 3 m se ancora em você por 1 minuto — ótimo contra conjuradores inimigos, péssimo para seus componentes verbais!'],
        ['C-30', 'Alquimia Instantânea de Bolso', 'Benefício', 'neutro', 'Instantânea', '1d4', 'Todas as moedas de cobre em seus bolsos se transformam em moedas de ouro brilhantes — até 1d4 x 10 peças; acima disso vira chumbo quente.'],
        ['C-31', 'Gelo Instantâneo nas Botas', 'Controle de Campo', 'perigoso', '1 rodada', '', 'Os pés de todas as criaturas no chão num raio de 6 m congelam no lugar: deslocamento vira 0 até gastarem uma ação ou causarem 5 de fogo.'],
        ['C-32', 'Aura de Sorte Emprestada', 'Benefício', 'benefico', '1 minuto', '', 'Aliados a até 4,5 m podem re-rolar uma única rolagem de 1 no d20 pelo próximo minuto; cada 1 re-rolado reduz 1 PV seu.'],
        ['C-33', 'Míssil de Pergaminhos Vivos', 'Roleplay / Bizarro', 'neutro', 'Instantânea', '', 'Dezenas de páginas de pergaminho rodopiam no ar por 10 m, dando cobertura leve a todos e sussurrando receitas culinárias antigas.'],
        ['C-34', 'Pulo Temporal de 6 Segundos', 'Movimento', 'perigoso', '1 rodada', '', 'Você desaparece completamente da linha temporal agora e reaparece no início do seu próximo turno com os mesmos PV que tinha antes.'],
        ['C-35', 'Vínculo Simpático Aleatório', 'Combate', 'perigoso', '1 minuto', '', 'Você e a criatura hostil mais próxima compartilham dano igual: sempre que um sofrer dano, o outro sofre metade (psíquico, SAB CD 16 encerra no fim do turno).'],
        ['C-36', 'Chuva de Faíscas Curativas', 'Benefício', 'benefico', 'Instantânea', '3d8', 'Todas as criaturas vivas a até 6 m (incluindo inimigos!) recuperam 3d8 Pontos de Vida em uma explosão dourada.'],
        ['C-37', 'Sino Invisível do Destino', 'Combate', 'neutro', 'Instantânea', '1d20', 'Um badalo cósmico ressoa. O próximo ataque de QUALQUER criatura na cena terá resultado natural substituído por 20 se for ataque físico ou 1 se for magia.'],
        ['C-38', 'Vento Solar Empurrante', 'Controle de Campo', 'neutro', 'Instantânea', '2d6', 'Uma rajada dourada empurra todos a até 6 m por 6 metros para longe e causa 2d6 de dano radiante (FOR CD 14 metade e não cai).'],
        ['C-39', 'Idioma Invertido', 'Roleplay / Bizarro', 'neutro', '10 minutos', '', 'Você só consegue falar e compreender um idioma aleatório que desconhecia (Celestial, Abissal, Dracônico ou Silvestre) por 10 minutos.'],
        ['C-40', 'Fome de Magia Menor', 'Combate', 'catastrofico', 'Instantânea', '', 'A magia em andamento de maior círculo a até 18 m de você (aliada ou inimiga) é imediatamente alvo de Dissipar Magia automática (teste +5).'],
        ['C-41', 'Olhos de Prisma Tático', 'Benefício', 'benefico', '1 minuto', '', 'Você ganha Visão Verdadeira de 9 metros por 1 minuto, vendo através de ilusões, escuridão mágica e metamorfoses.'],
        ['C-42', 'Portal de Bolso Aberto', 'Caos / Mutação', 'neutro', '1 minuto', '1d10', 'Uma fenda de 30 cm abre ao seu lado e cospe 1d10 objetos mundanos aleatórios (botas, peixes, chaves, candelabros) antes de fechar.'],
        ['C-43', 'Pele de Mercúrio Líquido', 'Benefício', 'benefico', '1 minuto', '', 'Você ganha +3 de CA e resistência a dano cortante e perfurante por 1 minuto, mas deixa pegadas metálicas prateadas brilhantes.'],
        ['C-44', 'Troca de Consciência Relâmpago', 'Caos / Mutação', 'catastrofico', '1 rodada', '', 'Você e o aliado mais próximo trocam de iniciativa e tomam decisões mútuas por 1 rodada enquanto veem pelos olhos um do outro (SAB CD 15 opcional).'],
        ['C-45', 'Explosão de Espinhos Cristalinos', 'Combate', 'perigoso', 'Instantânea', '4d8', 'Agulhas de cristal irrompem em um raio de 4,5 m: 4d8 perfurante mágico em todos na área (DES CD 15 metade).'],
        ['C-46', 'Imunidade ao Medo e Charm', 'Benefício', 'benefico', '10 minutos', '', 'Pelos próximos 10 minutos, você e aliados a até 3 m ficam completamente imunes às condições Amedrontado e Enfeitiçado.'],
        ['C-47', 'Aura Magnética de Flechas', 'Combate', 'perigoso', '1 minuto', '', 'Ataques à distância com projéteis disparados a até 9 m de você desviam automaticamente para tentar acertar o conjurador (vantagem do atacante).'],
        ['C-48', 'Estouro de Confete Incandescente', 'Roleplay / Bizarro', 'neutro', 'Instantânea', '1d4', 'Um cone colorido ilumina o campo e causa apenas 1d4 de dano de fogo em tudo à frente, porém impõe desvantagem no próximo ataque de concentração.'],
        ['C-49', 'Reserva Oculta Despertada', 'Benefício', 'benefico', 'Instantânea', '', 'Escolha uma magia de 1º a 3º círculo que você conheça ou tenha preparada: você pode conjurá-la como ação livre agora sem gastar espaço, provocando 1 novo surto.'],
        ['C-50', 'Nuvem Ácida Saltitante', 'Controle de Campo', 'perigoso', '3 rodadas', '2d6', 'Uma nuvem verde de 3 m se move 4,5 m em direção aleatória no fim de cada rodada por 3 rodadas, causando 2d6 ácido a quem estiver dentro.'],
        ['C-51', 'Asas Etéreas de Mariposa', 'Benefício', 'benefico', '1 minuto', '', 'Asas iridescentes brotam em suas costas, concedendo deslocamento de voo de 9 metros pelo próximo minuto.'],
        ['C-52', 'Cratera de Vidro Fundido', 'Controle de Campo', 'perigoso', '1 minuto', '2d8', 'O piso num raio de 3 m sob você derrete e vira vidro quente por 1 minuto (terreno difícil que causa 2d8 fogo por cada 1,5 m percorrido).'],
        ['C-53', 'Ressonância de Dano Crítico', 'Combate', 'neutro', '1 minuto', '', 'Pelo próximo minuto, todas as jogadas de ataque na cena (aliados e inimigos a até 9 m) causam acerto crítico com 19 ou 20 natural!'],
        ['C-54', 'Coração de Gelo Silencioso', 'Benefício', 'neutro', '10 minutos', '', 'Sua temperatura corporal despenca para zero grau: você fica imune a dano de fogo por 1 rodada, mas vulnerável a trovejante pelo próximo minuto.'],
        ['C-55', 'Invocação de Armadura Vazia', 'Invocação', 'neutro', '1 minuto', '', 'Uma Armadura Animada neutra se monta de sucata metálica próxima e obedece exclusivamente comandos verbais simples de proteção por 1 minuto.'],
        ['C-56', 'Inversão de Pontos de Vida Temporários', 'Combate', 'perigoso', 'Instantânea', '3d6', 'Qualquer criatura a até 9 m perde todos os PV Temporários atuais e sofre 3d6 de dano psíquico em troca, enquanto você absorve metade como cura.'],
        ['C-57', 'Sopro Dragônico Aleatório', 'Combate', 'benefico', 'Instantânea', '6d6', 'Você expele um cone elemental de 9 m causando 6d6 de dano de um elemento aleatório (1d6: Fogo, Frio, Ácido, Elétrico, Veneno ou Força; DES/CON CD 16 metade).'],
        ['C-58', 'Eco de Vozes Passadas', 'Roleplay / Bizarro', 'neutro', '1 minuto', '', 'Todas as palavras ditas naquele recinto nas últimas 24 horas ecoam simultaneamente em volume audível por 1 minuto (Desvantagem em Percepção auditiva).'],
        ['C-59', 'Rebote de Concentração', 'Benefício', 'benefico', '1 minuto', '', 'Você tem sucesso automático no próximo teste de Constituição para manter concentração em uma magia.'],
        ['C-60', 'Vórtice Caótico Duplo', 'Caos / Mutação', 'catastrofico', 'Instantânea', '', 'A realidade estala: role DOIS novos efeitos na Tabela Clássica ou Cósmica e aplique AMBOS imediatamente!']
    ];

    // ------------------------------------------------------------------------
    // TABELA 3: 50 EFEITOS CÓSMICOS / HADAR & HORROR GÓTICO (CASA VARHEN)
    // Formato: [code, title, category, severity, duration, rollFormula, description]
    // ------------------------------------------------------------------------
    const RAW_COSMIC_EFFECTS = [
        ['H-01', 'Olho da Estrela Faminta', 'Cósmico / Horror', 'perigoso', '1 rodada', '3d8', 'Uma fenda violácea se abre acima de você. Todos que olharem a até 9 m fazem SAB CD 16 ou sofrem 3d8 psíquico e ficam Amedrontados por 1 rodada.'],
        ['H-02', 'Tentáculos da Fome de Hadar', 'Cósmico / Horror', 'perigoso', '3 rodadas', '2d6', 'Uma esfera de escuridão fria de 3 m surge centrada a 4,5 m aleatoriamente por 3 rodadas: 2d6 frio ao iniciar o turno lá e 2d6 ácido se encerrar lá.'],
        ['H-03', 'Gravidade Fraturada da Dimensão', 'Cósmico / Horror', 'catastrofico', '1 minuto', '', 'Fragmentos de pedra do chão flutuam a 3 m de altura num raio de 12 m, criando cobertura parcial móvel e terreno difícil tridimensional.'],
        ['H-04', 'Sussurro do Primogênito', 'Cósmico / Horror', 'neutro', 'Instantânea', '', 'Uma voz antiga ecoa em sua mente revelando imediatamente UMA resistência, imunidade ou fraqueza da criatura hostil mais forte em visão.'],
        ['H-05', 'Coroa de Estrelas Negras', 'Cósmico / Horror', 'benefico', '1 minuto', '4d8', 'Três órbitas negras giram ao redor de sua cabeça (equivalente a Coroa de Estrelas reduzida). Você pode usar ação bônus para disparar 1 órbita (4d8 radiante/necrótico).'],
        ['H-06', 'Chuva de Cinzas Estelares', 'Cósmico / Horror', 'neutro', '1 minuto', '', 'Cinza brilhante de estrela morta cai suavemente a até 15 m, revelando contornos de criaturas invisíveis ou no Plano Etéreo.'],
        ['H-07', 'Dreno de Sombra Simbiótica', 'Cósmico / Horror', 'perigoso', 'Instantânea', '4d6', 'Tentáculos finos ligam você às duas criaturas mais próximas: cada uma sofre 4d6 necrótico e você recebe metade em PV temporários.'],
        ['H-08', 'Badalada do Homem Balde', 'Cósmico / Horror', 'neutro', 'Instantânea', '3d10', 'O som metálico de um sino invisível ecoa em todo o campo: criaturas com Concentração fazem CON CD 15 ou perdem a concentração; surdos sofrem 3d10 trovejante.'],
        ['H-09', 'Fenda Etérea Instável', 'Cósmico / Horror', 'neutro', 'Instantânea', '', 'Você e a criatura mais próxima a até 18 m trocam instantaneamente de localização física (CAR CD 17 se não voluntária).'],
        ['H-10', 'Sangue Estelar nas Veias', 'Cósmico / Horror', 'benefico', '1 minuto', '', 'Seu sangue brilha com poeira cósmica violeta: você ganha resistência a dano necrótico e radiante e vantagem contra envenenamento por 1 minuto.'],
        ['H-11', 'Eco do Arauto da Aniquilação', 'Cósmico / Horror', 'catastrofico', '1 rodada', '6d6', 'Uma silhueta colossal de armadura sombria aparece por 1 segundo e golpeia o ar: cone de 9 m sofre 6d6 necrótico e força (DES CD 17 metade).'],
        ['H-12', 'Silêncio do Vazio Absoluto', 'Cósmico / Horror', 'perigoso', '2 rodadas', '', 'Todo som e calor se extinguem em raio de 6 m por 2 rodadas; fogo não mágico se apaga e magias de fogo causam metade do dano.'],
        ['H-13', 'Fragmento Temporal Congelado', 'Cósmico / Horror', 'benefico', 'Instantânea', '', 'O tempo gagueja por 3 segundos apenas para você: ignore qualquer condição Paralisado, Agarrado ou Lento que o afete agora e mova-se 4,5 m livremente.'],
        ['H-14', 'Olhos de Ónix Sem Pupila', 'Cósmico / Horror', 'neutro', '10 minutos', '', 'Seus olhos ficam completamente negros e refletem constelações desconhecidas. Visão no Escuro aumenta para 36 m (inclusive em escuridão mágica) por 10 min.'],
        ['H-15', 'Miasma das Catacumbas Varhen', 'Cósmico / Horror', 'perigoso', '1 minuto', '2d8', 'Névoa pálida de 4,5 m surge ao seu redor: mortos-vivos nela ganham vantagem em ataques e vivos perdem 2d8 PV se terminarem o turno sem passar em CON CD 14.'],
        ['H-16', 'Luz Carmesim de Lathander Fraturado', 'Cósmico / Horror', 'benefico', 'Instantânea', '5d8', 'Um feixe dourado e escarlate rompe o céu escuro sobre o conjurador: cura 5d8 PV em você e em até 2 aliados a 6 m, mas queima seus olhos (ofuscado 1 turno).'],
        ['H-17', 'Pacto Momentâneo de Sangue', 'Cósmico / Horror', 'perigoso', '1 minuto', '2d6', 'Você pode gastar 2d6 PV próprios como sacrifício em cada turno para dar desvantagem automática em uma salvaguarda contra sua próxima magia.'],
        ['H-18', 'Rastro de Constelações', 'Cósmico / Horror', 'neutro', '1 minuto', '', 'Onde quer que você se mova por 1 minuto, pontos de luz estelar permanecem ligados por fios arcanos que explodem em 1d8 radiante quando inimigos atravessam.'],
        ['H-19', 'Visão da Realidade Quebrada', 'Cósmico / Horror', 'perigoso', '1 rodada', '4d6', 'Por 1 segundo você vê todas as realidades possíveis sobrepostas: 4d6 psíquico (SAB CD 16 metade) mas sua próxima rolagem de d20 é tratada como Vantagem dupla (3d20).'],
        ['H-20', 'Manto de Vácuo Repulsivo', 'Cósmico / Horror', 'benefico', '1 minuto', '3d6', 'Um manto de matéria escura protege você: sempre que sofrer dano corpo a corpo por 1 minuto, o atacante sofre 3d6 de dano de força e recua 1,5 m.'],
        ['H-21', 'Lágrima da Lua Vermelha', 'Cósmico / Horror', 'catastrofico', '1 minuto', '', 'Uma lua ilusória sangrenta ilumina o campo por 1 minuto: metamorfos e licantropos na área ganham +2 em ataques e licantropos aliados ficam frenéticos.'],
        ['H-22', 'Devoração de Pergaminhos', 'Cósmico / Horror', 'perigoso', 'Instantânea', '', 'Uma boca sombria abre na sua manga e consome 1 espaço de magia de 1º círculo ou carga de item seu — em troca, seu próximo feitiço não gasta espaço nem componente.'],
        ['H-23', 'Círculo de Glifos Profanos', 'Cósmico / Horror', 'perigoso', '1 minuto', '4d8', 'Runas escuras se gravam sob você num raio de 3 m; qualquer inimigo que pisar no círculo antes de 1 minuto aciona explosão de 4d8 força (DES CD 16 metade).'],
        ['H-24', 'Chama Violeta Persistente', 'Cósmico / Horror', 'perigoso', '3 rodadas', '2d10', 'Fogo cósmico viola a armadura da criatura mais próxima (2d10 necrótico por turno durante 3 rodadas; requer ação para apagar ou CON CD 15).'],
        ['H-25', 'Eco de Passos em Outro Plano', 'Cósmico / Horror', 'neutro', '1 minuto', '', 'Ao usar seu deslocamento, metade dele pode ser percorrido em fase etérea através de paredes de até 1,5 m de espessura por 1 minuto.'],
        ['H-26', 'Coração de Estrela Moribunda', 'Cósmico / Horror', 'catastrofico', 'Instantânea', '6d10', 'Implosão súbita seguida de supernova de 6 m centrada em você: TODOS na esfera sofrem 6d10 força + radiante (CON CD 17 metade); você tem resistência ao dano.'],
        ['H-27', 'Inversão de Cura e Podridão', 'Cósmico / Horror', 'catastrofico', '1 rodada', '', 'Até o fim da rodada, qualquer efeito de cura mágica num raio de 9 m causa o mesmo valor como dano necrótico (evitável com CON CD 15).'],
        ['H-28', 'Chave Sombria Efêmera', 'Cósmico / Horror', 'benefico', '10 minutos', '', 'Uma chave negra de matéria estelar surge na sua mão: destranca automaticamente qualquer porta não artefato ao toque uma única vez e se desfaz em cinzas.'],
        ['H-29', 'Frenesi da Fome', 'Cósmico / Horror', 'perigoso', '1 minuto', '', 'Você sente uma fome sobrenatural insaciável: ganha +1 ataque extra (ou Truque como ação bônus) se feriu alguém no turno, caso contrário sofre 1d8 psíquico.'],
        ['H-30', 'Espelho do Outro Lado', 'Cósmico / Horror', 'neutro', '1 minuto', '', 'Todo espelho, lâmina ou poça a 12 m mostra um reflexo seu de outro universo sorrindo e apontando na direção do perigo ou tesouro oculto mais próximo.'],
        ['H-31', 'Vórtice de Dentes Espectrais', 'Cósmico / Horror', 'perigoso', '2 rodadas', '3d8', 'Mandíbulas invisíveis mordem num raio de 3 m ao redor do ponto alvo da magia por 2 rodadas (3d8 perfurante mágico ao iniciar o turno lá, DES CD 15 metade).'],
        ['H-32', 'Escudo de Memórias Roubadas', 'Cósmico / Horror', 'benefico', '1 minuto', '', 'Você se lembra perfeitamente de uma perícia ou idioma alheio por 1 minuto (+Proficiência temporária) e ganha +3 contra qualquer efeito mental.'],
        ['H-33', 'Selo da Casa Varhen', 'Cósmico / Horror', 'neutro', '1 minuto', '', 'Um brasão aristocrático luminoso aparece acima de sua cabeça: mortos-vivos inteligentes e nobres devem passar em SAB CD 14 antes de atacá-lo na primeira vez.'],
        ['H-34', 'Distensão Espacial', 'Cósmico / Horror', 'neutro', '1 minuto', '', 'Distâncias parecem dobrar para ataques à distância direcionados a você por 1 minuto (alcance efetivo contra você é cortado pela metade).'],
        ['H-35', 'Chuva de Sangue Mineral', 'Cósmico / Horror', 'neutro', '1 minuto', '', 'Gotas espessas carmesins caem num raio de 9 m e endurecem em sal cristalizado ao tocar o chão, revelando pegadas ocultas.'],
        ['H-36', 'Fúria da Matilha Oculta', 'Cósmico / Horror', 'benefico', '1 minuto', '', 'Uivos fantasmagóricos ressoam ao redor: aliados a até 6 m ganham vantagem no primeiro ataque corpo a corpo contra alvos já adjacentes a outro aliado.'],
        ['H-37', 'Colapso Parcial de Defesa', 'Cósmico / Horror', 'catastrofico', '1 rodada', '', 'Sua CA cai em -3 até o início de seu próximo turno enquanto sua aura vaza energia bruta, mas sua próxima magia adiciona +10 ao dano total.'],
        ['H-38', 'Correntes de Vácuo Sólido', 'Cósmico / Horror', 'perigoso', '1 minuto', '2d8', 'Correntes pretas prendem até 2 inimigos aleatórios a 9 m (FOR CD 16 ou Restringido; 2d8 força no início do turno enquanto preso).'],
        ['H-39', 'Transfusão Cósmica Coletiva', 'Cósmico / Horror', 'neutro', 'Instantânea', '', 'Some todos os PV atuais de você e do aliado mais ferido a até 9 m e divida igualmente entre os dois.'],
        ['H-40', 'Fagulha de Antimatéria', 'Cósmico / Horror', 'catastrofico', 'Instantânea', '8d6', 'Uma partícula brilhante e negra explode no alvo mais próximo com menos de 50% de PV: 8d6 de dano de força (CON CD 16 metade) e desintegra objetos mundanos pequenos.'],
        ['H-41', 'Olho Clínico do Primogênito', 'Cósmico / Horror', 'benefico', '1 minuto', '', 'Você lê automaticamente os Pontos de Vida aproximados e a CD de conjuração de todas as criaturas visíveis a até 18 m por 1 minuto.'],
        ['H-42', 'Aperto Glacial do Espaço Profundo', 'Cósmico / Horror', 'perigoso', '1 rodada', '5d6', 'O ar ao redor congela ao zero absoluto: cone de 6 m sofre 5d6 frio e deslocamento reduzido à metade por 1 rodada.'],
        ['H-43', 'Máscara do Sem Rosto', 'Cósmico / Horror', 'neutro', '1 minuto', '', 'Sua face se dissolve em névoa cinzenta por 1 minuto, dando imunidade a ataques baseados em olhar (como Basilisco ou Medo visual) e desvantagem em testes sociais.'],
        ['H-44', 'Alinhamento Planetário Efêmero', 'Cósmico / Horror', 'benefico', '1 rodada', '', 'Todas as suas rolagens de ataque mágico e testes de resistência obtêm um bônus de +1d6 até o fim do seu próximo turno.'],
        ['H-45', 'Ruptura de Eco Sonoro', 'Cósmico / Horror', 'perigoso', 'Instantânea', '4d8', 'Cada criatura que conjurar ou falar em voz alta dentro de 12 m antes do próximo turno sofre 4d8 psíquico de reverberação imediata.'],
        ['H-46', 'Presente Indesejado de Hadar', 'Cósmico / Horror', 'perigoso', '1 minuto', '3d6', 'Uma pequena esfera negra orbita sua mão: ela explode no próximo toque causando +3d6 necrótico ao alvo e 1d6 necrótico em você.'],
        ['H-47', 'Despertar Súbito de Armadilha', 'Cósmico / Horror', 'perigoso', 'Instantânea', '', 'Se houver qualquer glifo, armadilha mágica ou selo oculto a até 18 m, ele brilha intensamente em violeta e revela sua posição exata ao conjurador!'],
        ['H-48', 'Estabilidade Forçada', 'Cósmico / Horror', 'benefico', '10 minutos', '', 'A trama da magia se fecha firmemente: pelos próximos 10 minutos, nenhum novo Surto de Magia Selvagem pode ser disparado num raio de 18 m.'],
        ['H-49', 'Chamado da Lua Fraturada', 'Cósmico / Horror', 'benefico', 'Instantânea', '4d10', 'Um pilar de luar escuro desce sobre um ponto à escolha (raio 3 m): 4d10 radiante + necrótico (CON CD 16 metade) e dissipa escuridão mágica na área.'],
        ['H-50', 'Despertar do Caos Primordial', 'Cósmico / Horror', 'catastrofico', 'Instantânea', '2d10', 'O espaço ao redor colapsa e renasce: role 1 efeito na Tabela Clássica E conjure gratuitamente uma magia aleatória de 1º a 4º círculo centrada em ponto aleatório a 6 m!']
    ];

    // ------------------------------------------------------------------------
    // CATÁLOGO DE 184 MAGIAS D&D 5e / 5.5e (0º TRUQUE AO 9º CÍRCULO, 8 ESCOLAS)
    // Formato: [name, level, school, castingTime, range, components, duration, flags ('C'=Conc, 'R'=Ritual, ''), classes[], damageOrRoll, description]
    // ------------------------------------------------------------------------
    const RAW_BUILTIN_SPELLS = [
        // === 0º CÍRCULO (TRUQUES - 24) ===
        ['Raio de Fogo', 0, 'Evocação', '1 ação', '36 m', 'V, S', 'Instantânea', '', ['Feiticeiro', 'Mago'], '1d10 Fogo (escala)', 'Dispara um projétil flamejante. Ataque à distância com magia causando 1d10 de dano de fogo (aumenta nos níveis 5, 11 e 17). Incendeia objetos inflamáveis não carregados.'],
        ['Raio de Gelo', 0, 'Evocação', '1 ação', '18 m', 'V, S', 'Instantânea', '', ['Feiticeiro', 'Mago'], '1d8 Frio (escala)', 'Um feixe azulado congela o alvo com 1d8 de dano de frio e reduz seu deslocamento em 3 metros até o início do próximo turno do conjurador.'],
        ['Rajada Mística', 0, 'Evocação', '1 ação', '36 m', 'V, S', 'Instantânea', '', ['Bruxo'], '1d10 Força / feixe', 'Dispara feixes de energia crepitante de força pura. Cada feixe exige ataque mágico e causa 1d10 de dano de força (ganha feixes extras nos níveis 5, 11 e 17).'],
        ['Chama Sagrada', 0, 'Evocação', '1 ação', '18 m', 'V, S', 'Instantânea', '', ['Clérigo'], '1d8 Radiante (DES)', 'Chama radiante desce sobre uma criatura à vista (ignora cobertura). Salvaguarda de Destreza ou sofre 1d8 de dano radiante.'],
        ['Toque Arrepiante', 0, 'Necromancia', '1 ação', '36 m', 'V, S', '1 rodada', '', ['Bruxo', 'Feiticeiro', 'Mago'], '1d8 Necrótico', 'Cria uma mão esquelética fantasmagórica: 1d8 necrótico e o alvo não pode recuperar Pontos de Vida até o início de seu próximo turno; mortos-vivos sofrem desvantagem.'],
        ['Badalar dos Mortos (Toll the Dead)', 0, 'Necromancia', '1 ação', '18 m', 'V, S', 'Instantânea', '', ['Bruxo', 'Clérigo', 'Mago'], '1d8 / 1d12 Necrótico (SAB)', 'Sino fúnebre ressoa em uma criatura. SAB ou sofre 1d8 necrótico — ou 1d12 se o alvo já estiver com menos que o máximo de PV.'],
        ['Estalo Mental (Mind Sliver)', 0, 'Encantamento', '1 ação', '18 m', 'V', '1 rodada', '', ['Bruxo', 'Feiticeiro', 'Mago'], '1d6 Psíquico (INT)', 'Espinho psíquico atravessa a mente: INT ou sofre 1d6 psíquico e subtrai 1d4 da próxima salvaguarda que fizer antes do fim do próximo turno.'],
        ['Trovejante (Thunderclap)', 0, 'Evocação', '1 ação', '1,5 m (ao redor)', 'S', 'Instantânea', '', ['Bardo', 'Bruxo', 'Druida', 'Feiticeiro', 'Mago'], '1d6 Trovejante (CON)', 'Estrondo audível a 30 m. Cada criatura a até 1,5 m faz CON ou sofre 1d6 trovejante.'],
        ['Espirro Ácido', 0, 'Conjuração', '1 ação', '18 m', 'V, S', 'Instantânea', '', ['Feiticeiro', 'Mago'], '1d6 Ácido (DES)', 'Arremessa uma bolha ácida contra até duas criaturas adjacentes a até 1,5 m uma da outra; DES ou 1d6 de dano ácido.'],
        ['Agarre Chocante', 0, 'Evocação', '1 ação', 'Toque', 'V, S', 'Instantânea', '', ['Feiticeiro', 'Mago'], '1d8 Elétrico', 'Ataque mágico corpo a corpo (vantagem se o alvo vestir metal): 1d8 elétrico e o alvo não pode realizar reações até o próximo turno.'],
        ['Toque Venenoso', 0, 'Conjuração', '1 ação', '3 m', 'V, S', 'Instantânea', '', ['Bruxo', 'Druida', 'Feiticeiro', 'Mago'], '1d12 Veneno (CON)', 'Projeta uma nuvem nociva contra uma criatura: CON ou sofre 1d12 de dano de veneno.'],
        ['Chicote de Espinhos', 0, 'Transmutação', '1 ação', '9 m', 'V, S, M', 'Instantânea', '', ['Druida'], '1d6 Perfurante', 'Cria uma vinha espinhosa que ataca à distância: 1d6 perfurante e puxa criatura Grande ou menor até 3 m na sua direção.'],
        ['Produzir Chamas', 0, 'Conjuração', '1 ação', 'Pessoal / 9 m', 'V, S', '10 minutos', '', ['Druida'], '1d8 Fogo', 'Chama brilhante ilumina 3 m + 3 m penumbra na mão sem queimar; pode ser arremessada como ataque mágico a 9 m causando 1d8 fogo.'],
        ['Zombaria Viciosa', 0, 'Encantamento', '1 ação', '18 m', 'V', 'Instantânea', '', ['Bardo'], '1d4 / 1d6 Psíquico (SAB)', 'Insultos mágicos atingem criatura que o ouça: SAB ou sofre 1d4 (2024: 1d6) psíquico e tem desvantagem na próxima jogada de ataque.'],
        ['Mãos Mágicas', 0, 'Conjuração', '1 ação', '9 m', 'V, S', '1 minuto', '', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Cria uma mão espectral flutuante capaz de manipular objetos, abrir portas destrancadas e carregar até 5 kg.'],
        ['Ilusão Menor', 0, 'Ilusão', '1 ação', '9 m', 'S, M', '1 minuto', '', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Cria um som específico ou a imagem estática de um objeto de até 1,5 m cúbico. Investigação contra sua CD revela ser ilusão.'],
        ['Prestidigitação', 0, 'Transmutação', '1 ação', '3 m', 'V, S', 'Até 1 hora', '', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Truques menores de palco: faíscas, limpar/sujar, aquecer/esfriar sabor, criar pequeno símbolo ou ilusão efêmera na palma da mão.'],
        ['Taumaturgia', 0, 'Transmutação', '1 ação', '9 m', 'V', 'Até 1 minuto', '', ['Clérigo'], '', 'Pequenas maravilhas divinas: amplifica sua voz em 3x, faz tochas tremeluzirem, abre janelas destrancadas ou muda a cor dos olhos.'],
        ['Druidismo', 0, 'Transmutação', '1 ação', '9 m', 'V, S', 'Instantânea', '', ['Druida'], '', 'Prevê o clima das próximas 24h, faz uma flor desabrochar instantaneamente, cria brisa ou apaga pequena fogueira.'],
        ['Orientação (Guidance)', 0, 'Adivinhação', '1 ação', 'Toque', 'V, S', 'Concentração, 1 minuto', 'C', ['Clérigo', 'Druida'], '1d4', 'Concede +1d4 a um teste de atributo escolhido pelo alvo antes do término da magia.'],
        ['Resistência', 0, 'Abjuração', '1 ação', 'Toque', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Clérigo', 'Druida'], '1d4', 'Toca criatura voluntária que pode adicionar 1d4 a uma salvaguarda (ou reduz 1d4 de dano conforme edição 2024).'],
        ['Poupar os Moribundos', 0, 'Necromancia', '1 ação', 'Toque / 4,5 m', 'V, S', 'Instantânea', '', ['Clérigo'], '', 'Estabiliza instantaneamente uma criatura viva que esteja com 0 Pontos de Vida.'],
        ['Proteção contra Lâminas (Blade Ward)', 0, 'Abjuração', '1 ação', 'Pessoal', 'V, S', '1 rodada', '', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Concede resistência contra dano contundente, cortante e perfurante de ataques com armas até o final do próximo turno (2024: -1d4 em ataques recebidos).'],
        ['Luz', 0, 'Evocação', '1 ação', 'Toque', 'V, M', '1 hora', '', ['Bardo', 'Clérigo', 'Feiticeiro', 'Mago'], '', 'Um objeto tocado irradia luz plena num raio de 6 m e penumbra por mais 6 m.'],

        // === 1º CÍRCULO (26) ===
        ['Mísseis Mágicos', 1, 'Evocação', '1 ação', '36 m', 'V, S', 'Instantânea', '', ['Feiticeiro', 'Mago'], '3d4+3 Força', 'Cria 3 dardos brilhantes de força que acertam automaticamente alvos à escolha, causando 1d4+1 de dano de força cada.'],
        ['Escudo Arcano', 1, 'Abjuração', '1 reação', 'Pessoal', 'V, S', '1 rodada', '', ['Feiticeiro', 'Mago'], '', 'Reação ao ser atingido: concede +5 na CA até o início de seu próximo turno (inclusive contra o ataque gatilho) e imunidade a Mísseis Mágicos.'],
        ['Orbe Cromático', 1, 'Evocação', '1 ação', '27 m', 'V, S, M (diamante 50 po)', 'Instantânea', '', ['Feiticeiro', 'Mago'], '3d8 Elemental', 'Arremessa uma esfera de 10 cm de diâmetro escolhendo o tipo entre Ácido, Frio, Fogo, Elétrico, Veneno ou Trovejante; ataque mágico causa 3d8 de dano.'],
        ['Mãos Flamejantes', 1, 'Evocação', '1 ação', 'Cone 4,5 m', 'V, S', 'Instantânea', '', ['Feiticeiro', 'Mago'], '3d6 Fogo (DES)', 'Um leque de chamas jorra de seus dedos em um cone de 4,5 m. DES metade; causa 3d6 de dano de fogo e incendeia objetos soltos.'],
        ['Onda Trovejante', 1, 'Evocação', '1 ação', 'Cubo 4,5 m', 'V, S', 'Instantânea', '', ['Bardo', 'Druida', 'Feiticeiro', 'Mago'], '2d8 Trovejante (CON)', 'Onda de força trovejante varre um cubo de 4,5 m: CON ou sofre 2d8 trovejante e é empurrado 3 m para longe. Trovão audível a 90 m.'],
        ['Faca de Gelo (Ice Knife)', 1, 'Conjuração', '1 ação', '18 m', 'S, M', 'Instantânea', '', ['Druida', 'Feiticeiro', 'Mago'], '1d10 Perfurante + 2d6 Frio', 'Lança um estilhaço congelante (ataque mágico: 1d10 perfurante) que explode num raio de 1,5 m (DES ou sofre 2d6 frio).'],
        ['Raio Adoecente (Ray of Sickness)', 1, 'Necromancia', '1 ação', '18 m', 'V, S', 'Instantânea', '', ['Feiticeiro', 'Mago'], '2d8 Veneno', 'Raio esverdeado causa 2d8 de dano de veneno (ataque mágico) e exige CON ou fica Envenenado até o final do próximo turno.'],
        ['Raio Guiador (Guiding Bolt)', 1, 'Evocação', '1 ação', '36 m', 'V, S', '1 rodada', '', ['Clérigo'], '4d6 Radiante', 'Raio luminoso causa 4d6 de dano radiante e ilumina o alvo, concedendo vantagem na próxima jogada de ataque contra ele antes do fim do próximo turno.'],
        ['Armadura Arcana', 1, 'Abjuração', '1 ação', 'Toque', 'V, S, M', '8 horas', '', ['Feiticeiro', 'Mago'], '', 'A CA base de uma criatura voluntária sem armadura torna-se 13 + modificador de Destreza por 8 horas.'],
        ['Curar Ferimentos', 1, 'Evocação', '1 ação', 'Toque', 'V, S', 'Instantânea', '', ['Bardo', 'Clérigo', 'Druida', 'Paladino', 'Patrulheiro'], '1d8+Mod (2024: 2d8+Mod)', 'Toque restaurador recupera 1d8 + modificador de conjuração (ou 2d8 + mod em 2024) Pontos de Vida de uma criatura viva.'],
        ['Palavra Curativa', 1, 'Evocação', '1 ação bônus', '18 m', 'V', 'Instantânea', '', ['Bardo', 'Clérigo', 'Druida'], '1d4+Mod (2024: 2d4+Mod)', 'Proferir uma palavra divina recupera 1d4 + mod (2024: 2d4 + mod) PV à distância sem gastar a ação principal.'],
        ['Bênção (Bless)', 1, 'Encantamento', '1 ação', '9 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Clérigo', 'Paladino'], '+1d4', 'Abençoa até 3 criaturas: sempre que fizerem um ataque ou salvaguarda durante a magia, rolam 1d4 e somam ao resultado.'],
        ['Perdição (Bane)', 1, 'Encantamento', '1 ação', '9 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bardo', 'Clérigo'], '-1d4 (CAR)', 'Até 3 criaturas (salvaguarda de CAR) devem subtrair 1d4 de todas as jogadas de ataque e salvaguardas enquanto durar a magia.'],
        ['Armadura de Agathys', 1, 'Abjuração', '1 ação', 'Pessoal', 'V, S, M', '1 hora', '', ['Bruxo'], '5 Frio', 'Concede 5 PV temporários; enquanto tiver esses PV temporários, qualquer atacante corpo a corpo sofre 5 de dano de frio.'],
        ['Bruxaria (Hex)', 1, 'Encantamento', '1 ação bônus', '27 m', 'V, S, M', 'Concentração, 1 hora', 'C', ['Bruxo'], '+1d6 Necrótico', 'Amaldiçoa um alvo: sofre +1d6 necrótico extra dos seus ataques e desvantagem em testes de um atributo à sua escolha. Pode transferir se o alvo cair a 0 PV.'],
        ['Marca do Caçador', 1, 'Adivinhação', '1 ação bônus', '27 m', 'V', 'Concentração, 1 hora', 'C', ['Patrulheiro'], '+1d6 Dano', 'Marca uma presa: +1d6 de dano com armas e vantagem em Percepção e Sobrevivência para rastreá-la.'],
        ['Névoa Obscurecente', 1, 'Conjuração', '1 ação', '36 m', 'V, S', 'Concentração, 1 hora', 'C', ['Druida', 'Feiticeiro', 'Mago', 'Patrulheiro'], '', 'Cria uma esfera de neblina espessa de 6 m de raio que obscurece totalmente a visão na área até vento moderado dispersá-la.'],
        ['Graxa (Área Escorregadia)', 1, 'Conjuração', '1 ação', '18 m', 'V, S, M', '1 minuto', '', ['Mago', 'Feiticeiro'], '', 'Cobre um quadrado de 3 m com graxa escorregadia (terreno difícil). DES ou cai Derrubado ao aparecer, entrar ou terminar o turno lá.'],
        ['Sono (Sleep)', 1, 'Encantamento', '1 ação', '27 m', 'V, S, M', '1 minuto', '', ['Bardo', 'Feiticeiro', 'Mago'], '5d8 PV', 'Faz criaturas num raio de 6 m adormecerem por pontos de vida acumulados (5d8, em ordem crescente de PV atuais). Não afeta mortos-vivos ou imunes a charme.'],
        ['Riso Histérico de Tasha', 1, 'Encantamento', '1 ação', '9 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bardo', 'Mago'], '', 'Criatura cai gargalhando (SAB nega), ficando Derrubada e Incapacitada. Repete a salvaguarda no fim de cada turno e ao sofrer dano (com vantagem).'],
        ['Enfeitiçar Pessoa', 1, 'Encantamento', '1 ação', '9 m', 'V, S', '1 hora', '', ['Bardo', 'Bruxo', 'Druida', 'Feiticeiro', 'Mago'], '', 'Um humanoide (SAB com vantagem se em combate) passa a encará-lo como conhecido amigável por 1 hora, sabendo ao término que foi encantado.'],
        ['Disfarçar-se', 1, 'Ilusão', '1 ação', 'Pessoal', 'V, S', '1 hora', '', ['Bardo', 'Feiticeiro', 'Mago'], '', 'Altera ilusoriamente sua aparência física, roupas e altura (até 30 cm) por 1 hora. Investigação revela inconsistências ao toque.'],
        ['Queda Suave', 1, 'Transmutação', '1 reação', '18 m', 'V, M', '1 minuto', '', ['Bardo', 'Feiticeiro', 'Mago'], '', 'Até 5 criaturas em queda descem suavemente a 18 m por rodada e aterrissam sem sofrer dano de queda.'],
        ['Detectar Magia', 1, 'Adivinhação', '1 ação', 'Pessoal (9 m)', 'V, S', 'Concentração, 10 minutos', 'CR', ['Bardo', 'Clérigo', 'Druida', 'Feiticeiro', 'Mago', 'Paladino', 'Patrulheiro'], '', 'Sente a presença de magia a até 9 m e, usando ação, vê uma aura tênue e descobre a escola da magia em objetos/criaturas visíveis.'],
        ['Escudo da Fé', 1, 'Abjuração', '1 ação bônus', '18 m', 'V, S, M', 'Concentração, 10 minutos', 'C', ['Clérigo', 'Paladino'], '', 'Campo cintilante envolve criatura à vista, concedendo +2 na Classe de Armadura enquanto mantiver concentração.'],
        ['Destruição Divina (Searing Smite)', 1, 'Evocação', '1 ação bônus', 'Pessoal', 'V', 'Concentração, 1 minuto', 'C', ['Paladino'], '1d6 Fogo/turno', 'Seu próximo golpe corpo a corpo com arma causa +1d6 de dano de fogo e incendeia o alvo com 1d6 fogo contínuo até passar em CON.'],

        // === 2º CÍRCULO (24) ===
        ['Passo Nebuloso (Misty Step)', 2, 'Conjuração', '1 ação bônus', 'Pessoal', 'V', 'Instantânea', '', ['Bruxo', 'Feiticeiro', 'Mago'], '', 'Brevemente envolto em névoa prateada, você se teletransporta até 9 metros para um espaço desocupado que possa ver.'],
        ['Invisibilidade', 2, 'Ilusão', '1 ação', 'Toque', 'V, S, M', 'Concentração, 1 hora', 'C', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Uma criatura tocada fica Invisível por 1 hora. A magia termina para o alvo se ele atacar ou conjurar outra magia.'],
        ['Reflexos (Mirror Image)', 2, 'Ilusão', '1 ação', 'Pessoal', 'V, S', '1 minuto', '', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Três duplicatas ilusórias idênticas surgem em seu espaço. Ataques contra você têm chance de acertar e destruir uma duplicata (CA 10 + DES).'],
        ['Raio Ardente (Scorching Ray)', 2, 'Evocação', '1 ação', '36 m', 'V, S', 'Instantânea', '', ['Feiticeiro', 'Mago'], '6d6 Fogo (3x 2d6)', 'Cria 3 raios de fogo e os arremessa em um ou vários alvos: cada raio exige ataque mágico e causa 2d6 de dano de fogo.'],
        ['Despedaçar (Shatter)', 2, 'Evocação', '1 ação', '18 m', 'V, S, M', 'Instantânea', '', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '3d8 Trovejante (CON)', 'Barulho ensurdecedor explode numa esfera de 3 m: CON metade (3d8 trovejante). Criaturas inorgânicas de pedra/metal têm desvantagem.'],
        ['Teia (Web)', 2, 'Conjuração', '1 ação', '18 m', 'V, S, M', 'Concentração, 1 hora', 'C', ['Feiticeiro', 'Mago'], '2d4 Fogo se queimar', 'Preenche um cubo de 6 m com teias pegajosas (terreno difícil, DES ou fica Restringido). Se incendiadas, queimam em 1 rodada causando 2d4 fogo.'],
        ['Escuridão (Darkness)', 2, 'Evocação', '1 ação', '18 m', 'V, M', 'Concentração, 10 minutos', 'C', ['Bruxo', 'Feiticeiro', 'Mago'], '', 'Escuridão mágica numa esfera de 4,5 m bloqueia até visão no escuro natural e luzes de magias de 2º círculo ou menor.'],
        ['Imobilizar Pessoa', 2, 'Encantamento', '1 ação', '18 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bardo', 'Bruxo', 'Clérigo', 'Druida', 'Feiticeiro', 'Mago'], '', 'Um humanoide à vista (SAB nega) fica Paralisado pela duração, repetindo o teste ao fim de cada turno.'],
        ['Sugestão', 2, 'Encantamento', '1 ação', '9 m', 'V, M', 'Concentração, 8 horas', 'C', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Sugere um curso de ação razoável em até duas frases a criatura que o compreenda (SAB nega). Ordens suicidas encerram a magia imediatamente.'],
        ['Silêncio', 2, 'Ilusão', '1 ação', '36 m', 'V, S', 'Concentração, 10 minutos', 'CR', ['Bardo', 'Clérigo', 'Patrulheiro'], '', 'Nenhum som pode atravessar ou ser criado dentro de uma esfera de 6 m de raio. Imunidade a dano trovejante e impossível conjurar com componente verbal.'],
        ['Arma Espiritual', 2, 'Evocação', '1 ação bônus', '18 m', 'V, S', '1 minuto', '', ['Clérigo'], '1d8+Mod Força', 'Cria uma arma espectral flutuante que ataca no lançamento e com ação bônus em turnos seguintes, causando 1d8 + mod de dano de força.'],
        ['Força Fantasmagórica', 2, 'Ilusão', '1 ação', '18 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bardo', 'Feiticeiro', 'Mago'], '1d6 Psíquico/turno', 'Implanta uma ilusão vívida e lógica apenas na mente de uma criatura (INT nega), podendo causar 1d6 psíquico por turno se parecer letal.'],
        ['Cegueira / Surdez', 2, 'Necromancia', '1 ação', '9 m (2024: 36 m)', 'V', '1 minuto', '', ['Bardo', 'Clérigo', 'Feiticeiro', 'Mago'], '', 'Deixa uma criatura Cega ou Surda pelo próximo minuto (CON nega e repete ao fim de cada turno). Não exige concentração!'],
        ['Nublar (Blur)', 2, 'Ilusão', '1 ação', 'Pessoal', 'V', 'Concentração, 1 minuto', 'C', ['Feiticeiro', 'Mago'], '', 'Seu contorno físico oscila como miragem; qualquer criatura sofre desvantagem em ataques contra você, a menos que não dependa de visão.'],
        ['Aumentar / Reduzir', 2, 'Transmutação', '1 ação', '9 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bardo', 'Feiticeiro', 'Mago'], '+/- 1d4 Dano', 'Dobra ou reduz à metade o tamanho de criatura/objeto (CON nega se involuntário), concedendo +/- 1d4 no dano com armas e vantagem/desvantagem em FOR.'],
        ['Patas de Aranha', 2, 'Transmutação', '1 ação', 'Toque', 'V, S, M', 'Concentração, 1 hora', 'C', ['Bruxo', 'Feiticeiro', 'Mago'], '', 'Criatura tocada ganha deslocamento de escalada igual ao normal e anda em paredes verticais e tetos de cabeça para baixo com as mãos livres.'],
        ['Passos sem Pegadas', 2, 'Abjuração', '1 ação', 'Pessoal (9 m)', 'V, S, M', 'Concentração, 1 hora', 'C', ['Druida', 'Patrulheiro'], '+10 Furtividade', 'Véu de sombras e silêncio envolve você e aliados a até 9 m, concedendo +10 em testes de Furtividade e ocultando rastros.'],
        ['Crescimento de Espinhos', 2, 'Transmutação', '1 ação', '45 m', 'V, S, M', 'Concentração, 10 minutos', 'C', ['Druida', 'Patrulheiro'], '2d4 Perfurante/1,5m', 'Solo num raio de 6 m vira terreno difícil coberto de espinhos ocultos; cada 1,5 m percorrido causa 2d4 de dano perfurante.'],
        ['Esfera Flamejante', 2, 'Conjuração', '1 ação', '18 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Druida', 'Feiticeiro', 'Mago'], '2d6 Fogo (DES)', 'Bola de fogo de 1,5 m rola até 9 m com ação bônus; criaturas a até 1,5 m ao terminar o turno ou atingidas fazem DES ou sofrem 2d6 fogo.'],
        ['Esquentar Metal', 2, 'Transmutação', '1 ação', '18 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bardo', 'Druida'], '2d8 Fogo', 'Faz um objeto metálico brilhar incandescente, causando 2d8 fogo imediatos e repetindo com ação bônus; quem segurar precisa de CON ou soltar/sofrer desvantagem.'],
        ['Levitação', 2, 'Transmutação', '1 ação', '18 m', 'V, S, M', 'Concentração, 10 minutos', 'C', ['Feiticeiro', 'Mago'], '', 'Ergue criatura ou objeto de até 250 kg verticalmente até 6 m (CON nega).'],
        ['Nuvem de Adagas', 2, 'Conjuração', '1 ação', '18 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '4d4 Cortante', 'Preenche um cubo de 1,5 m com lâminas giratórias que causam automaticamente 4d4 de dano cortante a quem entrar ou iniciar o turno lá.'],
        ['Restauração Menor', 2, 'Abjuração', '1 ação', 'Toque', 'V, S', 'Instantânea', '', ['Bardo', 'Clérigo', 'Druida', 'Paladino', 'Patrulheiro'], '', 'Encerra instantaneamente uma doença ou condição: Cego, Surdo, Paralisado ou Envenenado.'],
        ['Ver o Invisível', 2, 'Adivinhação', '1 ação', 'Pessoal', 'V, S, M', '1 hora', '', ['Bardo', 'Feiticeiro', 'Mago'], '', 'Por 1 hora, você vê criaturas e objetos invisíveis como se fossem visíveis e enxerga no Plano Etéreo.'],

        // === 3º CÍRCULO (24) ===
        ['Bola de Fogo', 3, 'Evocação', '1 ação', '45 m', 'V, S, M', 'Instantânea', '', ['Feiticeiro', 'Mago'], '8d6 Fogo (DES)', 'Um feixe flamejante explode num ponto escolhido em esfera de 6 m de raio (contorna quinas): DES metade ou 8d6 de dano de fogo.'],
        ['Relâmpago (Lightning Bolt)', 3, 'Evocação', '1 ação', 'Linha 30 m', 'V, S, M', 'Instantânea', '', ['Feiticeiro', 'Mago'], '8d6 Elétrico (DES)', 'Um raio de energia elétrica de 30 m x 1,5 m corta tudo no caminho: DES metade ou 8d6 de dano elétrico.'],
        ['Contramágica (Counterspell)', 3, 'Abjuração', '1 reação', '18 m', 'S', 'Instantânea', '', ['Bruxo', 'Feiticeiro', 'Mago'], '', 'Reação quando vê alguém conjurar a até 18 m: interrompe automaticamente magias de até 3º círculo (ou exige teste/CON CD conforme edição).'],
        ['Dissipar Magia', 3, 'Abjuração', '1 ação', '36 m', 'V, S', 'Instantânea', '', ['Bardo', 'Bruxo', 'Clérigo', 'Druida', 'Feiticeiro', 'Mago', 'Paladino'], '', 'Encerra automaticamente magias de 3º círculo ou menor no alvo; magias maiores exigem teste de atributo de conjuração CD 10 + círculo.'],
        ['Velocidade (Haste)', 3, 'Transmutação', '1 ação', '9 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Feiticeiro', 'Mago'], '', 'Alvo ganha deslocamento dobrado, +2 CA, vantagem em DES e 1 ação adicional limitada por turno; ao fim da magia fica letárgico por 1 turno.'],
        ['Lentidão (Slow)', 3, 'Transmutação', '1 ação', '36 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bardo', 'Feiticeiro', 'Mago'], '', 'Até 6 criaturas num cubo de 12 m (SAB nega): metade do deslocamento, -2 na CA e DES, sem reações e apenas 1 ataque por turno; atrasa magias.'],
        ['Voo (Fly)', 3, 'Transmutação', '1 ação', 'Toque', 'V, S, M', 'Concentração, 10 minutos', 'C', ['Bruxo', 'Feiticeiro', 'Mago'], '', 'Concede deslocamento de voo de 18 metros à criatura tocada pela duração.'],
        ['Padrão Hipnótico', 3, 'Ilusão', '1 ação', '36 m', 'S, M', 'Concentração, 1 minuto', 'C', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Padrão cintilante num cubo de 9 m: criaturas que virem fazem SAB ou ficam Enfeitiçadas, Incapacitadas e com deslocamento 0 até sofrerem dano ou serem sacudidas.'],
        ['Fome de Hadar', 3, 'Conjuração', '1 ação', '45 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bruxo'], '2d6 Frio + 2d6 Ácido', 'Portal negro de 6 m cria escuridão e vazio glacial: 2d6 frio ao iniciar o turno dentro, e DES CD ou 2d6 ácido de tentáculos ao encerrar o turno dentro.'],
        ['Revivificar', 3, 'Necromancia', '1 ação', 'Toque', 'V, S, M (diamante 300 po)', 'Instantânea', '', ['Clérigo', 'Druida', 'Paladino', 'Patrulheiro'], '', 'Retorna à vida com 1 Ponto de Vida uma criatura que tenha morrido no último minuto (não restaura membros perdidos).'],
        ['Espíritos Guardiões', 3, 'Conjuração', '1 ação', 'Pessoal (4,5 m)', 'V, S, M', 'Concentração, 10 minutos', 'C', ['Clérigo'], '3d8 Radiante/Necrótico (SAB)', 'Espíritos protetores giram a 4,5 m: metade do deslocamento de inimigos e 3d8 radiante (ou necrótico) quando entram ou iniciam turno na aura.'],
        ['Piscar (Blink)', 3, 'Transmutação', '1 ação', 'Pessoal', 'V, S', '1 minuto', '', ['Feiticeiro', 'Mago'], '1d20 (11+)', 'No fim de cada turno, role 1d20: com 11 ou mais você desaparece para o Plano Etéreo até o início do próximo turno, tornando-se intangível.'],
        ['Medo (Fear)', 3, 'Ilusão', '1 ação', 'Cone 9 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Projeta pesadelos num cone de 9 m (SAB nega): alvos largam o que seguram, ficam Amedrontados e fogem usando Disparo.'],
        ['Animar Mortos', 3, 'Necromancia', '1 minuto', '3 m', 'V, S, M', 'Instantânea', '', ['Clérigo', 'Mago'], '', 'Ergue um cadáver ou pilha de ossos como Zumbi ou Esqueleto sob seu controle mental por 24 horas.'],
        ['Toque Vampírico', 3, 'Necromancia', '1 ação', 'Pessoal', 'V, S', 'Concentração, 1 minuto', 'C', ['Bruxo', 'Feiticeiro', 'Mago'], '3d6 Necrótico', 'Ataque mágico corpo a corpo causa 3d6 necrótico e você recupera Pontos de Vida igual à metade do dano causado; repetível a cada turno.'],
        ['Nevasca (Sleet Storm)', 3, 'Conjuração', '1 ação', '45 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Druida', 'Feiticeiro', 'Mago'], '', 'Cilindro de 12 m de raio apaga chamas, cria escuridão de nevasca, derruba quem falhar em DES e exige teste de Concentração contra sua CD.'],
        ['Convocar Relâmpagos', 3, 'Conjuração', '1 ação', '36 m', 'V, S', 'Concentração, 10 minutos', 'C', ['Druida'], '3d10 Elétrico (DES)', 'Nuvem tempestuosa permite disparar raios em pontos a cada turno com 1 ação (raio de 1,5 m, 3d10 elétrico, +1d10 ao ar livre em tempestade).'],
        ['Invocar Fada (Conjure / Summon Fey)', 3, 'Conjuração', '1 ação', '27 m', 'V, S, M (300 po)', 'Concentração, 1 hora', 'C', ['Bardo', 'Bruxo', 'Druida', 'Feiticeiro', 'Mago', 'Patrulheiro'], '', 'Invoca um espírito feérico aliado com ações próprias que compartilha sua iniciativa e ganha bônus pelo círculo usado.'],
        ['Idiomas (Tongues)', 3, 'Adivinhação', '1 ação', 'Toque', 'V, M', '1 hora', '', ['Bardo', 'Bruxo', 'Clérigo', 'Feiticeiro', 'Mago'], '', 'Alvo entende qualquer idioma falado e é compreendido por qualquer criatura que conheça ao menos uma língua.'],
        ['Proteção contra Energia', 3, 'Abjuração', '1 ação', 'Toque', 'V, S', 'Concentração, 1 hora', 'C', ['Clérigo', 'Druida', 'Feiticeiro', 'Mago', 'Patrulheiro'], '', 'Concede resistência a um tipo de dano à escolha: Ácido, Frio, Fogo, Elétrico ou Trovejante.'],
        ['Andar na Água', 3, 'Transmutação', '1 ação', '9 m', 'V, S, M', '1 hora', 'R', ['Clérigo', 'Druida', 'Feiticeiro', 'Patrulheiro'], '', 'Até 10 criaturas atravessam líquidos (água, ácido, lama ou lava — sem evitar dano térmico) como chão sólido.'],
        ['Muralha de Vento', 3, 'Evocação', '1 ação', '36 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Druida', 'Patrulheiro'], '3d8 Contundente (FOR)', 'Muro de ventos de até 15 m x 4,5 m desvia flechas, dispersa névoas e causa 3d8 contundente a quem atravessar.'],
        ['Clarividência', 3, 'Adivinhação', '10 minutos', '1,5 km', 'V, S, M', 'Concentração, 10 minutos', 'C', ['Bardo', 'Clérigo', 'Feiticeiro', 'Mago'], '', 'Cria sensor invisível em local conhecido ou óbvio a até 1,5 km para enxergar ou ouvir à distância.'],
        ['Forma Gasosa', 3, 'Transmutação', '1 ação', 'Toque', 'V, S, M', 'Concentração, 1 hora', 'C', ['Bruxo', 'Feiticeiro', 'Mago'], '', 'Transforma criatura voluntária em nuvem de névoa com voo 3 m, passagem por frestas e resistência a dano não mágico.'],

        // === 4º CÍRCULO (20) ===
        ['Invisibilidade Maior', 4, 'Ilusão', '1 ação', 'Toque', 'V, S', 'Concentração, 1 minuto', 'C', ['Bardo', 'Feiticeiro', 'Mago'], '', 'O alvo permanece completamente Invisível pela duração inteira, MESMO quando atacar ou conjurar magias!'],
        ['Metamorfose (Polymorph)', 4, 'Transmutação', '1 ação', '18 m', 'V, S, M', 'Concentração, 1 hora', 'C', ['Bardo', 'Druida', 'Feiticeiro', 'Mago'], '', 'Transforma uma criatura em qualquer Fera cujo ND seja igual ou menor ao nível/ND dela (SAB nega se hostil).'],
        ['Banimento', 4, 'Abjuração', '1 ação', '18 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bruxo', 'Clérigo', 'Feiticeiro', 'Mago', 'Paladino'], '', 'Envia uma criatura (CAR nega) para um semiplano inofensivo (Incapacitada) ou, se for nativa de outro plano, permanentemente para casa se durar 1 minuto.'],
        ['Porta Dimensional', 4, 'Conjuração', '1 ação', '150 m', 'V', 'Instantânea', '', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Teleporta você (e até uma criatura voluntária adjacente) até 150 m para um local visível, imaginado ou descrito por distância e direção.'],
        ['Muralha de Fogo', 4, 'Evocação', '1 ação', '36 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Druida', 'Feiticeiro', 'Mago'], '5d8 Fogo (DES)', 'Ergue parede de chamas de até 18 m x 6 m (ou anel de 6 m). Causa 5d8 fogo no surgimento, dentro da parede ou a até 3 m do lado irradiado.'],
        ['Tempestade de Gelo', 4, 'Evocação', '1 ação', '90 m', 'V, S, M', 'Instantânea', '', ['Druida', 'Feiticeiro', 'Mago'], '2d8 Contundente + 4d6 Frio', 'Cilindro de 6 m de raio por 12 m de altura recebe granizo pesado: DES metade (2d8 contundente + 4d6 frio) e vira terreno difícil por 1 rodada.'],
        ['Esfera Resiliente de Otiluke', 4, 'Evocação', '1 ação', '9 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Mago'], '', 'Envolve criatura Grande ou menor em esfera de força impenetrável (DES nega se hostil). Nada físico, magia ou ataque atravessa; rola devagar como hamster.'],
        ['Tentáculos Negros de Evard', 4, 'Conjuração', '1 ação', '27 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Mago'], '3d6 Contundente', 'Preenche quadrado de 6 m com tentáculos negros: terreno difícil, DES ou fica Restringido e sofre 3d6 de dano contundente por turno.'],
        ['Assassino Fantasmagórico', 4, 'Ilusão', '1 ação', '36 m', 'V, S', 'Concentração, 1 minuto', 'C', ['Mago'], '4d10 Psíquico (SAB/INT)', 'Manifesta o pior pesadelo de uma criatura (SAB nega): fica Amedrontada e sofre 4d10 psíquico por turno se falhar em repetir a salvaguarda.'],
        ['Praga (Blight)', 4, 'Necromancia', '1 ação', '9 m', 'V, S', 'Instantânea', '', ['Bruxo', 'Druida', 'Feiticeiro', 'Mago'], '8d8 Necrótico (CON)', 'Drena a umidade vital de uma criatura: CON metade ou 8d8 necrótico (dano máximo e desvantagem para plantas mágicas).'],
        ['Confusão', 4, 'Encantamento', '1 ação', '27 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bardo', 'Druida', 'Feiticeiro', 'Mago'], '1d10 Comportamento', 'Criaturas em esfera de 3 m (SAB nega) rolam 1d10 no início do turno: ficam paradas, vagam aleatoriamente ou atacam o mais próximo.'],
        ['Pele de Pedra', 4, 'Abjuração', '1 ação', 'Toque', 'V, S, M (pó diamante 100 po)', 'Concentração, 1 hora', 'C', ['Druida', 'Feiticeiro', 'Mago', 'Patrulheiro'], '', 'Pele do alvo endurece como granito, concedendo resistência a dano contundente, cortante e perfurante NÃO MÁGICO.'],
        ['Escudo de Fogo', 4, 'Evocação', '1 ação', 'Pessoal', 'V, S, M', '10 minutos', '', ['Mago', 'Feiticeiro'], '2d8 Fogo ou Frio', 'Envolve você em chamas quentes (resistência a frio) ou gélidas (resistência a fogo); atacantes corpo a corpo a até 1,5 m sofrem 2d8 do elemento oposto.'],
        ['Sombra de Moil', 4, 'Necromancia', '1 ação', 'Pessoal', 'V, S, M (150 po)', 'Concentração, 1 minuto', 'C', ['Bruxo'], '2d8 Necrótico', 'Sombras negras o deixam fortemente obscurecido (vantagem para atacar quem não o vê) e causam 2d8 necrótico a atacantes corpo a corpo.'],
        ['Esfera Vitriólica', 4, 'Evocação', '1 ação', '45 m', 'V, S, M', 'Instantânea', '', ['Feiticeiro', 'Mago'], '10d4 + 5d4 Ácido (DES)', 'Explode ácido em esfera de 6 m: DES metade (10d4 ácido + 5d4 ácido no fim do próximo turno de quem falhar!).'],
        ['Compulsão', 4, 'Encantamento', '1 ação', '9 m', 'V, S', 'Concentração, 1 minuto', 'C', ['Bardo'], '', 'Criaturas a até 9 m (SAB nega) precisam gastar seu movimento a cada turno na direção cardinal que você indicar com ação bônus.'],
        ['Movimentação Livre', 4, 'Abjuração', '1 ação', 'Toque', 'V, S, M', '1 hora', '', ['Bardo', 'Clérigo', 'Druida', 'Patrulheiro'], '', 'Ignora terreno difícil e efeitos mágicos que reduzem deslocamento, além de impedir Paralisia e condição Restringido.'],
        ['Proteção contra a Morte', 4, 'Abjuração', '1 ação', 'Toque', 'V, S', '8 horas', '', ['Clérigo', 'Paladino'], '', 'Se o alvo cair a 0 PV, permanece com 1 PV em vez disso (uma vez) e anula o próximo efeito de morte instantânea sem dano.'],
        ['Terreno Alucinógeno', 4, 'Ilusão', '10 minutos', '90 m', 'V, S, M', '24 horas', '', ['Bardo', 'Bruxo', 'Druida', 'Mago'], '', 'Faz terreno natural num cubo de 45 m parecer, soar e cheirar exatamente como outro tipo de bioma.'],
        ['Cão Fiel de Mordenkainen', 4, 'Conjuração', '1 ação', '9 m', 'V, S, M', '8 horas', '', ['Mago'], '4d8 Perfurante', 'Cão guardião invisível late ao detectar intrusos e morde inimigos a até 1,5 m com ataque + seu bônus de conjuração causando 4d8 perfurante.'],

        // === 5º CÍRCULO (18) ===
        ['Cone de Frio', 5, 'Evocação', '1 ação', 'Cone 18 m', 'V, S, M', 'Instantânea', '', ['Feiticeiro', 'Mago', 'Druida'], '8d8 Frio (CON)', 'Rajada glacial num cone enorme de 18 m: CON metade ou 8d8 de dano de frio; quem morrer congelado vira estátua de gelo.'],
        ['Muralha de Energia (Wall of Force)', 5, 'Evocação', '1 ação', '36 m', 'V, S, M', 'Concentração, 10 minutos', 'C', ['Mago'], '', 'Cria cúpula, esfera ou parede de força invisível e indestrutível a dano físico/mágico comum (apenas Desintegrar ou teletransporte supera).'],
        ['Animar Objetos', 5, 'Transmutação', '1 ação', '36 m', 'V, S', 'Concentração, 1 minuto', 'C', ['Bardo', 'Feiticeiro', 'Mago'], '10x (1d4+4) / 2024', 'Dá vida a objetos não mágicos ao alcance que lutam sob comando de ação bônus (ex.: 10 moedas/adagas ou estátuas menores).'],
        ['Telecinese', 5, 'Transmutação', '1 ação', '18 m', 'V, S', 'Concentração, 10 minutos', 'C', ['Feiticeiro', 'Mago'], '', 'Move criaturas Enormes ou menores (teste oposto de atributo vs FOR) ou objetos de até 500 kg até 9 m por turno, podendo deixá-los Restringidos no ar.'],
        ['Sinapse Estática (Synaptic Static)', 5, 'Encantamento', '1 ação', '36 m', 'V, S', 'Instantânea', '', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '8d6 Psíquico (INT)', 'Explosão psíquica em esfera de 6 m: INT metade (8d6 psíquico). Quem falhar subtrai 1d6 de TODOS os ataques, testes e Concentração por 1 minuto!'],
        ['Passo Distante (Far Step)', 5, 'Conjuração', '1 ação bônus', 'Pessoal', 'V', 'Concentração, 1 minuto', 'C', ['Bruxo', 'Feiticeiro', 'Mago'], '', 'Permite teletransportar até 18 metros no lançamento E novamente como ação bônus em cada turno pelo próximo minuto.'],
        ['Imobilizar Monstro', 5, 'Encantamento', '1 ação', '27 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Qualquer tipo de criatura (não morta-viva) deve passar em SAB ou ficar completamente Paralisada por até 1 minuto!'],
        ['Dominar Pessoa', 5, 'Encantamento', '1 ação', '18 m', 'V, S', 'Concentração, 1 minuto', 'C', ['Bardo', 'Feiticeiro', 'Mago'], '', 'Assume controle telepático de um humanoide (SAB nega; vantagem se em combate). Pode emitir comandos simples ou assumir controle direto com ação.'],
        ['Nuvem Mortal (Cloudkill)', 5, 'Conjuração', '1 ação', '36 m', 'V, S', 'Concentração, 10 minutos', 'C', ['Feiticeiro', 'Mago'], '5d8 Veneno (CON)', 'Esfera verde venenosa de 6 m que avança 3 m por rodada para longe de você: CON metade ou 5d8 de dano de veneno ao iniciar o turno lá.'],
        ['Golpe Flamejante (Flame Strike)', 5, 'Evocação', '1 ação', '18 m', 'V, S, M', 'Instantânea', '', ['Clérigo'], '4d6 Fogo + 4d6 Radiante', 'Coluna divina de fogo sagrado num cilindro de 3 m x 12 m: DES metade ou 4d6 fogo + 4d6 radiante (2024: 5d6 + 5d6).'],
        ['Onda Destrutiva', 5, 'Evocação', '1 ação', 'Pessoal (9 m)', 'V', 'Instantânea', '', ['Paladino'], '5d6 Trov + 5d6 Rad/Nec', 'Golpeia o chão liberando onda de 9 m apenas em inimigos à escolha: CON metade (5d6 trovejante + 5d6 radiante/necrótico e cai Derrubado).'],
        ['Restauração Maior', 5, 'Abjuração', '1 ação', 'Toque', 'V, S, M (pó diamante 100 po)', 'Instantânea', '', ['Bardo', 'Clérigo', 'Druida'], '', 'Remove 1 nível de Exaustão, efeito de Enfeitiçado/Petrificado, maldição (incluindo sintonização), redução de atributo ou redução de PV máximo.'],
        ['Curar Ferimentos em Massa', 5, 'Evocação', '1 ação', '18 m', 'V, S', 'Instantânea', '', ['Bardo', 'Clérigo', 'Druida'], '3d8+Mod (2024: 5d8+Mod)', 'Onda curativa num ponto a 18 m restaura 3d8 + mod (2024: 5d8 + mod) PV em até 6 criaturas numa esfera de 9 m.'],
        ['Círculo de Poder', 5, 'Abjuração', '1 ação', 'Pessoal (9 m)', 'V', 'Concentração, 10 minutos', 'C', ['Paladino', 'Clérigo (2024)'], '', 'Aliados a até 9 m têm vantagem em todas as salvaguardas contra magias e sofrem ZERO dano se passarem (metade se falharem!).'],
        ['Círculo de Teletransporte', 5, 'Conjuração', '1 minuto', '3 m', 'V, M (50 po)', '1 rodada', '', ['Bardo', 'Feiticeiro', 'Mago'], '', 'Abre um portal de 3 m por 1 rodada conectado instantaneamente a qualquer círculo permanente de sigilos conhecido no mesmo plano.'],
        ['Muralha de Pedra', 5, 'Evocação', '1 ação', '36 m', 'V, S, M', 'Concentração, 10 minutos', 'C', ['Druida', 'Feiticeiro', 'Mago'], '', 'Ergue muralha sólida de pedra de até dez painéis de 3x3 m. Se mantida pelos 10 minutos inteiros, torna-se permanente!'],
        ['Reviver os Mortos (Raise Dead)', 5, 'Necromancia', '1 hora', 'Toque', 'V, S, M (diamante 500 po)', 'Instantânea', '', ['Bardo', 'Clérigo', 'Paladino'], '', 'Ressuscita criatura morta há até 10 dias com 1 PV (sofre -4 temporário em testes que diminui em 1 por descanso longo).'],
        ['Espionagem (Scrying)', 5, 'Adivinhação', '10 minutos', 'Pessoal', 'V, S, M (foco 1000 po)', 'Concentração, 10 minutos', 'C', ['Bardo', 'Bruxo', 'Clérigo', 'Druida', 'Mago'], '', 'Espia qualquer criatura no mesmo plano (SAB modificada por familiaridade e vínculo físico/objeto pessoal).'],

        // === 6º CÍRCULO (14) ===
        ['Desintegrar', 6, 'Transmutação', '1 ação', '18 m', 'V, S, M', 'Instantânea', '', ['Feiticeiro', 'Mago'], '10d6+40 Força (DES)', 'Raio verde fino acerta criatura ou cubo de força: DES ou sofre 10d6+40 de dano de força. Se reduzir criatura a 0 PV, transforma-a em pó cinzento!'],
        ['Corrente de Relâmpagos', 6, 'Evocação', '1 ação', '45 m', 'V, S, M', 'Instantânea', '', ['Feiticeiro', 'Mago'], '10d8 Elétrico (DES)', 'Um raio principal atinge um alvo e salta para até 3 alvos secundários a até 9 m: cada um faz DES metade ou sofre 10d8 elétrico.'],
        ['Cura Completa (Heal)', 6, 'Evocação', '1 ação', '18 m', 'V, S', 'Instantânea', '', ['Clérigo', 'Druida'], '+70 PV', 'Fluxo de energia positiva recupera 70 Pontos de Vida de uma criatura e encerra cegueira, surdez e quaisquer doenças.'],
        ['Esfera Congelante de Otiluke', 6, 'Evocação', '1 ação', '90 m', 'V, S, M', 'Instantânea', '', ['Mago', 'Feiticeiro (2024)'], '10d6 Frio (CON)', 'Orbe glacial explode em enorme esfera de 18 m de raio: CON metade ou 10d6 de dano de frio (pode ser guardado como bomba arremessável por 1 min).'],
        ['Globo de Invulnerabilidade', 6, 'Abjuração', '1 ação', 'Pessoal (3 m)', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Feiticeiro', 'Mago'], '', 'Barreira imóvel de 3 m ao redor bloqueia TODA magia de 5º círculo ou inferior lançada de fora — mesmo se conjurada com espaço superior!'],
        ['Olhar Penetrante (Eyebite)', 6, 'Necromancia', '1 ação', 'Pessoal', 'V, S', 'Concentração, 1 minuto', 'C', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Seus olhos ficam negros; a cada turno pode usar ação para deixar alvo (SAB nega) Adormecido, Em Pânico ou Enjoado/Doente.'],
        ['Dança Irresistível de Otto', 6, 'Encantamento', '1 ação', '9 m', 'V', 'Concentração, 1 minuto', 'C', ['Bardo', 'Mago'], '', 'Alvo começa a dançar sem salvaguarda inicial! Deslocamento 0, desvantagem em ataques e DES, e ataques contra ele têm vantagem (gasta ação para SAB).'],
        ['Visão da Verdade (True Seeing)', 6, 'Adivinhação', '1 ação', 'Toque', 'V, S, M (25 po)', '1 hora', '', ['Bardo', 'Bruxo', 'Clérigo', 'Feiticeiro', 'Mago'], '', 'Alvo recebe Visão Verdadeira de 36 metros por 1 hora, vendo através de toda escuridão, ilusão, invisibilidade, metamorfose e Plano Etéreo.'],
        ['Carne para Pedra', 6, 'Transmutação', '1 ação', '18 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Bruxo', 'Mago'], '', 'Tenta petrificar um alvo (CON): falha inicial deixa Restringido e, se falhar 3 vezes antes de 3 sucessos, petrifica permanentemente.'],
        ['Banquete de Heróis', 6, 'Conjuração', '10 minutos', '9 m', 'V, S, M (tigela 1000 po)', 'Instantânea', '', ['Bardo', 'Clérigo', 'Druida'], '+2d10 PV Máx', 'Banquete para até 12 criaturas garante imunidade a veneno e medo, vantagem em SAB e +2d10 no máximo de PV por 24 horas.'],
        ['Caminhar no Vento', 6, 'Transmutação', '1 minuto', '9 m', 'V, S, M', '8 horas', '', ['Druida'], '', 'Você e até 10 aliados assumem forma gasosa com impressionante deslocamento de voo de 90 metros (300 pés) por 8 horas.'],
        ['Círculo da Morte', 6, 'Necromancia', '1 ação', '45 m', 'V, S, M (500 po)', 'Instantânea', '', ['Bruxo', 'Feiticeiro', 'Mago'], '8d6 Necrótico (CON)', 'Esfera gigantesca de 18 m de raio suga vida de todos na área: CON metade ou 8d6 de dano necrótico (2024: 8d8).'],
        ['Raio Solar (Sunbeam)', 6, 'Evocação', '1 ação', 'Linha 18 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Druida', 'Feiticeiro', 'Mago'], '6d8 Radiante (CON)', 'Linha de 18 m x 1,5 m de luz solar verdadeira a cada turno: CON metade ou 6d8 radiante e Cega o alvo por 1 turno (mortos-vivos/gosmas com desvantagem).'],
        ['Portão Arcano', 6, 'Conjuração', '1 ação', '150 m', 'V, S', 'Concentração, 10 minutos', 'C', ['Bruxo', 'Feiticeiro', 'Mago'], '', 'Cria dois portais interligados a até 150 m entre si, permitindo passagem instantânea de ataque visual ou movimento entre ambos.'],

        // === 7º CÍRCULO (12) ===
        ['Rajada Prismática', 7, 'Evocação', '1 ação', 'Cone 18 m', 'V, S', 'Instantânea', '', ['Feiticeiro', 'Mago'], '10d6 Elemental / Efeitos', 'Cone arco-íris de 18 m: cada criatura rola 1d8 para a cor que a atinge (10d6 Fogo/Ácido/Elétrico/Veneno/Frio, Petrificação ou Banimento!).'],
        ['Bola de Fogo Controlada', 7, 'Evocação', '1 ação', '45 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Feiticeiro', 'Mago'], '12d6+ Fogo (DES)', 'Dispara conta brilhante que acumula +1d6 de fogo a cada rodada mantida (base 12d6) até explodir em esfera de 6 m (DES metade).'],
        ['Inverter Gravidade', 7, 'Transmutação', '1 ação', '30 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Druida', 'Feiticeiro', 'Mago'], 'Queda 30 m', 'Inverte a gravidade num cilindro de 15 m de raio x 30 m de altura; tudo cai PARA CIMA até o topo e cai de volta quando a magia termina!'],
        ['Teletransporte', 7, 'Conjuração', '1 ação', '3 m', 'V', 'Instantânea', '', ['Bardo', 'Feiticeiro', 'Mago'], '1d100 Precisão', 'Transporta instantaneamente você + até 8 voluntários a qualquer lugar conhecido no mesmo plano (risco via tabela d100 de familiaridade).'],
        ['Viagem Planar', 7, 'Conjuração', '1 ação', 'Toque', 'V, S, M (diapasão 250 po)', 'Instantânea', '', ['Bruxo', 'Clérigo', 'Druida', 'Feiticeiro', 'Mago'], '', 'Transporta até 8 aliados para outro Plano de Existência ou bane uma criatura hostil (ataque mágico + CAR) permanentemente.'],
        ['Jaula de Energia (Forcecage)', 7, 'Evocação', '1 ação', '30 m', 'V, S, M (rubi 1500 po)', '1 hora (Sem Conc!)', '', ['Bardo', 'Bruxo', 'Mago'], '', 'Prisão invisível e imóvel de força pura (cubo de 6 m ou jaula com grades de 3 m) que dura 1 hora SEM concentração; teletransporte exige CAR.'],
        ['Dedo da Morte', 7, 'Necromancia', '1 ação', '18 m', 'V, S', 'Instantânea', '', ['Bruxo', 'Feiticeiro', 'Mago'], '7d8+30 Necrótico (CON)', 'Envia energia mortal através de uma criatura: CON metade ou 7d8+30 necrótico. Humanoides mortos levantam-se como Zumbis permanentemente leais a você!'],
        ['Tempestade de Fogo', 7, 'Evocação', '1 ação', '45 m', 'V, S', 'Instantânea', '', ['Clérigo', 'Druida', 'Feiticeiro'], '7d10 Fogo (DES)', 'Até dez cubos conectados de 3 m explodem em chamas sagradas ou naturais: DES metade ou 7d10 de dano de fogo sem destruir plantas à escolha.'],
        ['Simulacro', 7, 'Ilusão', '12 horas', 'Toque', 'V, S, M (rubi 1500 po)', 'Até ser dissipado', '', ['Mago'], '', 'Cria uma cópia de neve e gelo de qualquer fera ou humanoide com metade dos PV máximos e todas as capacidades (sem recuperar espaços gastos).'],
        ['Forma Etérea', 7, 'Transmutação', '1 ação', 'Pessoal', 'V, S', 'Até 8 horas', '', ['Bardo', 'Bruxo', 'Clérigo', 'Feiticeiro', 'Mago'], '', 'Você entra na Fronteira Etérea, atravessando paredes e ficando completamente invisível e intangível para o Plano Material.'],
        ['Palavra Divina', 7, 'Evocação', '1 ação bônus', '9 m', 'V', 'Instantânea', '', ['Clérigo'], 'Morte <= 20 PV (CAR)', 'Criaturas à escolha (CAR nega) sofrem efeitos conforme PV atuais: <=50 Surda 1 min, <=40 Cega 10 min, <=30 Atordoada 1h, <=20 MORTE instantânea!'],
        ['Coroa de Estrelas', 7, 'Evocação', '1 ação', 'Pessoal', 'V, S', '1 hora (Sem Conc!)', '', ['Bruxo', 'Feiticeiro', 'Mago'], '4d12 Radiante', 'Sete partículas estelares orbitam sua cabeça por 1 hora sem concentração. Ação bônus dispara uma delas a 36 m causando 4d12 radiante.'],

        // === 8º CÍRCULO (10) ===
        ['Campo Antimagia', 8, 'Abjuração', '1 ação', 'Pessoal (esfera 3 m)', 'V, S, M', 'Concentração, 1 hora', 'C', ['Clérigo', 'Mago'], '', 'Esfera de 3 m ao redor anula TODAS as magias, invocações e itens mágicos (exceto artefatos e divindades).'],
        ['Dominar Monstro', 8, 'Encantamento', '1 ação', '18 m', 'V, S', 'Concentração, 1 hora', 'C', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '', 'Subjuga telepaticamente QUALQUER criatura (SAB nega; vantagem se já em combate com você) por até 1 hora.'],
        ['Terremoto', 8, 'Evocação', '1 ação', '150 m', 'V, S, M', 'Concentração, 1 minuto', 'C', ['Clérigo', 'Druida', 'Feiticeiro'], '50 Dano Estruturas / Fissuras', 'Abala um círculo de 30 m por 1 minuto: derruba criaturas, abre fissuras mortais no chão, rompe concentração e desmorona edificações.'],
        ['Explosão Solar (Sunburst)', 8, 'Evocação', '1 ação', '45 m', 'V, S, M', 'Instantânea', '', ['Druida', 'Feiticeiro', 'Mago'], '12d6 Radiante (CON)', 'Clarão solar cegante numa gigantesca esfera de 18 m de raio: CON metade ou 12d6 radiante + Cegueira por 1 minuto (dissipa escuridão de qualquer círculo).'],
        ['Nuvem Incendiária', 8, 'Conjuração', '1 ação', '45 m', 'V, S', 'Concentração, 1 minuto', 'C', ['Druida', 'Feiticeiro', 'Mago'], '10d8 Fogo (DES)', 'Esfera móvel de brasa e fumaça de 6 m (avança 3 m/turno): DES metade ou 10d8 de dano de fogo dentro da nuvem.'],
        ['Labirinto (Maze)', 8, 'Conjuração', '1 ação', '18 m', 'V, S', 'Concentração, 10 minutos', 'C', ['Mago'], 'Teste INT CD 20', 'Bane instantaneamente uma criatura SEM SALVAGUARDA INICIAL para um semiplano labiríntico! Para escapar precisa gastar ação e vencer INT CD 20.'],
        ['Palavra de Poder: Atordoar', 8, 'Encantamento', '1 ação', '18 m', 'V', 'Instantânea', '', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '<= 150 PV', 'Se o alvo tiver 150 PV ou menos, fica automaticamente Atordoado (sem teste inicial; CON no fim de cada turno tenta encerrar).'],
        ['Mente em Branco', 8, 'Abjuração', '1 ação', 'Toque', 'V, S', '24 horas', '', ['Bardo', 'Mago'], '', 'Por 24 horas, alvo tem imunidade total a dano psíquico, leitura mental, detecção e condição Enfeitiçado — mesmo contra Desejo!'],
        ['Forma Semilíquida / Telepatia', 8, 'Evocação', '1 ação', 'Ilimitado (mesmo plano)', 'V, S, M', '24 horas', '', ['Mago'], '', 'Estabelece telepatia instantânea bidirecional e compartilhamento de imagens sensoriais com uma criatura voluntária por 24h.'],
        ['Clone', 8, 'Necromancia', '1 hora', 'Toque', 'V, S, M (diamante 1000 po)', 'Instantânea', '', ['Mago'], '', 'Cultiva por 120 dias um corpo reserva idêntico em urna selada: se o original morrer, a alma transfere instantaneamente para o clone intacto.'],

        // === 9º CÍRCULO (10) ===
        ['Chuva de Meteoros (Meteor Swarm)', 9, 'Evocação', '1 ação', '1,5 km', 'V, S', 'Instantânea', '', ['Feiticeiro', 'Mago'], '20d6 Fogo + 20d6 Contundente', 'Quatro meteoros colossais caem em esferas de 12 m de raio cada: DES metade ou assustadores 20d6 de fogo + 20d6 contundente (40d6 no total!).'],
        ['Desejo (Wish)', 9, 'Conjuração', '1 ação', 'Pessoal', 'V', 'Instantânea', '', ['Feiticeiro', 'Mago'], '', 'A magia mais poderosa mortal: duplica instantaneamente qualquer magia de até 8º círculo sem componentes/custo OU reescreve a realidade (com risco de perder Desejo).'],
        ['Parar o Tempo (Time Stop)', 9, 'Transmutação', '1 ação', 'Pessoal', 'V', 'Instantânea', '', ['Feiticeiro', 'Mago'], '1d4+1 Turnos', 'O fluxo temporal congela para todos os outros seres. Você realiza 1d4+1 turnos consecutivos sozinho antes que o tempo volte a correr.'],
        ['Palavra de Poder: Matar', 9, 'Encantamento', '1 ação', '18 m', 'V', 'Instantânea', '', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '<= 100 PV = Morte', 'Profere palavra de poder absoluto: se o alvo tiver 100 Pontos de Vida atuais ou menos, MORRE instantaneamente sem salvaguarda!'],
        ['Sexto Sentido (Foresight)', 9, 'Adivinhação', '1 minuto', 'Toque', 'V, S, M', '8 horas (Sem Conc!)', '', ['Bardo', 'Bruxo', 'Druida', 'Mago'], '', 'Por 8 horas sem concentração: alvo não pode ser surpreendido, tem VANTAGEM em ataques, testes e salvaguardas, e atacantes têm desvantagem contra ele!'],
        ['Metamorfose Verdadeira', 9, 'Transmutação', '1 ação', '9 m', 'V, S, M', 'Concentração, 1 hora', 'C', ['Bardo', 'Bruxo', 'Mago'], '', 'Transforma criatura em outra criatura de ND igual ou menor, objeto em criatura (ND <= 9) ou criatura em objeto. Se concentrar 1 hora, torna-se permanente!'],
        ['Grito Psíquico (Psychic Scream)', 9, 'Encantamento', '1 ação', '27 m', 'S', 'Instantânea', '', ['Bardo', 'Bruxo', 'Feiticeiro', 'Mago'], '14d6 Psíquico (INT)', 'Rompe as mentes de até 10 criaturas à vista (INT): falha causa 14d6 psíquico + Atordoado; quem morrer tem a cabeça explodida!'],
        ['Muralha Prismática', 9, 'Abjuração', '1 ação', '18 m', 'V, S', '10 minutos (Sem Conc!)', '', ['Bardo', 'Mago'], '7 Camadas (10d6 each)', 'Cintilante muralha de 7 cores (30x9 m ou esfera 9 m): cada camada bloqueia tipos específicos e causa danos massivos, cegueira, petrificação ou transporte planar.'],
        ['Tempestade da Vingança', 9, 'Conjuração', '1 ação', 'Visão (1,5 km)', 'V, S', 'Concentração, 1 minuto', 'C', ['Druida'], '1d6+2d6 Ácido / 10d6 Raios', 'Tempestade colossal de 110 m de raio piora a cada turno ao longo de 10 rodadas: chuva ácida, 6 relâmpagos de 10d6, ventania e granizo letal!'],
        ['Prisão (Imprisonment)', 9, 'Abjuração', '1 minuto', '9 m', 'V, S, M (500 po/DV)', 'Até ser dissipado', '', ['Bruxo', 'Mago'], '', 'Sela uma criatura eternamente (SAB nega) em Soterra, Acorrentamento, Prisão Hedionda, Minimus ou Sono Eterno até a condição específica de libertação ocorrer.']
    ];

    // ------------------------------------------------------------------------
    // CONVERSÃO CANÔNICA & ESTADO PERSISTENTE DO MÓDULO
    // ------------------------------------------------------------------------
    function makeSlugId(prefix, idx, title) {
        const clean = String(title || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 36);
        return `${prefix}-${idx}-${clean || 'entry'}`;
    }

    const BUILTIN_EFFECTS = [
        ...RAW_CLASSIC_EFFECTS.map((row, idx) => ({
            id: makeSlugId('wm-cls', idx + 1, row[2]),
            table: 'classic',
            min: row[0],
            max: row[1],
            code: `${String(row[0]).padStart(2, '0')}–${row[1] === 100 ? '00' : String(row[1]).padStart(2, '0')}`,
            title: row[2],
            category: row[3],
            severity: row[4],
            duration: row[5],
            rollFormula: row[6] || '',
            description: row[7],
            builtin: true
        })),
        ...RAW_CHAOS_EFFECTS.map((row, idx) => ({
            id: makeSlugId('wm-chs', idx + 1, row[1]),
            table: 'chaos',
            min: 0,
            max: 0,
            code: row[0],
            title: row[1],
            category: row[2],
            severity: row[3],
            duration: row[4],
            rollFormula: row[5] || '',
            description: row[6],
            builtin: true
        })),
        ...RAW_COSMIC_EFFECTS.map((row, idx) => ({
            id: makeSlugId('wm-cos', idx + 1, row[1]),
            table: 'cosmic',
            min: 0,
            max: 0,
            code: row[0],
            title: row[1],
            category: row[2],
            severity: row[3],
            duration: row[4],
            rollFormula: row[5] || '',
            description: row[6],
            builtin: true
        }))
    ];

    const BUILTIN_SPELLS = RAW_BUILTIN_SPELLS.map((row, idx) => {
        const flags = String(row[7] || '').toUpperCase();
        const dmgText = row[9] || '';
        const fMatch = dmgText.match(/\d+d\d+(?:\s*[+-]\s*\d+)?/i);
        return {
            id: makeSlugId('sp-bi', idx + 1, row[0]),
            name: row[0],
            level: Number(row[1]) || 0,
            school: row[2] || 'Evocação',
            castingTime: row[3] || '1 ação',
            range: row[4] || '9 m',
            components: row[5] || 'V, S',
            duration: row[6] || 'Instantânea',
            concentration: flags.includes('C'),
            ritual: flags.includes('R'),
            classes: Array.isArray(row[8]) ? row[8].slice() : [],
            damageOrRoll: dmgText,
            rollFormula: fMatch ? fMatch[0].replace(/\s+/g, '') : '',
            description: row[10] || '',
            builtin: true
        };
    });

    function createDefaultWildMagicState() {
        return {
            activeTab: 'calc', // 'calc' | 'generator' | 'import' | 'library' | 'history'
            config: {
                rulePreset: 'escalating', // 'phb' | 'escalating' | 'spellLevel' | 'percent' | 'custom'
                dieType: 20,              // 20 | 100
                baseThreshold: 1,
                perLevelBonus: 0,         // soma por círculo (0, 0.5, 1, 2)
                escalationStep: 1,        // 0 | 1 | 2 | 'level'
                streakCount: 0,
                zoneModifier: 0,
                tidesOfChaos: false,
                cantripTriggers: false,
                controlledChaos: false,
                secretRoll: true,
                tableFilter: 'all',       // 'classic' | 'chaos' | 'cosmic' | 'all' | 'custom'
                severityFilter: 'all',    // 'all' | 'benefico' | 'neutro' | 'perigoso' | 'catastrofico'
                casterName: '',
                spellLevel: 1
            },
            generator: {
                count: 1,
                minLevel: 0,
                maxLevel: 9,
                school: 'all',
                className: 'all',
                sourceFilter: 'all',      // 'all' | 'builtin' | 'custom'
                concentrationFilter: 'all',
                ritualOnly: false,
                attackOrDamageOnly: false,
                applyChaosMutation: false,
                includeScrollStats: false
            },
            customSpells: [],
            customEffects: [],
            favoriteSpellIds: [],
            history: [],
            lastCalculationResult: null,
            lastGeneratedSpells: [],
            pendingImportPreview: null,
            libraryType: 'effects',       // 'effects' | 'spells'
            librarySearch: '',
            libraryTableFilter: 'all',
            libraryLevelFilter: 'all',
            librarySchoolFilter: 'all'
        };
    }

    let wmState = createDefaultWildMagicState();

    // ------------------------------------------------------------------------
    // UTILITÁRIOS DE SEGURANÇA, ESCAPE E DADOS
    // ------------------------------------------------------------------------
    function isGmAuthorized() {
        if (typeof isEffectiveGmUser === 'function') return isEffectiveGmUser();
        if (typeof window !== 'undefined' && window.isHostClient === false) return false;
        if (typeof getActivePlayer === 'function') {
            const p = getActivePlayer();
            return Boolean(p && !p.isUnauthenticated && p.role === 'gm');
        }
        return true;
    }

    function escapeHtml(text) {
        if (typeof escapeHtmlText === 'function') return escapeHtmlText(text);
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeText(str) {
        return String(str ?? '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    function strip5eToolsTags(str) {
        return String(str ?? '')
            .replace(/\{@dc\s+([^|}]+)(?:\|[^}]*)?\}/gi, 'CD $1')
            .replace(/\{@hit\s+([^|}]+)(?:\|[^}]*)?\}/gi, '+$1')
            .replace(/\{@damage\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
            .replace(/\{@dice\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
            .replace(/\{@scaledamage\s+[^|}]*\|[^|}]*\|([^}]+)\}/gi, '(+$1/nível)')
            .replace(/\{@scaledice\s+[^|}]*\|[^|}]*\|([^}]+)\}/gi, '(+$1/nível)')
            .replace(/\{@[a-zA-Z]+\s+([^|}]+)(?:\|[^|}]*)?(?:\|([^}]*))?\}/gi, (_, primary, label) => label || primary);
    }

    function flatten5eEntries(entries) {
        if (!entries) return '';
        if (typeof entries === 'string') return strip5eToolsTags(entries);
        if (!Array.isArray(entries)) return strip5eToolsTags(String(entries));
        return entries.map(e => {
            if (typeof e === 'string') return strip5eToolsTags(e);
            if (e && typeof e === 'object') {
                const head = e.name ? `${e.name}: ` : '';
                if (Array.isArray(e.entries)) return head + flatten5eEntries(e.entries);
                if (Array.isArray(e.items)) return head + flatten5eEntries(e.items);
                if (e.entry) return head + strip5eToolsTags(e.entry);
            }
            return '';
        }).filter(Boolean).join(' ');
    }

    function extractDiceFormula(text) {
        const m = String(text || '').match(/\b\d+d(?:4|6|8|10|12|20|100)(?:\s*[+-]\s*\d+)?\b/i);
        return m ? m[0].replace(/\s+/g, '') : '';
    }

    function normalizeSchoolName(raw) {
        const clean = String(raw || '').trim();
        if (!clean) return 'Evocação';
        const upper = clean.toUpperCase();
        if (SCHOOL_ABBR_MAP[upper]) return SCHOOL_ABBR_MAP[upper];
        const norm = normalizeText(clean);
        for (const s of SCHOOLS) {
            if (normalizeText(s) === norm || normalizeText(s).startsWith(norm.slice(0, 4))) return s;
        }
        const enMap = {
            abjuration: 'Abjuração',
            divination: 'Adivinhação',
            conjuration: 'Conjuração',
            enchantment: 'Encantamento',
            evocation: 'Evocação',
            illusion: 'Ilusão',
            necromancy: 'Necromancia',
            transmutation: 'Transmutação'
        };
        for (const [k, v] of Object.entries(enMap)) {
            if (norm.includes(k.slice(0, 4))) return v;
        }
        return 'Caótica / Homebrew';
    }

    function normalizeSeverity(raw) {
        const norm = normalizeText(raw);
        if (norm.includes('benef')) return 'benefico';
        if (norm.includes('catast') || norm.includes('letal') || norm.includes('extremo')) return 'catastrofico';
        if (norm.includes('perig') || norm.includes('hostil') || norm.includes('dano')) return 'perigoso';
        return 'neutro';
    }

    function severityBadge(sev) {
        if (sev === 'benefico') return { label: 'Benéfico', cls: 'wm-sev-good' };
        if (sev === 'perigoso') return { label: 'Perigoso', cls: 'wm-sev-warn' };
        if (sev === 'catastrofico') return { label: 'Catastrófico', cls: 'wm-sev-deadly' };
        return { label: 'Neutro / Caos', cls: 'wm-sev-neutral' };
    }

    function tableLabel(tbl) {
        if (tbl === 'classic') return 'Clássica PHB (01–100)';
        if (tbl === 'chaos') return 'Expandida Arcana';
        if (tbl === 'cosmic') return 'Cósmica / Hadar';
        if (tbl === 'custom') return 'Importada / Custom';
        return 'Todas Combinadas';
    }

    function levelLabel(lvl) {
        const n = Number(lvl) || 0;
        return n === 0 ? 'Truque (0º)' : `${n}º Círculo`;
    }

    function rollSingleDie(faces) {
        return Math.floor(Math.random() * Math.max(1, Number(faces) || 20)) + 1;
    }

    function rollFormulaQuick(expr, label = 'Magia Selvagem', options = {}) {
        const cleanExpr = String(expr || '1d20').trim();
        const isSecret = options.isSecret !== undefined ? Boolean(options.isSecret) : Boolean(wmState.config.secretRoll);
        if (typeof CompendioDice !== 'undefined' && typeof CompendioDice.rollExpression === 'function') {
            const rec = CompendioDice.rollExpression(cleanExpr, label, {
                isSecret,
                skipExhaustion: true,
                skip3d: options.skip3d !== undefined ? options.skip3d : isSecret
            });
            if (rec) return rec;
        }
        // Fallback offline/headless (ex: testes Node)
        let total = 0;
        const rolls = [];
        const parts = cleanExpr.replace(/\s+/g, '').match(/[+-]?(?:\d*d\d+|\d+)/gi) || ['1d20'];
        parts.forEach(p => {
            const sign = p.startsWith('-') ? -1 : 1;
            const body = p.replace(/^[+-]/, '');
            const dm = body.match(/^(\d*)d(\d+)$/i);
            if (dm) {
                const cnt = Math.max(1, parseInt(dm[1] || '1', 10));
                const f = Math.max(1, parseInt(dm[2], 10));
                for (let i = 0; i < cnt; i++) {
                    const r = rollSingleDie(f);
                    rolls.push({ faces: f, value: r, sign });
                    total += sign * r;
                }
            } else {
                const c = parseInt(body, 10) || 0;
                total += sign * c;
            }
        });
        return {
            id: 'wm-roll-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            formula: cleanExpr,
            total,
            breakdown: cleanExpr + ' ➔ ' + total,
            diceResults: rolls,
            isSecret
        };
    }

    function normalizeSpellRecord(raw, idx = 0) {
        if (!raw) return null;
        if (typeof raw === 'string') {
            const clean = raw.trim();
            if (!clean) return null;
            return {
                id: makeSlugId('sp-cu', Date.now() + idx, clean),
                name: clean,
                level: 1,
                school: 'Caótica / Homebrew',
                castingTime: '1 ação',
                range: '18 m',
                components: 'V, S',
                duration: 'Instantânea',
                concentration: false,
                ritual: false,
                classes: ['Feiticeiro', 'Mago'],
                damageOrRoll: '',
                rollFormula: '',
                description: clean,
                builtin: false
            };
        }
        if (typeof raw !== 'object') return null;

        const name = String(raw.name || raw.nome || raw.title || raw.titulo || '').trim();
        if (!name) return null;

        let levelNum = raw.level ?? raw.nivel ?? raw.circle ?? raw.circulo ?? 1;
        if (typeof levelNum === 'string') {
            if (/truque|cantrip/i.test(levelNum)) levelNum = 0;
            else levelNum = parseInt(levelNum, 10);
        }
        levelNum = Math.max(0, Math.min(9, Number.isFinite(Number(levelNum)) ? Number(levelNum) : 1));

        // Suporte a formato 5e.tools
        let castingTime = raw.castingTime || raw.tempo || '1 ação';
        if (Array.isArray(raw.time) && raw.time[0]) {
            const t = raw.time[0];
            const unitMap = { action: 'ação', bonus: 'ação bônus', reaction: 'reação', minute: 'minuto(s)', hour: 'hora(s)' };
            castingTime = `${t.number || 1} ${unitMap[t.unit] || t.unit || 'ação'}`;
        }

        let rangeStr = typeof raw.range === 'string' ? raw.range : (raw.alcance || '18 m');
        if (raw.range && typeof raw.range === 'object') {
            const d = raw.range.distance || {};
            if (d.type === 'self') rangeStr = 'Pessoal';
            else if (d.type === 'touch') rangeStr = 'Toque';
            else if (d.amount) rangeStr = d.type === 'feet' ? `${Math.round(d.amount * 0.3)} m` : `${d.amount} ${d.type || 'm'}`;
        }

        let compStr = typeof raw.components === 'string' ? raw.components : (raw.componentes || 'V, S');
        if (raw.components && typeof raw.components === 'object') {
            const arr = [];
            if (raw.components.v) arr.push('V');
            if (raw.components.s) arr.push('S');
            if (raw.components.m) arr.push(typeof raw.components.m === 'string' ? `M (${raw.components.m})` : 'M');
            compStr = arr.join(', ') || 'V, S';
        }

        let durStr = typeof raw.duration === 'string' ? raw.duration : (raw.duracao || 'Instantânea');
        let isConc = Boolean(raw.concentration ?? raw.concentracao);
        if (Array.isArray(raw.duration) && raw.duration[0]) {
            const du = raw.duration[0];
            if (du.concentration) isConc = true;
            if (du.type === 'instant') durStr = 'Instantânea';
            else if (du.type === 'timed' && du.duration) {
                durStr = `${isConc ? 'Concentração, ' : ''}${du.duration.amount || 1} ${du.duration.type || 'minuto'}`;
            } else if (du.type === 'permanent') durStr = 'Permanente';
        }

        let desc = '';
        if (typeof raw.description === 'string') desc = strip5eToolsTags(raw.description);
        else if (typeof raw.descricao === 'string') desc = strip5eToolsTags(raw.descricao);
        else if (Array.isArray(raw.entries)) desc = flatten5eEntries(raw.entries);
        else if (typeof raw.text === 'string') desc = strip5eToolsTags(raw.text);
        desc = desc.trim() || 'Magia personalizada importada pelo Mestre.';

        let classes = [];
        if (Array.isArray(raw.classes)) classes = raw.classes.map(c => String(c).trim()).filter(Boolean);
        else if (typeof raw.classes === 'string') classes = raw.classes.split(/[,;/]/).map(s => s.trim()).filter(Boolean);
        else if (raw.classes && Array.isArray(raw.classes.fromClassList)) classes = raw.classes.fromClassList.map(c => c.name).filter(Boolean);

        const dmgText = String(raw.damageOrRoll || raw.damage || raw.dano || raw.formula || '').trim();
        const formula = String(raw.rollFormula || extractDiceFormula(dmgText) || extractDiceFormula(desc) || '').trim();

        return {
            id: String(raw.id || makeSlugId('sp-cu', Date.now() + idx, name)),
            name,
            level: levelNum,
            school: normalizeSchoolName(raw.school || raw.escola),
            castingTime: String(castingTime),
            range: String(rangeStr),
            components: String(compStr),
            duration: String(durStr),
            concentration: isConc,
            ritual: Boolean(raw.ritual || (raw.meta && raw.meta.ritual)),
            classes: classes.length > 0 ? classes : ['Feiticeiro', 'Mago'],
            damageOrRoll: dmgText || formula,
            rollFormula: formula,
            description: desc,
            builtin: false,
            sourceTag: raw.source || raw.fonte || 'Importada'
        };
    }

    function normalizeEffectRecord(raw, idx = 0) {
        if (!raw) return null;
        if (typeof raw === 'string') {
            const clean = raw.trim();
            if (!clean) return null;
            return {
                id: makeSlugId('wm-cu', Date.now() + idx, clean),
                table: 'custom',
                min: 0,
                max: 0,
                code: 'IMP',
                title: clean.length > 52 ? clean.slice(0, 49) + '...' : clean,
                category: 'Importado',
                severity: 'neutro',
                duration: 'Variável',
                rollFormula: extractDiceFormula(clean),
                description: clean,
                builtin: false
            };
        }
        if (typeof raw !== 'object') return null;

        const title = String(raw.title || raw.titulo || raw.name || raw.nome || '').trim();
        const desc = strip5eToolsTags(raw.description || raw.descricao || raw.effect || raw.efeito || raw.text || '').trim();
        if (!title && !desc) return null;

        const minVal = Number(raw.min) || 0;
        const maxVal = Number(raw.max) || minVal || 0;
        const code = String(raw.code || raw.roll || raw.faixa || (minVal ? `${minVal}${maxVal > minVal ? '–' + maxVal : ''}` : 'IMP')).trim();

        return {
            id: String(raw.id || makeSlugId('wm-cu', Date.now() + idx, title || desc)),
            table: 'custom',
            min: minVal,
            max: maxVal,
            code,
            title: title || (desc.length > 50 ? desc.slice(0, 47) + '...' : desc),
            category: String(raw.category || raw.categoria || 'Importado').trim(),
            severity: normalizeSeverity(raw.severity || raw.severidade),
            duration: String(raw.duration || raw.duracao || 'Variável').trim(),
            rollFormula: String(raw.rollFormula || raw.formula || extractDiceFormula(desc) || '').trim(),
            description: desc || title,
            builtin: false
        };
    }

    // ------------------------------------------------------------------------
    // PERSISTÊNCIA LOCAL (HOST) & SINCRONIZAÇÃO COM SERVIDOR (EXCLUSIVO HOST/GM)
    // ------------------------------------------------------------------------
    function mergePersistedState(raw) {
        const def = createDefaultWildMagicState();
        if (!raw || typeof raw !== 'object') return def;
        if (['calc', 'generator', 'import', 'library', 'history'].includes(raw.activeTab)) {
            def.activeTab = raw.activeTab;
        }
        if (raw.config && typeof raw.config === 'object') {
            Object.assign(def.config, raw.config);
            def.config.dieType = Number(def.config.dieType) === 100 ? 100 : 20;
            def.config.baseThreshold = Math.max(0, Math.min(100, Number(def.config.baseThreshold) || 1));
            def.config.perLevelBonus = Number(def.config.perLevelBonus) || 0;
            def.config.streakCount = Math.max(0, Number(def.config.streakCount) || 0);
            def.config.zoneModifier = Number(def.config.zoneModifier) || 0;
            def.config.spellLevel = Math.max(0, Math.min(9, Number(def.config.spellLevel) || 0));
        }
        if (raw.generator && typeof raw.generator === 'object') {
            Object.assign(def.generator, raw.generator);
            def.generator.count = Math.max(1, Math.min(20, Number(def.generator.count) || 1));
            def.generator.minLevel = Math.max(0, Math.min(9, Number(def.generator.minLevel) || 0));
            def.generator.maxLevel = Math.max(def.generator.minLevel, Math.min(9, Number(def.generator.maxLevel) ?? 9));
        }
        if (Array.isArray(raw.customSpells)) {
            def.customSpells = raw.customSpells.map((s, i) => normalizeSpellRecord(s, i)).filter(Boolean);
        }
        if (Array.isArray(raw.customEffects)) {
            def.customEffects = raw.customEffects.map((e, i) => normalizeEffectRecord(e, i)).filter(Boolean);
        }
        if (Array.isArray(raw.favoriteSpellIds)) def.favoriteSpellIds = raw.favoriteSpellIds.slice(0, 300);
        if (Array.isArray(raw.history)) def.history = raw.history.slice(0, 120);
        if (raw.lastCalculationResult) def.lastCalculationResult = raw.lastCalculationResult;
        if (Array.isArray(raw.lastGeneratedSpells)) def.lastGeneratedSpells = raw.lastGeneratedSpells.slice(0, 20);
        return def;
    }

    function exportCleanStateForPersistence() {
        return {
            activeTab: wmState.activeTab,
            config: wmState.config,
            generator: wmState.generator,
            customSpells: wmState.customSpells,
            customEffects: wmState.customEffects,
            favoriteSpellIds: wmState.favoriteSpellIds,
            history: wmState.history.slice(0, 80),
            lastCalculationResult: wmState.lastCalculationResult,
            lastGeneratedSpells: wmState.lastGeneratedSpells
        };
    }

    function loadWildMagicPersistence() {
        if (!isGmAuthorized()) {
            wmState = createDefaultWildMagicState();
            return wmState;
        }
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(STORAGE_KEY_WILD_MAGIC);
                if (raw) {
                    wmState = mergePersistedState(JSON.parse(raw));
                }
            }
        } catch (e) {}
        return wmState;
    }

    function saveWildMagicPersistence(syncServer = true) {
        if (!isGmAuthorized()) return;
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY_WILD_MAGIC, JSON.stringify(exportCleanStateForPersistence()));
            }
        } catch (e) {}
        if (syncServer && typeof CompendioNetAdapter !== 'undefined' && typeof CompendioNetAdapter.postSessionPayload === 'function' && typeof serverWritable !== 'undefined' && serverWritable) {
            const wmSnap = exportCleanStateForPersistence();
            CompendioNetAdapter._lastWildMagicJson = JSON.stringify(wmSnap);
            CompendioNetAdapter.postSessionPayload({ wildMagic: wmSnap });
        }
    }

    function applyServerWildMagicState(rawServerWm) {
        if (!isGmAuthorized() || !rawServerWm || typeof rawServerWm !== 'object') return;
        wmState = mergePersistedState(rawServerWm);
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY_WILD_MAGIC, JSON.stringify(exportCleanStateForPersistence()));
            }
        } catch (e) {}
        if (typeof activeModule !== 'undefined' && activeModule === 'compendium' && typeof currentCategory !== 'undefined' && currentCategory === 'wildmagic') {
            renderWildMagicScreen();
        }
    }

    // ------------------------------------------------------------------------
    // CATÁLOGO COMBINADO (EMBUTIDO + IMPORTADO)
    // ------------------------------------------------------------------------
    function getAllEffects(tableFilter = 'all', severityFilter = 'all') {
        let pool = [...BUILTIN_EFFECTS, ...(wmState.customEffects || [])];
        if (tableFilter && tableFilter !== 'all') {
            pool = pool.filter(e => e.table === tableFilter);
        }
        if (severityFilter && severityFilter !== 'all') {
            pool = pool.filter(e => e.severity === severityFilter);
        }
        return pool;
    }

    function getAllSpells() {
        return [...BUILTIN_SPELLS, ...(wmState.customSpells || [])];
    }

    function resolveEffectByD100(d100Roll, tableFilter = 'classic', severityFilter = 'all') {
        const val = Math.max(1, Math.min(100, Math.round(Number(d100Roll) || 1)));
        if (tableFilter === 'classic' && severityFilter === 'all') {
            const hit = BUILTIN_EFFECTS.find(e => e.table === 'classic' && val >= e.min && val <= e.max);
            if (hit) return { d100: val, effect: hit };
        }
        const pool = getAllEffects(tableFilter, severityFilter);
        const fallback = pool.length > 0 ? pool : BUILTIN_EFFECTS;
        const idx = Math.floor(((val - 1) / 100) * fallback.length) % fallback.length;
        return { d100: val, effect: fallback[idx] };
    }

    // ------------------------------------------------------------------------
    // MOTOR MATEMÁTICO DA CALCULADORA DE MAGIA SELVAGEM
    // ------------------------------------------------------------------------
    function calculateSurgeOdds(overrideCfg = null) {
        const cfg = Object.assign({}, wmState.config, overrideCfg || {});
        const preset = cfg.rulePreset || 'escalating';
        const spellLevel = Math.max(0, Math.min(9, Number(cfg.spellLevel) || 0));
        const cantripCanTrigger = Boolean(cfg.cantripTriggers);
        const canTrigger = spellLevel >= 1 || cantripCanTrigger;

        let dieType = preset === 'percent' ? 100 : (Number(cfg.dieType) === 100 ? 100 : 20);
        const hasBase = cfg.baseThreshold !== undefined && cfg.baseThreshold !== null && cfg.baseThreshold !== '' && Number.isFinite(Number(cfg.baseThreshold));
        const hasPerLvl = cfg.perLevelBonus !== undefined && cfg.perLevelBonus !== null && cfg.perLevelBonus !== '' && Number.isFinite(Number(cfg.perLevelBonus));
        const hasStep = cfg.escalationStep !== undefined && cfg.escalationStep !== null && cfg.escalationStep !== '' && Number.isFinite(Number(cfg.escalationStep));
        let base = Math.max(0, hasBase ? Number(cfg.baseThreshold) : (preset === 'percent' ? 5 : (preset === 'spellLevel' ? 0 : 1)));
        let levelPart = 0;
        let escalationPart = 0;
        const zonePart = Number(cfg.zoneModifier) || 0;
        const streak = Math.max(0, Number(cfg.streakCount) || 0);

        if (preset === 'phb') {
            dieType = 20;
            base = Math.max(1, hasBase ? Number(cfg.baseThreshold) : 1);
        } else if (preset === 'escalating') {
            dieType = Number(cfg.dieType) === 100 ? 100 : 20;
            const step = cfg.escalationStep === 'level' ? Math.max(1, spellLevel) : Math.max(0, hasStep ? Number(cfg.escalationStep) : 1);
            escalationPart = streak * step;
        } else if (preset === 'spellLevel') {
            dieType = Number(cfg.dieType) === 100 ? 100 : 20;
            const perLvl = hasPerLvl ? Number(cfg.perLevelBonus) : (dieType === 100 ? 5 : 1);
            levelPart = Math.floor(spellLevel * perLvl);
            const step = cfg.escalationStep === 'level' ? Math.max(1, spellLevel) : (hasStep ? Number(cfg.escalationStep) : 0);
            escalationPart = streak * step;
        } else if (preset === 'percent') {
            dieType = 100;
            const perLvl = hasPerLvl ? Number(cfg.perLevelBonus) : 0;
            levelPart = Math.floor(spellLevel * perLvl);
            const step = cfg.escalationStep === 'level' ? Math.max(1, spellLevel) : (hasStep ? Number(cfg.escalationStep) : 0);
            escalationPart = streak * step;
        } else {
            // 'custom'
            const perLvl = hasPerLvl ? Number(cfg.perLevelBonus) : 0;
            levelPart = Math.floor(spellLevel * perLvl);
            const step = cfg.escalationStep === 'level' ? Math.max(1, spellLevel) : (hasStep ? Number(cfg.escalationStep) : 0);
            escalationPart = streak * step;
        }

        if (!canTrigger) {
            return {
                preset,
                dieType,
                spellLevel,
                canTrigger: false,
                tidesOfChaos: Boolean(cfg.tidesOfChaos),
                base,
                levelPart,
                escalationPart,
                zonePart,
                streak,
                threshold: 0,
                probabilityPct: 0,
                fractionText: `0 / ${dieType}`,
                formulaLabel: `Truque (0º círculo) não ativa surto sem "Permitir Truques"`,
                dangerTier: 'none',
                dangerLabel: 'Sem Risco (Truque)'
            };
        }

        if (cfg.tidesOfChaos) {
            return {
                preset,
                dieType,
                spellLevel,
                canTrigger: true,
                tidesOfChaos: true,
                base,
                levelPart,
                escalationPart,
                zonePart,
                streak,
                threshold: dieType,
                probabilityPct: 100,
                fractionText: `${dieType} / ${dieType} (Garantido)`,
                formulaLabel: `Marés do Caos ativas → Surto Automático (100%)`,
                dangerTier: 'guaranteed',
                dangerLabel: 'Marés do Caos (100%)'
            };
        }

        const rawThreshold = base + levelPart + escalationPart + zonePart;
        const threshold = Math.max(0, Math.min(dieType, Math.round(rawThreshold)));
        const probabilityPct = Number(((threshold / dieType) * 100).toFixed(1));

        const parts = [`Base ${base}`];
        if (levelPart) parts.push(`Círculo (${levelPart >= 0 ? '+' : ''}${levelPart})`);
        if (escalationPart) parts.push(`Tensão (${escalationPart >= 0 ? '+' : ''}${escalationPart})`);
        if (zonePart) parts.push(`Zona/Bônus (${zonePart >= 0 ? '+' : ''}${zonePart})`);

        let dangerTier = 'low';
        let dangerLabel = 'Estável';
        if (probabilityPct >= 75) { dangerTier = 'critical'; dangerLabel = 'Ruptura Iminente'; }
        else if (probabilityPct >= 40) { dangerTier = 'high'; dangerLabel = 'Altamente Instável'; }
        else if (probabilityPct >= 15) { dangerTier = 'medium'; dangerLabel = 'Instável'; }

        return {
            preset,
            dieType,
            spellLevel,
            canTrigger: true,
            tidesOfChaos: false,
            base,
            levelPart,
            escalationPart,
            zonePart,
            streak,
            threshold,
            probabilityPct,
            fractionText: `${threshold} / ${dieType}`,
            formulaLabel: `1d${dieType} ≤ ${threshold} (${parts.join(' + ')})`,
            dangerTier,
            dangerLabel
        };
    }

    function drawSurgeEffectOptions(tableFilter, severityFilter, controlledChaos, manualD100 = null) {
        const count = controlledChaos && manualD100 === null ? 2 : 1;
        const drawn = [];
        for (let i = 0; i < count; i++) {
            const d100 = (i === 0 && manualD100 !== null)
                ? Math.max(1, Math.min(100, Math.round(Number(manualD100) || 1)))
                : rollSingleDie(100);
            const resolved = resolveEffectByD100(d100, tableFilter, severityFilter);
            if (count === 2 && i === 1 && drawn[0] && resolved.effect.id === drawn[0].effect.id) {
                const retry = resolveEffectByD100(((d100 + 37 - 1) % 100) + 1, tableFilter, severityFilter);
                drawn.push(retry);
            } else {
                drawn.push(resolved);
            }
        }
        return drawn;
    }

    function pushHistoryRecord(entry) {
        wmState.history.unshift(Object.assign({
            id: 'wmh-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        }, entry));
        if (wmState.history.length > 100) wmState.history = wmState.history.slice(0, 100);
    }

    function checkWildMagicSurge(overrides = null) {
        if (!isGmAuthorized()) return null;
        const cfg = Object.assign({}, wmState.config, overrides || {});
        const calc = calculateSurgeOdds(cfg);
        const casterLabel = (cfg.casterName || '').trim() || 'Conjurador';

        if (!calc.canTrigger) {
            const record = {
                type: 'check',
                triggered: false,
                blockedByCantrip: true,
                casterName: casterLabel,
                spellLevel: calc.spellLevel,
                dieType: calc.dieType,
                rollValue: null,
                threshold: 0,
                probabilityPct: 0,
                formulaLabel: calc.formulaLabel,
                options: [],
                chosenIndex: 0
            };
            wmState.lastCalculationResult = record;
            saveWildMagicPersistence();
            if (typeof showToast === 'function') showToast('✨ Truque (0º círculo): regra atual não testa Surto Selvagem.');
            if (typeof activeModule !== 'undefined' && currentCategory === 'wildmagic') renderWildMagicScreen();
            return record;
        }

        let rollValue = null;
        let triggered = false;
        let reasonText = '';

        if (calc.tidesOfChaos) {
            rollValue = 1;
            triggered = true;
            reasonText = 'Marés do Caos ativas consumidas (Surto Garantido 100%)';
            wmState.config.tidesOfChaos = false;
        } else {
            const rollRec = rollFormulaQuick(`1d${calc.dieType}`, `Teste de Surto Selvagem (${casterLabel})`, {
                isSecret: Boolean(cfg.secretRoll),
                skip3d: Boolean(cfg.secretRoll)
            });
            rollValue = Number(rollRec?.total) || rollSingleDie(calc.dieType);
            triggered = rollValue <= calc.threshold;
            reasonText = triggered
                ? `1d${calc.dieType} = ${rollValue} (≤ Limiar ${calc.threshold}) → SURTO DETONADO!`
                : `1d${calc.dieType} = ${rollValue} (> Limiar ${calc.threshold}) → Magia estável.`;
        }

        let drawnOptions = [];
        if (triggered) {
            drawnOptions = drawSurgeEffectOptions(cfg.tableFilter, cfg.severityFilter, Boolean(cfg.controlledChaos), null);
            wmState.config.streakCount = 0;
        } else if (cfg.rulePreset !== 'phb') {
            const step = cfg.escalationStep === 'level' ? Math.max(1, calc.spellLevel) : Math.max(0, Number(cfg.escalationStep) || 0);
            if (step > 0) wmState.config.streakCount = Math.max(0, (Number(wmState.config.streakCount) || 0) + 1);
        }

        const result = {
            type: 'check',
            triggered,
            casterName: casterLabel,
            spellLevel: calc.spellLevel,
            dieType: calc.dieType,
            rollValue,
            threshold: calc.threshold,
            probabilityPct: calc.probabilityPct,
            formulaLabel: calc.formulaLabel,
            reasonText,
            controlledChaos: Boolean(cfg.controlledChaos),
            options: drawnOptions,
            chosenIndex: 0
        };

        wmState.lastCalculationResult = result;
        pushHistoryRecord({
            kind: triggered ? 'surge' : 'check-safe',
            casterName: casterLabel,
            spellLevel: calc.spellLevel,
            summary: reasonText,
            effectTitle: drawnOptions[0]?.effect?.title || '',
            effectCode: drawnOptions[0]?.d100 || '',
            effectDescription: drawnOptions[0]?.effect?.description || ''
        });
        saveWildMagicPersistence();
        if (typeof showToast === 'function') {
            showToast(triggered
                ? `🌀 SURTO SELVAGEM! ${drawnOptions[0]?.effect?.title || ''}`
                : `🔮 Estável: 1d${calc.dieType}=${rollValue} (Limiar ≤ ${calc.threshold})`);
        }
        if (typeof activeModule !== 'undefined' && currentCategory === 'wildmagic') renderWildMagicScreen();
        return result;
    }

    function triggerDirectWildSurge(manualD100 = null) {
        if (!isGmAuthorized()) return null;
        const cfg = wmState.config;
        const casterLabel = (cfg.casterName || '').trim() || 'Conjurador';
        const drawnOptions = drawSurgeEffectOptions(
            cfg.tableFilter,
            cfg.severityFilter,
            Boolean(cfg.controlledChaos) && manualD100 === null,
            manualD100
        );

        const result = {
            type: manualD100 !== null ? 'manual-d100' : 'direct-surge',
            triggered: true,
            casterName: casterLabel,
            spellLevel: Number(cfg.spellLevel) || 0,
            dieType: 100,
            rollValue: drawnOptions[0]?.d100 || 1,
            threshold: 100,
            probabilityPct: 100,
            formulaLabel: manualD100 !== null ? `Resolução Manual d100 = ${drawnOptions[0]?.d100}` : `Surto Direto (${tableLabel(cfg.tableFilter)})`,
            reasonText: manualD100 !== null
                ? `d100 Manual (${drawnOptions[0]?.d100}) resolvido!`
                : `Surto Selvagem rolado diretamente (${drawnOptions.map(o => '#' + o.d100).join(' vs ')})`,
            controlledChaos: Boolean(cfg.controlledChaos) && manualD100 === null,
            options: drawnOptions,
            chosenIndex: 0
        };

        wmState.lastCalculationResult = result;
        pushHistoryRecord({
            kind: 'surge',
            casterName: casterLabel,
            spellLevel: result.spellLevel,
            summary: result.reasonText,
            effectTitle: drawnOptions[0]?.effect?.title || '',
            effectCode: drawnOptions[0]?.d100 || '',
            effectDescription: drawnOptions[0]?.effect?.description || ''
        });
        saveWildMagicPersistence();
        if (typeof showToast === 'function') {
            showToast(`🌀 Surto (${drawnOptions[0]?.d100}): ${drawnOptions[0]?.effect?.title || ''}`);
        }
        if (typeof activeModule !== 'undefined' && currentCategory === 'wildmagic') renderWildMagicScreen();
        return result;
    }

    function pickControlledChaosOption(idx) {
        if (!isGmAuthorized() || !wmState.lastCalculationResult || !Array.isArray(wmState.lastCalculationResult.options)) return;
        const chosen = Math.max(0, Math.min(wmState.lastCalculationResult.options.length - 1, Number(idx) || 0));
        wmState.lastCalculationResult.chosenIndex = chosen;
        const opt = wmState.lastCalculationResult.options[chosen];
        if (opt?.effect && wmState.history[0]) {
            wmState.history[0].effectTitle = `${opt.effect.title} (Caos Controlado)`;
            wmState.history[0].effectCode = opt.d100;
            wmState.history[0].effectDescription = opt.effect.description;
        }
        saveWildMagicPersistence();
        if (typeof activeModule !== 'undefined' && currentCategory === 'wildmagic') renderWildMagicScreen();
    }

    // ------------------------------------------------------------------------
    // GERADOR DE MAGIA ALEATÓRIA + MUTAÇÃO CAÓTICA + SÍNTESE PROCEDURAL
    // ------------------------------------------------------------------------
    function getFilteredSpells(overrides = null) {
        const g = Object.assign({}, wmState.generator, overrides || {});
        const minL = Math.max(0, Math.min(9, Number(g.minLevel) || 0));
        const maxL = Math.max(minL, Math.min(9, Number(g.maxLevel) ?? 9));

        return getAllSpells().filter(sp => {
            if (sp.level < minL || sp.level > maxL) return false;
            if (g.school && g.school !== 'all' && normalizeText(sp.school) !== normalizeText(g.school)) return false;
            if (g.className && g.className !== 'all') {
                const want = normalizeText(g.className);
                if (!(sp.classes || []).some(c => normalizeText(c) === want)) return false;
            }
            if (g.sourceFilter === 'builtin' && !sp.builtin) return false;
            if (g.sourceFilter === 'custom' && sp.builtin) return false;
            if (g.concentrationFilter === 'yes' && !sp.concentration) return false;
            if (g.concentrationFilter === 'no' && sp.concentration) return false;
            if (g.ritualOnly && !sp.ritual) return false;
            if (g.attackOrDamageOnly && !sp.rollFormula && !sp.damageOrRoll) return false;
            return true;
        });
    }

    function attachGeneratorExtras(spell, opts = {}) {
        const copy = Object.assign({}, spell);
        if (opts.applyChaosMutation) {
            copy.chaosMutation = CHAOS_MUTATIONS[Math.floor(Math.random() * CHAOS_MUTATIONS.length)];
        }
        if (opts.includeScrollStats) {
            copy.scrollStats = SCROLL_STATS_BY_LEVEL[copy.level] || SCROLL_STATS_BY_LEVEL[1];
        }
        return copy;
    }

    function generateRandomSpells(overrides = null) {
        if (!isGmAuthorized()) return [];
        const g = Object.assign({}, wmState.generator, overrides || {});
        const pool = getFilteredSpells(g);
        const count = Math.max(1, Math.min(20, Number(g.count) || 1));

        if (pool.length === 0) {
            if (typeof showToast === 'function') showToast('⚠️ Nenhuma magia corresponde aos filtros atuais. Amplie o filtro ou importe magias!');
            return [];
        }

        const available = pool.slice();
        const picked = [];
        for (let i = 0; i < count; i++) {
            if (available.length > 0) {
                const idx = Math.floor(Math.random() * available.length);
                picked.push(attachGeneratorExtras(available.splice(idx, 1)[0], g));
            } else {
                const idx = Math.floor(Math.random() * pool.length);
                picked.push(attachGeneratorExtras(pool[idx], g));
            }
        }

        wmState.lastGeneratedSpells = picked;
        pushHistoryRecord({
            kind: 'random-spell',
            casterName: (wmState.config.casterName || '').trim() || 'Gerador Aleatório',
            spellLevel: picked[0]?.level ?? 0,
            summary: `Sorteadas ${picked.length} magia(s): ${picked.map(s => s.name).join(', ')}`,
            effectTitle: picked[0]?.name || '',
            effectCode: picked.length > 1 ? `${picked.length}x` : levelLabel(picked[0]?.level || 0),
            effectDescription: picked[0]?.description || ''
        });
        saveWildMagicPersistence();
        if (typeof showToast === 'function') showToast(`✨ Magia sorteada: ${picked[0].name}${picked.length > 1 ? ` (+${picked.length - 1})` : ''}`);
        if (typeof activeModule !== 'undefined' && currentCategory === 'wildmagic') renderWildMagicScreen();
        return picked;
    }

    function generateComboSpellAndSurge() {
        if (!isGmAuthorized()) return null;
        const spells = generateRandomSpells({ count: 1, applyChaosMutation: true });
        const surge = triggerDirectWildSurge(null);
        return { spell: spells[0] || null, surge };
    }

    function synthesizeProceduralChaosSpell(overrides = null) {
        if (!isGmAuthorized()) return null;
        const g = Object.assign({}, wmState.generator, overrides || {});
        const minL = Math.max(0, Math.min(9, Number(g.minLevel) || 0));
        const maxL = Math.max(minL, Math.min(9, Number(g.maxLevel) ?? 9));
        const lvl = minL + Math.floor(Math.random() * (maxL - minL + 1));
        const school = (g.school && g.school !== 'all') ? g.school : SCHOOLS[Math.floor(Math.random() * 8)];

        const prefixes = ['Orbe', 'Sussurro', 'Explosão', 'Vórtice', 'Chicote', 'Coroa', 'Relâmpago', 'Véu', 'Lança', 'Tempestade', 'Cântico', 'Fratura', 'Espiral', 'Pulso'];
        const nouns = ['do Vazio', 'da Estrela Faminta', 'Prismático', 'de Hadar', 'Caótico', 'das Sombras', 'Temporal', 'Abissal', 'de Cristal', 'Serrilhado', 'Escarlate', 'Lunar', 'Entrópico', 'das Marés'];
        const elements = ['Fogo', 'Frio', 'Força', 'Elétrico', 'Trovejante', 'Necrótico', 'Radiante', 'Psíquico', 'Ácido'];
        const shapes = ['uma criatura à vista', 'um cone de 9 m', 'uma esfera de 6 m', 'uma linha de 18 m', 'até 3 alvos a até 9 m', 'um cubo de 4,5 m'];
        const saves = ['Destreza', 'Constituição', 'Sabedoria', 'Inteligência', 'Carisma', 'Força'];

        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const elem = pick(elements);
        const shape = pick(shapes);
        const saveAttr = pick(saves);
        const dcEstimate = 13 + Math.floor(lvl / 2);
        const diceCount = lvl === 0 ? 1 : (lvl * 2 + 1);
        const dieFaces = [6, 8, 10][Math.floor(Math.random() * 3)];
        const formula = `${diceCount}d${dieFaces}`;
        const mut = pick(CHAOS_MUTATIONS);

        const synth = {
            id: `sp-synth-${Date.now()}-${Math.floor(Math.random() * 999)}`,
            name: `${pick(prefixes)} ${pick(nouns)}`,
            level: lvl,
            school,
            castingTime: lvl <= 2 && Math.random() < 0.25 ? '1 ação bônus' : '1 ação',
            range: pick(['9 m', '18 m', '27 m', '36 m']),
            components: 'V, S',
            duration: Math.random() < 0.35 && lvl >= 1 ? 'Concentração, 1 minuto' : 'Instantânea',
            concentration: false,
            ritual: false,
            classes: [pick(CLASSES_LIST), pick(CLASSES_LIST)].filter((v, i, a) => a.indexOf(v) === i),
            damageOrRoll: `${formula} ${elem} (${saveAttr.slice(0, 3).toUpperCase()})`,
            rollFormula: formula,
            description: `Energia selvagem se condensa em ${shape} (${saveAttr} CD ${dcEstimate} reduz à metade): causa ${formula} de dano de ${elem}. Efeito Caótico acoplado — ${mut.name}: ${mut.note}`,
            builtin: false,
            isSynthetic: true,
            chaosMutation: g.applyChaosMutation ? mut : null,
            scrollStats: g.includeScrollStats ? SCROLL_STATS_BY_LEVEL[lvl] : null
        };
        synth.concentration = synth.duration.startsWith('Concentração');

        wmState.lastGeneratedSpells = [synth, ...(wmState.lastGeneratedSpells || [])].slice(0, 10);
        pushHistoryRecord({
            kind: 'synthetic-spell',
            casterName: (wmState.config.casterName || '').trim() || 'Síntese Caótica',
            spellLevel: synth.level,
            summary: `Magia Caótica Sintetizada: ${synth.name} (${levelLabel(synth.level)})`,
            effectTitle: synth.name,
            effectCode: formula,
            effectDescription: synth.description
        });
        saveWildMagicPersistence();
        if (typeof showToast === 'function') showToast(`🧪 Magia Caótica sintetizada: ${synth.name}`);
        if (typeof activeModule !== 'undefined' && currentCategory === 'wildmagic') renderWildMagicScreen();
        return synth;
    }

    function saveSyntheticSpellToCustomLibrary(spellId) {
        if (!isGmAuthorized()) return false;
        const found = (wmState.lastGeneratedSpells || []).find(s => s.id === spellId);
        if (!found) return false;
        if (wmState.customSpells.some(s => normalizeText(s.name) === normalizeText(found.name) && s.level === found.level)) {
            if (typeof showToast === 'function') showToast('ℹ️ Essa magia já está salva na biblioteca.');
            return false;
        }
        const savedCopy = Object.assign({}, found, { isSynthetic: false, builtin: false, sourceTag: 'Sintética Salva' });
        wmState.customSpells.push(savedCopy);
        saveWildMagicPersistence();
        if (typeof showToast === 'function') showToast(`💾 "${savedCopy.name}" salva nas magias importadas!`);
        if (typeof activeModule !== 'undefined' && currentCategory === 'wildmagic') renderWildMagicScreen();
        return true;
    }

    // ------------------------------------------------------------------------
    // PARSER MULTI-FORMATO DE IMPORTAÇÃO DE MAGIAS E EFEITOS SELVAGENS
    // Suporta: JSON Nativo / 5e.tools / Array / CSV / TSV / TXT Pipe / Lista d100
    // ------------------------------------------------------------------------
    function splitDelimitedRow(line, sep) {
        const out = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = !inQuotes;
            } else if (ch === sep && !inQuotes) {
                out.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        out.push(cur.trim());
        return out;
    }

    function looksLikeEffectObject(obj) {
        if (!obj || typeof obj !== 'object') return false;
        if (obj.rollRange || obj.severity || obj.severidade || obj.min !== undefined || obj.max !== undefined) return true;
        if (obj.effect || obj.efeito) return true;
        if ((obj.title || obj.titulo) && !obj.school && !obj.escola && obj.level === undefined && obj.nivel === undefined) return true;
        return false;
    }

    function parseImportedContent(rawText, targetMode = 'auto') {
        const text = String(rawText || '').replace(/^\uFEFF/, '').trim();
        const result = { spells: [], effects: [], warnings: [] };
        if (!text) return result;

        // 1. Tentativa JSON (Nativo, Backup, 5e.tools, Array ou Objeto Único)
        if (text.startsWith('{') || text.startsWith('[')) {
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed)) {
                    parsed.forEach((item, idx) => {
                        if (targetMode === 'effects' || (targetMode === 'auto' && looksLikeEffectObject(item))) {
                            const eff = normalizeEffectRecord(item, idx);
                            if (eff) result.effects.push(eff);
                        } else {
                            const sp = normalizeSpellRecord(item, idx);
                            if (sp) result.spells.push(sp);
                        }
                    });
                } else if (parsed && typeof parsed === 'object') {
                    const spellLists = [parsed.spells, parsed.magias, parsed.spell, parsed.data].filter(Array.isArray);
                    const effectLists = [parsed.wildEffects, parsed.effects, parsed.efeitos, parsed.surges, parsed.tabela].filter(Array.isArray);

                    if (spellLists.length > 0 || effectLists.length > 0) {
                        spellLists.forEach(arr => arr.forEach((it, i) => {
                            const sp = normalizeSpellRecord(it, i);
                            if (sp) result.spells.push(sp);
                        }));
                        effectLists.forEach(arr => arr.forEach((it, i) => {
                            const ef = normalizeEffectRecord(it, i);
                            if (ef) result.effects.push(ef);
                        }));
                    } else if (targetMode === 'effects' || (targetMode === 'auto' && looksLikeEffectObject(parsed))) {
                        const ef = normalizeEffectRecord(parsed, 0);
                        if (ef) result.effects.push(ef);
                    } else {
                        const sp = normalizeSpellRecord(parsed, 0);
                        if (sp) result.spells.push(sp);
                    }
                }
                return result;
            } catch (jsonErr) {
                result.warnings.push('Texto parecido com JSON inválido; tentando leitura por linhas/CSV.');
            }
        }

        // 2. CSV / TSV / Pipe-delimited / Lista de Texto Livre
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//'));
        if (lines.length === 0) return result;

        const firstLine = lines[0];
        let sep = null;
        if (firstLine.includes('|')) sep = '|';
        else if (firstLine.includes('\t')) sep = '\t';
        else if (firstLine.includes(';')) sep = ';';
        else if ((firstLine.match(/,/g) || []).length >= 2) sep = ',';

        // Checa se a primeira linha é cabeçalho CSV
        let hasHeader = false;
        let headers = [];
        if (sep && sep !== '|') {
            const cols = splitDelimitedRow(firstLine, sep).map(c => normalizeText(c));
            const knownHeaders = ['nome', 'name', 'titulo', 'title', 'nivel', 'level', 'circulo', 'escola', 'school', 'descricao', 'description', 'efeito', 'effect', 'severidade', 'severity'];
            if (cols.some(c => knownHeaders.includes(c))) {
                hasHeader = true;
                headers = cols;
            }
        }

        const dataLines = hasHeader ? lines.slice(1) : lines;
        dataLines.forEach((line, idx) => {
            if (sep) {
                const cols = splitDelimitedRow(line, sep).filter((_, cIdx) => !(sep === '|' && cIdx === 0 && line.startsWith('|')));
                if (cols.length === 0) return;

                if (hasHeader) {
                    const mapObj = {};
                    headers.forEach((h, hIdx) => { mapObj[h] = cols[hIdx] || ''; });
                    const isEffRow = targetMode === 'effects' || (targetMode === 'auto' && Boolean(mapObj.severidade || mapObj.severity || mapObj.faixa || mapObj.efeito || mapObj.effect));
                    if (isEffRow) {
                        const ef = normalizeEffectRecord({
                            code: mapObj.faixa || mapObj.roll || mapObj.codigo || 'IMP',
                            title: mapObj.titulo || mapObj.title || mapObj.nome || mapObj.name || '',
                            category: mapObj.categoria || mapObj.category || 'Importado',
                            severity: mapObj.severidade || mapObj.severity || 'neutro',
                            duration: mapObj.duracao || mapObj.duration || 'Variável',
                            rollFormula: mapObj.formula || mapObj.dado || mapObj.dano || '',
                            description: mapObj.descricao || mapObj.description || mapObj.efeito || mapObj.effect || ''
                        }, idx);
                        if (ef) result.effects.push(ef);
                    } else {
                        const sp = normalizeSpellRecord({
                            name: mapObj.nome || mapObj.name || mapObj.titulo || mapObj.title || cols[0],
                            level: mapObj.nivel ?? mapObj.level ?? mapObj.circulo ?? 1,
                            school: mapObj.escola || mapObj.school || 'Evocação',
                            castingTime: mapObj.tempo || mapObj.time || mapObj.castingtime || '1 ação',
                            range: mapObj.alcance || mapObj.range || '18 m',
                            components: mapObj.componentes || mapObj.components || 'V, S',
                            duration: mapObj.duracao || mapObj.duration || 'Instantânea',
                            classes: mapObj.classes || mapObj.classe || '',
                            damageOrRoll: mapObj.dano || mapObj.damage || mapObj.formula || '',
                            description: mapObj.descricao || mapObj.description || ''
                        }, idx);
                        if (sp) result.spells.push(sp);
                    }
                    return;
                }

                // Sem header: Pipe ou CSV posicional
                // Para Efeitos: "01-02 | Título | Categoria | Severidade | Descrição" ou "Título | Descrição"
                // Para Magias: "Nome | Nível | Escola | Dano/Dado | Alcance | Duração | Descrição" ou "Nome | Nível | Escola | Descrição"
                if (targetMode === 'effects' || (targetMode === 'auto' && /^\d{1,3}(?:\s*[-–]\s*\d{1,3})?$/.test(cols[0]))) {
                    if (/^\d{1,3}(?:\s*[-–]\s*\d{1,3})?$/.test(cols[0]) && cols.length >= 2) {
                        const ef = normalizeEffectRecord({
                            code: cols[0],
                            title: cols[1],
                            category: cols.length >= 4 ? cols[2] : 'Importado',
                            severity: cols.length >= 5 ? cols[3] : 'neutro',
                            description: cols.slice(cols.length >= 5 ? 4 : (cols.length >= 3 ? 2 : 1)).join(' — ')
                        }, idx);
                        if (ef) result.effects.push(ef);
                    } else {
                        const ef = normalizeEffectRecord({
                            title: cols[0],
                            category: cols.length >= 3 ? cols[1] : 'Importado',
                            severity: cols.length >= 4 ? cols[2] : 'neutro',
                            description: cols[cols.length - 1]
                        }, idx);
                        if (ef) result.effects.push(ef);
                    }
                } else {
                    const name = cols[0];
                    const maybeLvl = cols[1] !== undefined && /^(?:truque|cantrip|\d{1,2})/i.test(cols[1]) ? cols[1] : 1;
                    const schoolCol = cols.length >= 3 ? cols[2] : 'Caótica / Homebrew';
                    let dmgCol = '';
                    let rangeCol = '18 m';
                    let durCol = 'Instantânea';
                    let descCol = '';
                    if (cols.length === 2) descCol = cols[1];
                    else if (cols.length === 3) descCol = cols[2];
                    else if (cols.length === 4) descCol = cols[3];
                    else if (cols.length === 5) { dmgCol = cols[3]; descCol = cols[4]; }
                    else {
                        dmgCol = cols[3];
                        rangeCol = cols[4] || '18 m';
                        durCol = cols[5] || 'Instantânea';
                        descCol = cols.slice(6).join(' ');
                    }
                    const sp = normalizeSpellRecord({
                        name,
                        level: maybeLvl,
                        school: schoolCol,
                        damageOrRoll: dmgCol,
                        range: rangeCol,
                        duration: durCol,
                        description: descCol || name
                    }, idx);
                    if (sp) result.spells.push(sp);
                }
                return;
            }

            // Linha simples (ex: "- 01-02: Título - Descrição" ou "Bola de Ácido (3º círculo): 8d6 ácido...")
            const d100Match = line.replace(/^[-*•]\s*/, '').match(/^(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\s*[:.)\-–]\s*(.+)$/);
            if ((targetMode === 'effects' || (targetMode === 'auto' && d100Match)) && d100Match) {
                const body = d100Match[2].trim();
                const parts = body.split(/\s+[—–-]\s+|\s*:\s*/);
                const ef = normalizeEffectRecord({
                    code: d100Match[1].replace(/\s+/g, ''),
                    title: parts[0],
                    description: parts.length > 1 ? parts.slice(1).join(' — ') : body
                }, idx);
                if (ef) result.effects.push(ef);
                return;
            }

            if (targetMode === 'effects') {
                const ef = normalizeEffectRecord(line.replace(/^[-*•]\s*/, ''), idx);
                if (ef) result.effects.push(ef);
            } else {
                const cleanLine = line.replace(/^[-*•]\s*/, '');
                const lvlParen = cleanLine.match(/^(.+?)\s*\((?:(\d)[º°]?\s*(?:c[ií]rculo|n[ií]vel)?|(truque|cantrip))\)\s*(?::|-|—)?\s*(.*)$/i);
                if (lvlParen) {
                    const sp = normalizeSpellRecord({
                        name: lvlParen[1].trim(),
                        level: lvlParen[3] ? 0 : Number(lvlParen[2] || 1),
                        description: lvlParen[4].trim() || lvlParen[1].trim()
                    }, idx);
                    if (sp) result.spells.push(sp);
                } else {
                    const colonSplit = cleanLine.split(/\s*[:—–]\s+/);
                    const sp = normalizeSpellRecord({
                        name: colonSplit[0],
                        level: 1,
                        description: colonSplit.length > 1 ? colonSplit.slice(1).join(' — ') : cleanLine
                    }, idx);
                    if (sp) result.spells.push(sp);
                }
            }
        });

        return result;
    }

    function commitImportedItems(parsed) {
        if (!isGmAuthorized()) return { addedSpells: 0, updatedSpells: 0, addedEffects: 0, updatedEffects: 0 };
        const p = parsed || { spells: [], effects: [] };
        let addedSpells = 0;
        let updatedSpells = 0;
        let addedEffects = 0;
        let updatedEffects = 0;

        (p.spells || []).forEach(sp => {
            const idx = wmState.customSpells.findIndex(x => normalizeText(x.name) === normalizeText(sp.name) && Number(x.level) === Number(sp.level));
            if (idx >= 0) {
                wmState.customSpells[idx] = Object.assign({}, sp, { id: wmState.customSpells[idx].id });
                updatedSpells++;
            } else {
                wmState.customSpells.push(sp);
                addedSpells++;
            }
        });

        (p.effects || []).forEach(ef => {
            const idx = wmState.customEffects.findIndex(x => normalizeText(x.title) === normalizeText(ef.title));
            if (idx >= 0) {
                wmState.customEffects[idx] = Object.assign({}, ef, { id: wmState.customEffects[idx].id });
                updatedEffects++;
            } else {
                wmState.customEffects.push(ef);
                addedEffects++;
            }
        });

        wmState.pendingImportPreview = null;
        saveWildMagicPersistence();
        return { addedSpells, updatedSpells, addedEffects, updatedEffects };
    }

    function importContentString(rawText, targetMode = 'auto') {
        if (!isGmAuthorized()) return null;
        const parsed = parseImportedContent(rawText, targetMode);
        const counts = commitImportedItems(parsed);
        const total = counts.addedSpells + counts.updatedSpells + counts.addedEffects + counts.updatedEffects;
        if (typeof showToast === 'function') {
            showToast(total > 0
                ? `📥 Importado: +${counts.addedSpells} magia(s), +${counts.addedEffects} efeito(s)${counts.updatedSpells + counts.updatedEffects > 0 ? ` (${counts.updatedSpells + counts.updatedEffects} atualizados)` : ''}!`
                : '⚠️ Nenhuma magia ou efeito válido encontrado para importar.');
        }
        if (typeof activeModule !== 'undefined' && currentCategory === 'wildmagic') renderWildMagicScreen();
        return counts;
    }

    function exportCustomLibraryJson() {
        if (!isGmAuthorized()) return;
        const payload = {
            exportedAt: new Date().toISOString(),
            type: 'compendio-wild-magic-library',
            spells: wmState.customSpells,
            wildEffects: wmState.customEffects
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `magia-selvagem-biblioteca-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        if (typeof showToast === 'function') showToast('⬇ Biblioteca personalizada exportada (.json)!');
    }

    // ------------------------------------------------------------------------
    // RENDERIZAÇÃO DA INTERFACE (COLUNA 2 + COLUNA 3, EXCLUSIVA AO HOST/GM)
    // ------------------------------------------------------------------------
    function renderSidebarQuickList() {
        const listEl = document.getElementById('dynamic-item-list');
        if (!listEl) return;
        const calc = calculateSurgeOdds();
        const totalEffects = BUILTIN_EFFECTS.length + wmState.customEffects.length;
        const totalSpells = BUILTIN_SPELLS.length + wmState.customSpells.length;

        const navTabs = [
            { id: 'calc', icon: '⚡', label: 'Calculadora de Surto', badge: `${calc.probabilityPct}%` },
            { id: 'generator', icon: '✨', label: 'Gerador Aleatório', badge: `${totalSpells}` },
            { id: 'import', icon: '📥', label: 'Importar & Criar', badge: `+${wmState.customSpells.length + wmState.customEffects.length}` },
            { id: 'library', icon: '📚', label: 'Biblioteca Completa', badge: `${totalEffects + totalSpells}` },
            { id: 'history', icon: '📜', label: 'Histórico da Sessão', badge: `${wmState.history.length}` }
        ];

        const pinnedSpells = (wmState.favoriteSpellIds || [])
            .map(id => getAllSpells().find(s => s.id === id))
            .filter(Boolean)
            .slice(0, 8);

        const navHtml = navTabs.map(t => {
            const act = wmState.activeTab === t.id ? 'active' : '';
            return `
                <li class="list-item ${act}" data-title="${escapeHtml(t.label.toLowerCase())}" onclick="CompendioWildMagic.setTab('${t.id}')">
                    <span>${t.icon} ${escapeHtml(t.label)}</span>
                    <span class="list-item-folder-badge">${escapeHtml(t.badge)}</span>
                </li>
            `;
        }).join('');

        const favHtml = pinnedSpells.length > 0
            ? `<li class="list-item" data-title="favoritas" style="cursor:default; color:var(--accent-gold); font-size:11px; margin-top:8px; border-bottom:1px solid #454857;"><span>⭐ Magias Favoritas</span></li>` +
              pinnedSpells.map(sp => `
                  <li class="list-item" data-title="${escapeHtml(sp.name.toLowerCase())}" onclick="CompendioWildMagic.castLibrarySpell('${escapeHtml(sp.id)}')">
                      <span style="font-size:12px;">✨ ${escapeHtml(sp.name)}</span>
                      <span class="list-item-folder-badge">${sp.level === 0 ? 'T' : sp.level + 'º'}</span>
                  </li>
              `).join('')
            : '';

        const recentEffects = BUILTIN_EFFECTS.filter(e => e.table === 'classic').slice(0, 6);
        const quickRefHtml = `
            <li class="list-item" data-title="atalhos d100" style="cursor:default; color:#9da3b8; font-size:11px; margin-top:8px; border-bottom:1px solid #353742;"><span>🎲 Referência Rápida (PHB)</span></li>
            ${recentEffects.map(e => `
                <li class="list-item" data-title="${escapeHtml(e.title.toLowerCase())}" onclick="CompendioWildMagic.triggerManualD100(${e.min})">
                    <span style="font-size:11.5px;">${escapeHtml(e.code)} ${escapeHtml(e.title)}</span>
                </li>
            `).join('')}
        `;

        listEl.innerHTML = navHtml + favHtml + quickRefHtml;
    }

    function renderResultCardHtml(res) {
        if (!res) {
            return `
                <div class="wm-result-empty">
                    <div style="font-size:14px; font-weight:bold; color:var(--accent-gold-hover);">Pronto para calcular e conjurar o Caos</div>
                    <div style="font-size:12px; color:#a8adc0;">Clique em <strong>🎲 Verificar Surto</strong> para rolar o teste contra o limiar calculado, ou use <strong>⚡ Forçar Surto</strong> / <strong>d100 Manual</strong>.</div>
                </div>
            `;
        }
        const stateCls = res.triggered ? 'is-triggered' : 'is-safe';
        const statusTitle = res.blockedByCantrip
            ? '✨ Truque sem disparo na regra atual'
            : (res.triggered ? '🌀 SURTO DE MAGIA SELVAGEM DETONADO!' : '🛡️ Magia Estável (Sem Surto)');

        const optionsHtml = (res.options || []).map((opt, idx) => {
            const ef = opt.effect;
            const sev = severityBadge(ef.severity);
            const isSelected = (res.chosenIndex || 0) === idx;
            const formula = ef.rollFormula || extractDiceFormula(ef.description);
            const showPickBtn = res.controlledChaos && res.options.length > 1;
            return `
                <div class="wm-effect-card ${isSelected ? 'is-selected-choice' : ''}">
                    <div class="wm-effect-head">
                        <div>
                            <span class="wm-d100-chip">d100: ${escapeHtml(String(opt.d100).padStart(2, '0'))}</span>
                            <strong class="wm-effect-title">${escapeHtml(ef.title)}</strong>
                        </div>
                        <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
                            <span class="wm-sev-pill ${sev.cls}">${escapeHtml(sev.label)}</span>
                            <span class="list-item-folder-badge">${escapeHtml(ef.category)}</span>
                            <span class="list-item-folder-badge">⏱ ${escapeHtml(ef.duration || 'Variável')}</span>
                        </div>
                    </div>
                    <p class="wm-effect-desc">${escapeHtml(ef.description)}</p>
                    <div class="wm-effect-actions">
                        ${formula ? `<button type="button" class="btn-summon-card" onclick="CompendioWildMagic.rollInlineFormula('${escapeHtml(formula)}', '${escapeHtml(ef.title)}')">🎲 Rolar ${escapeHtml(formula)}</button>` : ''}
                        ${showPickBtn ? `<button type="button" class="${isSelected ? 'btn-save-primary' : 'btn-action-bar'}" onclick="CompendioWildMagic.pickControlledChaosOption(${idx})">${isSelected ? '✓ Opção Escolhida' : `Escolher Opção ${idx + 1}`}</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="wm-result-box ${stateCls}">
                <div class="wm-result-header">
                    <div>
                        <div class="wm-result-status">${statusTitle}</div>
                        <div class="wm-result-meta">${escapeHtml(res.casterName || 'Conjurador')} · ${escapeHtml(levelLabel(res.spellLevel))} · ${escapeHtml(res.reasonText || res.formulaLabel || '')}</div>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                        ${res.rollValue !== null ? `<span class="wm-roll-badge">Dado: <strong>${res.rollValue}</strong> / d${res.dieType}</span>` : ''}
                        <button type="button" class="btn-action-bar" onclick="CompendioWildMagic.triggerDirectWildSurge()">↻ Rolar Outro Efeito</button>
                    </div>
                </div>
                ${optionsHtml ? `<div class="wm-effects-grid">${optionsHtml}</div>` : ''}
            </div>
        `;
    }

    function renderCalculatorTabHtml() {
        const cfg = wmState.config;
        const calc = calculateSurgeOdds();
        const chars = typeof charactersData !== 'undefined' && Array.isArray(charactersData) ? charactersData : [];
        const casterSuggestions = chars.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${escapeHtml(c.classInfo || c.class || 'Aventureiro')})</option>`).join('');

        const totalPool = getAllEffects(cfg.tableFilter, cfg.severityFilter).length;
        const barColor = calc.dangerTier === 'guaranteed' ? '#c84bff'
            : (calc.dangerTier === 'critical' ? '#ef5350'
            : (calc.dangerTier === 'high' ? '#ffa726'
            : (calc.dangerTier === 'medium' ? '#d8b467' : '#52c46a')));

        return `
            <div class="wm-two-col">
                <div class="form-section" style="margin:0;">
                    <h3 class="form-section-title">⚙️ Parâmetros do Cálculo de Surto</h3>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Regra do Cálculo</label>
                            <select class="form-control" onchange="CompendioWildMagic.setPreset(this.value)">
                                <option value="phb" ${cfg.rulePreset === 'phb' ? 'selected' : ''}>PHB Padrão (1d20 ≤ Base)</option>
                                <option value="escalating" ${cfg.rulePreset === 'escalating' ? 'selected' : ''}>Tensão Progressiva (+1 por magia)</option>
                                <option value="spellLevel" ${cfg.rulePreset === 'spellLevel' ? 'selected' : ''}>Escalado por Círculo (+Nível)</option>
                                <option value="percent" ${cfg.rulePreset === 'percent' ? 'selected' : ''}>Percentual Direto (1d100 ≤ %)</option>
                                <option value="custom" ${cfg.rulePreset === 'custom' ? 'selected' : ''}>Fórmula Livre do Mestre</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Conjurador (Alvo do Cálculo)</label>
                            <input type="text" class="form-control" list="wm-caster-datalist" value="${escapeHtml(cfg.casterName)}" placeholder="Ex: Feiticeiro / Kael / Artefato..." onchange="CompendioWildMagic.updateConfig('casterName', this.value)">
                            <datalist id="wm-caster-datalist">${casterSuggestions}</datalist>
                        </div>
                        <div class="form-group">
                            <label>Círculo da Magia Conjurada</label>
                            <select class="form-control" onchange="CompendioWildMagic.updateConfig('spellLevel', Number(this.value))">
                                ${Array.from({ length: 10 }, (_, lvl) => `<option value="${lvl}" ${Number(cfg.spellLevel) === lvl ? 'selected' : ''}>${levelLabel(lvl)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Zona Mágica / Ambiente</label>
                            <select class="form-control" onchange="CompendioWildMagic.updateConfig('zoneModifier', Number(this.value))">
                                <option value="0" ${Number(cfg.zoneModifier) === 0 ? 'selected' : ''}>+0 · Trama Normal</option>
                                <option value="1" ${Number(cfg.zoneModifier) === 1 ? 'selected' : ''}>+1 · Região Arcana Instável</option>
                                <option value="2" ${Number(cfg.zoneModifier) === 2 ? 'selected' : ''}>+2 · Nexo / Câmara de Rituais</option>
                                <option value="4" ${Number(cfg.zoneModifier) === 4 ? 'selected' : ''}>+4 · Fenda do Caos / Hadar</option>
                                <option value="8" ${Number(cfg.zoneModifier) === 8 ? 'selected' : ''}>+8 · Tempestade Selvagem</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Limiar Base (1 a ${calc.dieType})</label>
                            <input type="number" class="form-control" min="0" max="100" value="${Number(cfg.baseThreshold) || 0}" onchange="CompendioWildMagic.updateConfig('baseThreshold', Number(this.value))">
                        </div>
                        <div class="form-group">
                            <label>Bônus por Círculo / Passo</label>
                            <div style="display:flex; gap:6px;">
                                <input type="number" class="form-control" style="flex:1;" min="0" max="25" step="1" title="Adicionado ao limiar por círculo da magia" value="${Number(cfg.perLevelBonus) || 0}" onchange="CompendioWildMagic.updateConfig('perLevelBonus', Number(this.value))">
                                <select class="form-control" style="flex:1;" title="Quanto acumula após cada conjuração sem surto" onchange="CompendioWildMagic.updateConfig('escalationStep', this.value === 'level' ? 'level' : Number(this.value))">
                                    <option value="0" ${String(cfg.escalationStep) === '0' ? 'selected' : ''}>Acum: +0</option>
                                    <option value="1" ${String(cfg.escalationStep) === '1' ? 'selected' : ''}>Acum: +1/magia</option>
                                    <option value="2" ${String(cfg.escalationStep) === '2' ? 'selected' : ''}>Acum: +2/magia</option>
                                    <option value="level" ${String(cfg.escalationStep) === 'level' ? 'selected' : ''}>Acum: +Círculo</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="wm-streak-bar">
                        <span>⚡ Magias sem Surto (Tensão Acumulada): <strong>${Number(cfg.streakCount) || 0}</strong></span>
                        <div style="display:flex; gap:4px;">
                            <button type="button" class="btn-mini" onclick="CompendioWildMagic.adjustStreak(-1)">-1</button>
                            <button type="button" class="btn-mini" onclick="CompendioWildMagic.adjustStreak(1)">+1</button>
                            <button type="button" class="btn-mini danger" onclick="CompendioWildMagic.updateConfig('streakCount', 0)">Zerar</button>
                        </div>
                    </div>

                    <div class="wm-toggles-row">
                        <label class="wm-check-pill ${cfg.tidesOfChaos ? 'is-on' : ''}">
                            <input type="checkbox" ${cfg.tidesOfChaos ? 'checked' : ''} onchange="CompendioWildMagic.updateConfig('tidesOfChaos', this.checked)"> 🌊 Marés do Caos (100%)
                        </label>
                        <label class="wm-check-pill ${cfg.controlledChaos ? 'is-on' : ''}">
                            <input type="checkbox" ${cfg.controlledChaos ? 'checked' : ''} onchange="CompendioWildMagic.updateConfig('controlledChaos', this.checked)"> 🎭 Caos Controlado (2 opções)
                        </label>
                        <label class="wm-check-pill ${cfg.cantripTriggers ? 'is-on' : ''}">
                            <input type="checkbox" ${cfg.cantripTriggers ? 'checked' : ''} onchange="CompendioWildMagic.updateConfig('cantripTriggers', this.checked)"> 🪄 Truques disparam surto
                        </label>
                        <label class="wm-check-pill ${cfg.secretRoll ? 'is-on' : ''}">
                            <input type="checkbox" ${cfg.secretRoll ? 'checked' : ''} onchange="CompendioWildMagic.updateConfig('secretRoll', this.checked)"> 🔒 Segredo do Mestre
                        </label>
                    </div>
                </div>

                <div class="form-section" style="margin:0; display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
                    <div>
                        <h3 class="form-section-title">📊 Visor Matemático &amp; Tabela Ativa</h3>
                        <div class="wm-odds-display">
                            <div class="wm-odds-pct" style="color:${barColor};">${calc.probabilityPct}%</div>
                            <div class="wm-odds-details">
                                <div style="font-weight:bold; color:#fff;">${escapeHtml(calc.dangerLabel)} · Limiar <strong>${escapeHtml(calc.fractionText)}</strong></div>
                                <div style="font-size:11.5px; color:#b8bccf;">${escapeHtml(calc.formulaLabel)}</div>
                            </div>
                        </div>
                        <div class="wm-progress-track">
                            <div class="wm-progress-fill" style="width:${Math.min(100, calc.probabilityPct)}%; background:${barColor};"></div>
                        </div>

                        <div class="form-grid" style="margin-top:10px;">
                            <div class="form-group">
                                <label>Tabela de Efeitos (${totalPool} no filtro)</label>
                                <select class="form-control" onchange="CompendioWildMagic.updateConfig('tableFilter', this.value)">
                                    <option value="all" ${cfg.tableFilter === 'all' ? 'selected' : ''}>Todas Combinadas (${BUILTIN_EFFECTS.length + wmState.customEffects.length})</option>
                                    <option value="classic" ${cfg.tableFilter === 'classic' ? 'selected' : ''}>Clássica PHB 01–100 (50)</option>
                                    <option value="chaos" ${cfg.tableFilter === 'chaos' ? 'selected' : ''}>Expandida Arcana &amp; Caótica (60)</option>
                                    <option value="cosmic" ${cfg.tableFilter === 'cosmic' ? 'selected' : ''}>Cósmica / Hadar &amp; Varhen (50)</option>
                                    <option value="custom" ${cfg.tableFilter === 'custom' ? 'selected' : ''}>Apenas Importados / Custom (${wmState.customEffects.length})</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Filtro de Severidade</label>
                                <select class="form-control" onchange="CompendioWildMagic.updateConfig('severityFilter', this.value)">
                                    <option value="all" ${cfg.severityFilter === 'all' ? 'selected' : ''}>Todas as Severidades</option>
                                    <option value="benefico" ${cfg.severityFilter === 'benefico' ? 'selected' : ''}>Somente Benéficos</option>
                                    <option value="neutro" ${cfg.severityFilter === 'neutro' ? 'selected' : ''}>Neutros / Bizarros</option>
                                    <option value="perigoso" ${cfg.severityFilter === 'perigoso' ? 'selected' : ''}>Perigosos / Combate</option>
                                    <option value="catastrofico" ${cfg.severityFilter === 'catastrofico' ? 'selected' : ''}>Catastróficos / Extremos</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="wm-action-cluster">
                        <button type="button" class="btn-save-primary wm-btn-big" onclick="CompendioWildMagic.checkWildMagicSurge()">
                            🎲 Verificar Surto (1d${calc.dieType} ≤ ${calc.threshold})
                        </button>
                        <button type="button" class="btn-summon-card" style="padding:9px 14px;" onclick="CompendioWildMagic.triggerDirectWildSurge()">
                            ⚡ Forçar Surto Agora (d100)
                        </button>
                        <div class="wm-manual-d100">
                            <input type="number" id="wm-manual-d100-input" class="form-control" min="1" max="100" value="42" style="width:68px; text-align:center;" title="Valor rolado em dado físico (1 a 100)">
                            <button type="button" class="btn-action-bar" onclick="CompendioWildMagic.triggerManualD100(document.getElementById('wm-manual-d100-input').value)">🎯 Usar d100</button>
                        </div>
                    </div>
                </div>
            </div>

            ${renderResultCardHtml(wmState.lastCalculationResult)}
        `;
    }

    function renderSpellCardHtml(sp) {
        const isFav = (wmState.favoriteSpellIds || []).includes(sp.id);
        const badges = [];
        if (sp.concentration) badges.push('<span class="list-item-folder-badge">Concentração</span>');
        if (sp.ritual) badges.push('<span class="list-item-folder-badge">Ritual</span>');
        if (!sp.builtin) badges.push(`<span class="list-item-folder-badge" style="border-color:#9b59b6; color:#e5c3ff;">${escapeHtml(sp.sourceTag || 'Importada')}</span>`);

        const mutHtml = sp.chaosMutation
            ? `<div class="wm-mutation-box">🌀 <strong>Mutação Caótica — ${escapeHtml(sp.chaosMutation.name)}:</strong> ${escapeHtml(sp.chaosMutation.note)}</div>`
            : '';

        const scrollHtml = sp.scrollStats
            ? `<div class="wm-scroll-box">📜 <strong>Pergaminho (${escapeHtml(sp.scrollStats.rarity)}):</strong> CD <strong>${sp.scrollStats.dc}</strong> · Ataque <strong>${sp.scrollStats.atk}</strong></div>`
            : '';

        return `
            <div class="wm-spell-card">
                <div class="wm-spell-head">
                    <div>
                        <strong class="wm-spell-title">${escapeHtml(sp.name)}</strong>
                        <div class="wm-spell-sub">${escapeHtml(levelLabel(sp.level))} · ${escapeHtml(sp.school)}${(sp.classes && sp.classes.length) ? ' · ' + escapeHtml(sp.classes.join(', ')) : ''}</div>
                    </div>
                    <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
                        ${badges.join('')}
                        <button type="button" class="btn-mini" onclick="CompendioWildMagic.toggleFavoriteSpell('${escapeHtml(sp.id)}')" title="Favoritar magia">${isFav ? '⭐' : '☆'}</button>
                    </div>
                </div>
                <div class="wm-spell-stats">
                    <span>⏱ <strong>Tempo:</strong> ${escapeHtml(sp.castingTime)}</span>
                    <span>🎯 <strong>Alcance:</strong> ${escapeHtml(sp.range)}</span>
                    <span>🧩 <strong>Comp.:</strong> ${escapeHtml(sp.components)}</span>
                    <span>⏳ <strong>Duração:</strong> ${escapeHtml(sp.duration)}</span>
                </div>
                <p class="wm-spell-desc">${escapeHtml(sp.description)}</p>
                ${mutHtml}
                ${scrollHtml}
                <div class="wm-effect-actions">
                    ${sp.rollFormula ? `<button type="button" class="btn-summon-card" onclick="CompendioWildMagic.rollInlineFormula('${escapeHtml(sp.rollFormula)}', '${escapeHtml(sp.name)}')">🎲 Rolar ${escapeHtml(sp.damageOrRoll || sp.rollFormula)}</button>` : ''}
                    ${sp.isSynthetic ? `<button type="button" class="btn-action-bar" onclick="CompendioWildMagic.saveSyntheticSpellToCustomLibrary('${escapeHtml(sp.id)}')">💾 Salvar na Biblioteca</button>` : ''}
                    <button type="button" class="btn-action-bar" onclick="CompendioWildMagic.copyTextSummary('${escapeHtml(sp.name + ' (' + levelLabel(sp.level) + ' · ' + sp.school + '): ' + sp.description)}')">📋 Copiar</button>
                </div>
            </div>
        `;
    }

    function renderGeneratorTabHtml() {
        const g = wmState.generator;
        const matchingCount = getFilteredSpells(g).length;
        const spellsHtml = (wmState.lastGeneratedSpells || []).length > 0
            ? (wmState.lastGeneratedSpells || []).map(sp => renderSpellCardHtml(sp)).join('')
            : `<div class="wm-result-empty"><div>Nenhum feitiço sorteado ainda. Ajuste os filtros e clique em <strong>✨ Sortear Magia(s)</strong> ou <strong>🧪 Sintetizar Magia Caótica</strong>!</div></div>`;

        return `
            <div class="form-section">
                <h3 class="form-section-title">✨ Gerador de Magia Aleatória (${matchingCount} magias compatíveis · ${BUILTIN_SPELLS.length + wmState.customSpells.length} no catálogo)</h3>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>Quantidade a Sortear</label>
                        <select class="form-control" onchange="CompendioWildMagic.updateGenerator('count', Number(this.value))">
                            ${[1, 3, 5, 10].map(n => `<option value="${n}" ${Number(g.count) === n ? 'selected' : ''}>${n} magia${n > 1 ? 's' : ''}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Círculo Mínimo / Máximo</label>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <select class="form-control" style="flex:1;" onchange="CompendioWildMagic.setGeneratorLevelRange(Number(this.value), null)">
                                ${Array.from({ length: 10 }, (_, l) => `<option value="${l}" ${Number(g.minLevel) === l ? 'selected' : ''}>${l === 0 ? '0º (Truque)' : l + 'º'}</option>`).join('')}
                            </select>
                            <span>até</span>
                            <select class="form-control" style="flex:1;" onchange="CompendioWildMagic.setGeneratorLevelRange(null, Number(this.value))">
                                ${Array.from({ length: 10 }, (_, l) => `<option value="${l}" ${Number(g.maxLevel) === l ? 'selected' : ''}>${l === 0 ? '0º (Truque)' : l + 'º'}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Escola de Magia</label>
                        <select class="form-control" onchange="CompendioWildMagic.updateGenerator('school', this.value)">
                            <option value="all" ${g.school === 'all' ? 'selected' : ''}>Todas as Escolas</option>
                            ${SCHOOLS.map(s => `<option value="${escapeHtml(s)}" ${g.school === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Lista de Classe</label>
                        <select class="form-control" onchange="CompendioWildMagic.updateGenerator('className', this.value)">
                            <option value="all" ${g.className === 'all' ? 'selected' : ''}>Todas as Classes</option>
                            ${CLASSES_LIST.map(c => `<option value="${escapeHtml(c)}" ${g.className === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Concentração / Origem</label>
                        <div style="display:flex; gap:6px;">
                            <select class="form-control" style="flex:1;" onchange="CompendioWildMagic.updateGenerator('concentrationFilter', this.value)">
                                <option value="all" ${g.concentrationFilter === 'all' ? 'selected' : ''}>Conc: Todas</option>
                                <option value="yes" ${g.concentrationFilter === 'yes' ? 'selected' : ''}>Com Concentração</option>
                                <option value="no" ${g.concentrationFilter === 'no' ? 'selected' : ''}>Sem Concentração</option>
                            </select>
                            <select class="form-control" style="flex:1;" onchange="CompendioWildMagic.updateGenerator('sourceFilter', this.value)">
                                <option value="all" ${g.sourceFilter === 'all' ? 'selected' : ''}>Catálogo Completo</option>
                                <option value="builtin" ${g.sourceFilter === 'builtin' ? 'selected' : ''}>Somente Embutidas</option>
                                <option value="custom" ${g.sourceFilter === 'custom' ? 'selected' : ''}>Somente Importadas (${wmState.customSpells.length})</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group" style="justify-content:flex-end;">
                        <label>Filtros Extras</label>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            <label class="wm-check-pill ${g.ritualOnly ? 'is-on' : ''}">
                                <input type="checkbox" ${g.ritualOnly ? 'checked' : ''} onchange="CompendioWildMagic.updateGenerator('ritualOnly', this.checked)"> Ritual
                            </label>
                            <label class="wm-check-pill ${g.attackOrDamageOnly ? 'is-on' : ''}">
                                <input type="checkbox" ${g.attackOrDamageOnly ? 'checked' : ''} onchange="CompendioWildMagic.updateGenerator('attackOrDamageOnly', this.checked)"> Com Dados/Dano
                            </label>
                        </div>
                    </div>
                </div>

                <div class="wm-toggles-row" style="margin-top:10px;">
                    <label class="wm-check-pill ${g.applyChaosMutation ? 'is-on' : ''}">
                        <input type="checkbox" ${g.applyChaosMutation ? 'checked' : ''} onchange="CompendioWildMagic.updateGenerator('applyChaosMutation', this.checked)"> 🌀 Aplicar Mutação Caótica (28 variações)
                    </label>
                    <label class="wm-check-pill ${g.includeScrollStats ? 'is-on' : ''}">
                        <input type="checkbox" ${g.includeScrollStats ? 'checked' : ''} onchange="CompendioWildMagic.updateGenerator('includeScrollStats', this.checked)"> 📜 Incluir CD &amp; Bônus de Pergaminho
                    </label>
                </div>

                <div class="wm-action-cluster" style="margin-top:12px;">
                    <button type="button" class="btn-save-primary wm-btn-big" onclick="CompendioWildMagic.generateRandomSpells()">✨ Sortear Magia(s)</button>
                    <button type="button" class="btn-summon-card" style="padding:9px 14px;" onclick="CompendioWildMagic.generateComboSpellAndSurge()">🌀 Combo: Magia + Surto Selvagem</button>
                    <button type="button" class="btn-action-bar" onclick="CompendioWildMagic.synthesizeProceduralChaosSpell()">🧪 Sintetizar Magia Caótica Inédita</button>
                </div>
            </div>

            ${wmState.lastCalculationResult && wmState.lastCalculationResult.type === 'direct-surge' ? `<div style="margin-bottom:12px;">${renderResultCardHtml(wmState.lastCalculationResult)}</div>` : ''}
            <div class="wm-spells-grid">${spellsHtml}</div>
        `;
    }

    function renderImportTabHtml() {
        const preview = wmState.pendingImportPreview;
        const previewHtml = preview ? `
            <div class="wm-mutation-box" style="margin-top:10px;">
                <div>👀 <strong>Pré-visualização pronta:</strong> ${preview.spells.length} magia(s) e ${preview.effects.length} efeito(s) selvagem(ns) reconhecidos.</div>
                ${preview.warnings.length ? `<div style="color:#ffca7a; font-size:11px; margin-top:4px;">${escapeHtml(preview.warnings.join(' · '))}</div>` : ''}
                <div style="display:flex; gap:8px; margin-top:8px;">
                    <button type="button" class="btn-summon-card" onclick="CompendioWildMagic.confirmPendingImport()">✓ Confirmar Importação</button>
                    <button type="button" class="btn-action-bar" onclick="CompendioWildMagic.clearPendingImport()">Cancelar</button>
                </div>
            </div>
        ` : '';

        return `
            <div class="form-section">
                <h3 class="form-section-title">📥 Importar Magias &amp; Efeitos Selvagens (.json, 5e.tools, .csv, .txt, .md)</h3>
                <p style="font-size:12px; color:#b8bccf; margin-top:0;">
                    Cole abaixo um JSON (inclusive formato <strong>5e.tools</strong>), tabela <strong>CSV</strong> ou linhas em texto simples (ex.: <code>Nome | Nível | Escola | Dados | Descrição</code> ou <code>01-02: Efeito...</code>), ou selecione um arquivo do computador.
                </p>
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">
                    <select id="wm-import-mode" class="form-control" style="max-width:260px;">
                        <option value="auto">🤖 Auto-detectar (Magias / Efeitos)</option>
                        <option value="spells">✨ Forçar como Magias Aleatórias</option>
                        <option value="effects">🌀 Forçar como Efeitos Selvagens</option>
                    </select>
                    <button type="button" class="btn-action-bar" onclick="document.getElementById('wm-import-file').click()">📂 Escolher Arquivo</button>
                    <input type="file" id="wm-import-file" accept=".json,.csv,.txt,.md,.tsv" style="display:none;" onchange="CompendioWildMagic.handleImportFile(event)">
                    <button type="button" class="btn-action-bar" onclick="CompendioWildMagic.fillImportSample('json')">📋 Exemplo JSON</button>
                    <button type="button" class="btn-action-bar" onclick="CompendioWildMagic.fillImportSample('txt')">📝 Exemplo Texto/CSV</button>
                </div>
                <textarea id="wm-import-textarea" class="form-control code-area" placeholder='Exemplo:\nChuva Estelar | 4 | Evocação | 6d8 Radiante | 36 m | Instantânea | Chuva de estrelas atinge esfera de 6 m (DES metade).\n\nou JSON {"spells":[...], "wildEffects":[...]}'></textarea>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
                    <button type="button" class="btn-save-primary" onclick="CompendioWildMagic.importFromTextarea(false)">📥 Importar Agora</button>
                    <button type="button" class="btn-action-bar" onclick="CompendioWildMagic.importFromTextarea(true)">👀 Pré-visualizar Antes</button>
                    <button type="button" class="btn-action-bar" onclick="CompendioWildMagic.exportCustomLibraryJson()">⬇ Exportar Importadas (.json)</button>
                    <button type="button" class="btn-action-bar danger" onclick="CompendioWildMagic.clearCustomLibrary()">🗑️ Limpar Importadas (${wmState.customSpells.length + wmState.customEffects.length})</button>
                </div>
                ${previewHtml}
            </div>

            <div class="wm-two-col">
                <div class="form-section" style="margin:0;">
                    <h3 class="form-section-title">＋ Adicionar Magia Manualmente</h3>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Nome da Magia</label>
                            <input type="text" id="wm-add-sp-name" class="form-control" placeholder="Ex: Lâmina de Hadar">
                        </div>
                        <div class="form-group">
                            <label>Círculo &amp; Escola</label>
                            <div style="display:flex; gap:6px;">
                                <select id="wm-add-sp-level" class="form-control" style="flex:1;">
                                    ${Array.from({ length: 10 }, (_, l) => `<option value="${l}">${levelLabel(l)}</option>`).join('')}
                                </select>
                                <select id="wm-add-sp-school" class="form-control" style="flex:1;">
                                    ${SCHOOLS.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Dano / Fórmula (Opcional)</label>
                            <input type="text" id="wm-add-sp-dmg" class="form-control" placeholder="Ex: 4d8 Necrótico (CON)">
                        </div>
                        <div class="form-group">
                            <label>Alcance / Duração</label>
                            <div style="display:flex; gap:6px;">
                                <input type="text" id="wm-add-sp-range" class="form-control" value="18 m" style="flex:1;">
                                <input type="text" id="wm-add-sp-dur" class="form-control" value="Instantânea" style="flex:1;">
                            </div>
                        </div>
                        <div class="form-group full">
                            <label>Descrição Mecânica</label>
                            <textarea id="wm-add-sp-desc" class="form-control" placeholder="Descreva o efeito, salvaguarda e condições..."></textarea>
                        </div>
                    </div>
                    <button type="button" class="btn-summon-card" style="margin-top:8px;" onclick="CompendioWildMagic.submitManualSpell()">＋ Salvar Magia na Biblioteca</button>
                </div>

                <div class="form-section" style="margin:0;">
                    <h3 class="form-section-title">＋ Adicionar Efeito Selvagem Manualmente</h3>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Título do Efeito</label>
                            <input type="text" id="wm-add-ef-title" class="form-control" placeholder="Ex: Risada Astral Ecoante">
                        </div>
                        <div class="form-group">
                            <label>Severidade &amp; Categoria</label>
                            <div style="display:flex; gap:6px;">
                                <select id="wm-add-ef-sev" class="form-control" style="flex:1;">
                                    <option value="neutro">Neutro / Caos</option>
                                    <option value="benefico">Benéfico</option>
                                    <option value="perigoso">Perigoso</option>
                                    <option value="catastrofico">Catastrófico</option>
                                </select>
                                <input type="text" id="wm-add-ef-cat" class="form-control" value="Custom / Mesa" style="flex:1;">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Duração</label>
                            <input type="text" id="wm-add-ef-dur" class="form-control" value="1 minuto">
                        </div>
                        <div class="form-group">
                            <label>Fórmula Rolável (Opcional)</label>
                            <input type="text" id="wm-add-ef-roll" class="form-control" placeholder="Ex: 3d6 ou 1d10">
                        </div>
                        <div class="form-group full">
                            <label>Descrição do Efeito</label>
                            <textarea id="wm-add-ef-desc" class="form-control" placeholder="O que acontece quando esse surto detona..."></textarea>
                        </div>
                    </div>
                    <button type="button" class="btn-summon-card" style="margin-top:8px;" onclick="CompendioWildMagic.submitManualEffect()">＋ Salvar Efeito Selvagem</button>
                </div>
            </div>
        `;
    }

    function renderLibraryTabHtml() {
        const searchQ = normalizeText(wmState.librarySearch);
        const type = wmState.libraryType === 'spells' ? 'spells' : 'effects';
        const totalEffects = BUILTIN_EFFECTS.length + wmState.customEffects.length;
        const totalSpells = BUILTIN_SPELLS.length + wmState.customSpells.length;

        let listHtml = '';
        if (type === 'effects') {
            const filtered = getAllEffects(wmState.libraryTableFilter || 'all', 'all').filter(ef => {
                if (!searchQ) return true;
                return normalizeText(`${ef.code} ${ef.title} ${ef.category} ${ef.description}`).includes(searchQ);
            });
            listHtml = filtered.slice(0, 250).map(ef => {
                const sev = severityBadge(ef.severity);
                return `
                    <div class="wm-lib-row">
                        <div style="flex:1;">
                            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                                <span class="wm-d100-chip">${escapeHtml(ef.code)}</span>
                                <strong style="color:#fff;">${escapeHtml(ef.title)}</strong>
                                <span class="wm-sev-pill ${sev.cls}">${escapeHtml(sev.label)}</span>
                                <span class="list-item-folder-badge">${escapeHtml(tableLabel(ef.table))}</span>
                            </div>
                            <div style="font-size:12px; color:#c8cddc; margin-top:4px;">${escapeHtml(ef.description)}</div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <button type="button" class="btn-mini" onclick="CompendioWildMagic.activateEffectFromLibrary('${escapeHtml(ef.id)}')">⚡ Ativar</button>
                            ${!ef.builtin ? `<button type="button" class="btn-mini danger" onclick="CompendioWildMagic.deleteCustomEffect('${escapeHtml(ef.id)}')">✕</button>` : ''}
                        </div>
                    </div>
                `;
            }).join('') || '<div style="color:#9da3b8; padding:12px;">Nenhum efeito encontrado nesta busca.</div>';
        } else {
            const filtered = getAllSpells().filter(sp => {
                if (wmState.libraryLevelFilter !== 'all' && Number(sp.level) !== Number(wmState.libraryLevelFilter)) return false;
                if (wmState.librarySchoolFilter !== 'all' && normalizeText(sp.school) !== normalizeText(wmState.librarySchoolFilter)) return false;
                if (!searchQ) return true;
                return normalizeText(`${sp.name} ${sp.school} ${sp.description} ${(sp.classes || []).join(' ')}`).includes(searchQ);
            });
            listHtml = filtered.slice(0, 250).map(sp => `
                <div class="wm-lib-row">
                    <div style="flex:1;">
                        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                            <span class="wm-d100-chip">${escapeHtml(levelLabel(sp.level))}</span>
                            <strong style="color:#fff;">${escapeHtml(sp.name)}</strong>
                            <span class="list-item-folder-badge">${escapeHtml(sp.school)}</span>
                            ${sp.rollFormula ? `<span class="list-item-folder-badge">${escapeHtml(sp.damageOrRoll || sp.rollFormula)}</span>` : ''}
                            ${!sp.builtin ? `<span class="list-item-folder-badge" style="border-color:#9b59b6; color:#e5c3ff;">Importada</span>` : ''}
                        </div>
                        <div style="font-size:12px; color:#c8cddc; margin-top:4px;">${escapeHtml(sp.description)}</div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <button type="button" class="btn-mini" onclick="CompendioWildMagic.castLibrarySpell('${escapeHtml(sp.id)}')">✨ Usar</button>
                        ${!sp.builtin ? `<button type="button" class="btn-mini danger" onclick="CompendioWildMagic.deleteCustomSpell('${escapeHtml(sp.id)}')">✕</button>` : ''}
                    </div>
                </div>
            `).join('') || '<div style="color:#9da3b8; padding:12px;">Nenhuma magia encontrada nesta busca.</div>';
        }

        return `
            <div class="form-section">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="${type === 'effects' ? 'btn-save-primary' : 'btn-action-bar'}" onclick="CompendioWildMagic.setLibraryFilter('libraryType', 'effects')">🌀 Efeitos Selvagens (${totalEffects})</button>
                        <button type="button" class="${type === 'spells' ? 'btn-save-primary' : 'btn-action-bar'}" onclick="CompendioWildMagic.setLibraryFilter('libraryType', 'spells')">✨ Catálogo de Magias (${totalSpells})</button>
                    </div>
                    <input type="text" class="form-control" style="min-width:240px;" placeholder="🔍 Buscar na biblioteca..." value="${escapeHtml(wmState.librarySearch)}" oninput="CompendioWildMagic.setLibraryFilter('librarySearch', this.value)">
                </div>

                ${type === 'effects' ? `
                    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
                        ${[
                            ['all', 'Todas as Tabelas'],
                            ['classic', 'Clássica PHB (50)'],
                            ['chaos', 'Expandida Arcana (60)'],
                            ['cosmic', 'Cósmica / Hadar (50)'],
                            ['custom', `Importadas (${wmState.customEffects.length})`]
                        ].map(([k, lbl]) => `<button type="button" class="vis-pill ${(wmState.libraryTableFilter || 'all') === k ? 'active-studied' : ''}" onclick="CompendioWildMagic.setLibraryFilter('libraryTableFilter', '${k}')">${lbl}</button>`).join('')}
                    </div>
                ` : `
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                        <select class="form-control" style="max-width:170px;" onchange="CompendioWildMagic.setLibraryFilter('libraryLevelFilter', this.value)">
                            <option value="all" ${wmState.libraryLevelFilter === 'all' ? 'selected' : ''}>Todos os Círculos</option>
                            ${Array.from({ length: 10 }, (_, l) => `<option value="${l}" ${String(wmState.libraryLevelFilter) === String(l) ? 'selected' : ''}>${levelLabel(l)}</option>`).join('')}
                        </select>
                        <select class="form-control" style="max-width:210px;" onchange="CompendioWildMagic.setLibraryFilter('librarySchoolFilter', this.value)">
                            <option value="all" ${wmState.librarySchoolFilter === 'all' ? 'selected' : ''}>Todas as Escolas</option>
                            ${SCHOOLS.map(s => `<option value="${escapeHtml(s)}" ${wmState.librarySchoolFilter === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                        </select>
                    </div>
                `}

                <div class="wm-lib-list">${listHtml}</div>
            </div>
        `;
    }

    function renderHistoryTabHtml() {
        const items = wmState.history || [];
        return `
            <div class="form-section">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    <h3 class="form-section-title" style="margin:0; border:none;">📜 Histórico de Magia Selvagem &amp; Sorteios (${items.length})</h3>
                    <button type="button" class="btn-action-bar danger" onclick="CompendioWildMagic.clearHistory()">🗑️ Limpar Histórico</button>
                </div>
                <div class="wm-lib-list">
                    ${items.map(it => `
                        <div class="wm-lib-row">
                            <div style="flex:1;">
                                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                                    <span class="list-item-folder-badge">${escapeHtml(it.timestamp || '')}</span>
                                    <strong style="color:var(--accent-gold-hover);">${escapeHtml(it.casterName || 'Mestre')}</strong>
                                    <span style="font-size:12px; color:#d7dce8;">${escapeHtml(it.summary || '')}</span>
                                </div>
                                ${it.effectTitle ? `<div style="margin-top:4px; font-size:12.5px; color:#fff;"><strong>${it.effectCode ? `[${escapeHtml(it.effectCode)}] ` : ''}${escapeHtml(it.effectTitle)}</strong> — ${escapeHtml(it.effectDescription || '')}</div>` : ''}
                            </div>
                        </div>
                    `).join('') || '<div style="color:#9da3b8; padding:12px;">Nenhum registro na sessão ainda.</div>'}
                </div>
            </div>
        `;
    }

    function renderWildMagicScreen() {
        const displayArea = document.getElementById('dynamic-display-area');
        const listEl = document.getElementById('dynamic-item-list');
        const titleEl = document.getElementById('dynamic-list-title');

        if (!isGmAuthorized()) {
            if (displayArea) displayArea.innerHTML = '';
            if (listEl) listEl.innerHTML = '';
            if (typeof showToast === 'function') showToast('🔒 A Calculadora de Magia Selvagem é exclusiva do Host/Mestre.');
            if (typeof currentCategory !== 'undefined' && currentCategory === 'wildmagic') {
                currentCategory = 'monsters';
            }
            return;
        }

        if (titleEl) titleEl.textContent = 'Magia Selvagem (GM)';
        renderSidebarQuickList();
        if (!displayArea) return;

        const tab = wmState.activeTab || 'calc';
        let bodyHtml = '';
        if (tab === 'generator') bodyHtml = renderGeneratorTabHtml();
        else if (tab === 'import') bodyHtml = renderImportTabHtml();
        else if (tab === 'library') bodyHtml = renderLibraryTabHtml();
        else if (tab === 'history') bodyHtml = renderHistoryTabHtml();
        else bodyHtml = renderCalculatorTabHtml();

        const totalEffects = BUILTIN_EFFECTS.length + wmState.customEffects.length;
        const totalSpells = BUILTIN_SPELLS.length + wmState.customSpells.length;

        displayArea.innerHTML = `
            <div class="info-container wm-shell">
                <div class="wm-topbar">
                    <div>
                        <h2 class="info-title" style="margin:0; border:none; padding:0;">🌀 Calculadora de Magia Selvagem &amp; Caos Arcano</h2>
                        <div style="font-size:11.5px; color:#a8adc0; margin-top:2px;">
                            🔒 Exclusiva do Host/Mestre · <strong>${totalEffects}</strong> efeitos selvagens · <strong>${totalSpells}</strong> magias aleatórias disponíveis
                        </div>
                    </div>
                    <div class="wm-tabs-bar">
                        <button type="button" class="${tab === 'calc' ? 'btn-save-primary' : 'btn-action-bar'}" onclick="CompendioWildMagic.setTab('calc')">⚡ Calculadora</button>
                        <button type="button" class="${tab === 'generator' ? 'btn-save-primary' : 'btn-action-bar'}" onclick="CompendioWildMagic.setTab('generator')">✨ Gerador</button>
                        <button type="button" class="${tab === 'import' ? 'btn-save-primary' : 'btn-action-bar'}" onclick="CompendioWildMagic.setTab('import')">📥 Importar</button>
                        <button type="button" class="${tab === 'library' ? 'btn-save-primary' : 'btn-action-bar'}" onclick="CompendioWildMagic.setTab('library')">📚 Biblioteca (${totalEffects + totalSpells})</button>
                        <button type="button" class="${tab === 'history' ? 'btn-save-primary' : 'btn-action-bar'}" onclick="CompendioWildMagic.setTab('history')">📜 Histórico</button>
                    </div>
                </div>
                ${bodyHtml}
            </div>
        `;
    }

    // ------------------------------------------------------------------------
    // API PÚBLICA NO ESCOPO GLOBAL (PARA UI E TESTES AUTOMATIZADOS)
    // ------------------------------------------------------------------------
    const CompendioWildMagic = {
        BUILTIN_EFFECTS,
        BUILTIN_SPELLS,
        CHAOS_MUTATIONS,
        SCHOOLS,
        CLASSES_LIST,

        getState() { return wmState; },
        isAuthorized() { return isGmAuthorized(); },
        renderScreen() { renderWildMagicScreen(); },

        loadLocalPersistence: loadWildMagicPersistence,
        saveLocalPersistence: saveWildMagicPersistence,
        applyServerState: applyServerWildMagicState,
        exportStateForBackup() { return isGmAuthorized() ? exportCleanStateForPersistence() : null; },
        importStateFromBackup(raw) {
            if (!isGmAuthorized() || !raw) return;
            wmState = mergePersistedState(raw);
            saveWildMagicPersistence(false);
        },

        setTab(tab) {
            if (!isGmAuthorized()) return;
            wmState.activeTab = tab;
            saveWildMagicPersistence(false);
            renderWildMagicScreen();
        },

        setPreset(preset) {
            if (!isGmAuthorized()) return;
            wmState.config.rulePreset = preset;
            if (preset === 'phb') {
                wmState.config.dieType = 20;
                wmState.config.baseThreshold = 1;
                wmState.config.perLevelBonus = 0;
                wmState.config.escalationStep = 0;
            } else if (preset === 'escalating') {
                wmState.config.dieType = 20;
                wmState.config.baseThreshold = 1;
                wmState.config.perLevelBonus = 0;
                wmState.config.escalationStep = 1;
            } else if (preset === 'spellLevel') {
                wmState.config.dieType = 20;
                wmState.config.baseThreshold = 0;
                wmState.config.perLevelBonus = 1;
                wmState.config.escalationStep = 0;
            } else if (preset === 'percent') {
                wmState.config.dieType = 100;
                wmState.config.baseThreshold = 10;
                wmState.config.perLevelBonus = 5;
                wmState.config.escalationStep = 5;
            }
            saveWildMagicPersistence();
            renderWildMagicScreen();
        },

        updateConfig(key, value) {
            if (!isGmAuthorized()) return;
            wmState.config[key] = value;
            saveWildMagicPersistence();
            if (typeof activeModule !== 'undefined' && currentCategory === 'wildmagic') renderWildMagicScreen();
        },

        adjustStreak(delta) {
            if (!isGmAuthorized()) return;
            wmState.config.streakCount = Math.max(0, (Number(wmState.config.streakCount) || 0) + Number(delta || 0));
            saveWildMagicPersistence();
            renderWildMagicScreen();
        },

        calculateSurgeOdds,
        checkWildMagicSurge,
        triggerDirectWildSurge,
        triggerManualD100(val) {
            const num = Math.max(1, Math.min(100, Math.round(Number(val) || 1)));
            return triggerDirectWildSurge(num);
        },
        pickControlledChaosOption,

        rollInlineFormula(formula, title = 'Magia Selvagem') {
            if (!isGmAuthorized()) return null;
            const rec = rollFormulaQuick(formula, title, {
                isSecret: Boolean(wmState.config.secretRoll),
                skip3d: Boolean(wmState.config.secretRoll)
            });
            if (typeof showToast === 'function' && rec) {
                showToast(`🎲 ${title} (${formula}): ${rec.total}`);
            }
            return rec;
        },

        updateGenerator(key, value) {
            if (!isGmAuthorized()) return;
            wmState.generator[key] = value;
            saveWildMagicPersistence(false);
            renderWildMagicScreen();
        },

        setGeneratorLevelRange(minL, maxL) {
            if (!isGmAuthorized()) return;
            if (minL !== null && minL !== undefined) wmState.generator.minLevel = Math.max(0, Math.min(9, Number(minL)));
            if (maxL !== null && maxL !== undefined) wmState.generator.maxLevel = Math.max(0, Math.min(9, Number(maxL)));
            if (wmState.generator.minLevel > wmState.generator.maxLevel) {
                if (minL !== null && minL !== undefined) wmState.generator.maxLevel = wmState.generator.minLevel;
                else wmState.generator.minLevel = wmState.generator.maxLevel;
            }
            saveWildMagicPersistence(false);
            renderWildMagicScreen();
        },

        getFilteredSpells,
        generateRandomSpells,
        generateComboSpellAndSurge,
        synthesizeProceduralChaosSpell,
        saveSyntheticSpellToCustomLibrary,

        toggleFavoriteSpell(spellId) {
            if (!isGmAuthorized()) return;
            const list = wmState.favoriteSpellIds || [];
            const idx = list.indexOf(spellId);
            if (idx >= 0) list.splice(idx, 1);
            else list.unshift(spellId);
            wmState.favoriteSpellIds = list;
            saveWildMagicPersistence();
            renderWildMagicScreen();
        },

        castLibrarySpell(spellId) {
            if (!isGmAuthorized()) return;
            const found = getAllSpells().find(s => s.id === spellId);
            if (!found) return;
            wmState.lastGeneratedSpells = [attachGeneratorExtras(found, wmState.generator)];
            wmState.activeTab = 'generator';
            pushHistoryRecord({
                kind: 'library-spell',
                casterName: (wmState.config.casterName || '').trim() || 'Mestre',
                spellLevel: found.level,
                summary: `Selecionada da Biblioteca: ${found.name}`,
                effectTitle: found.name,
                effectCode: levelLabel(found.level),
                effectDescription: found.description
            });
            saveWildMagicPersistence();
            renderWildMagicScreen();
        },

        activateEffectFromLibrary(effectId) {
            if (!isGmAuthorized()) return;
            const found = getAllEffects('all', 'all').find(e => e.id === effectId);
            if (!found) return;
            wmState.lastCalculationResult = {
                type: 'library-effect',
                triggered: true,
                casterName: (wmState.config.casterName || '').trim() || 'Mestre',
                spellLevel: Number(wmState.config.spellLevel) || 0,
                dieType: 100,
                rollValue: found.min || 100,
                threshold: 100,
                probabilityPct: 100,
                formulaLabel: `Selecionado manualmente (${tableLabel(found.table)})`,
                reasonText: `Efeito aplicado da Biblioteca (${found.code})`,
                controlledChaos: false,
                options: [{ d100: found.code, effect: found }],
                chosenIndex: 0
            };
            wmState.activeTab = 'calc';
            pushHistoryRecord({
                kind: 'surge',
                casterName: (wmState.config.casterName || '').trim() || 'Mestre',
                spellLevel: Number(wmState.config.spellLevel) || 0,
                summary: `Efeito ativado manualmente: ${found.title}`,
                effectTitle: found.title,
                effectCode: found.code,
                effectDescription: found.description
            });
            saveWildMagicPersistence();
            renderWildMagicScreen();
        },

        parseImportedContent,
        importContentString,
        exportCustomLibraryJson,

        importFromTextarea(previewOnly = false) {
            if (!isGmAuthorized()) return;
            const area = document.getElementById('wm-import-textarea');
            const modeEl = document.getElementById('wm-import-mode');
            const raw = area ? area.value : '';
            const mode = modeEl ? modeEl.value : 'auto';
            if (previewOnly) {
                wmState.pendingImportPreview = parseImportedContent(raw, mode);
                renderWildMagicScreen();
                const restoredArea = document.getElementById('wm-import-textarea');
                if (restoredArea) restoredArea.value = raw;
                return;
            }
            importContentString(raw, mode);
        },

        confirmPendingImport() {
            if (!isGmAuthorized() || !wmState.pendingImportPreview) return;
            const counts = commitImportedItems(wmState.pendingImportPreview);
            if (typeof showToast === 'function') {
                showToast(`📥 Confirmado: +${counts.addedSpells} magia(s) e +${counts.addedEffects} efeito(s)!`);
            }
            renderWildMagicScreen();
        },

        clearPendingImport() {
            wmState.pendingImportPreview = null;
            renderWildMagicScreen();
        },

        handleImportFile(event) {
            if (!isGmAuthorized()) return;
            const file = event?.target?.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const modeEl = document.getElementById('wm-import-mode');
                const mode = modeEl ? modeEl.value : 'auto';
                importContentString(String(reader.result || ''), mode);
            };
            reader.readAsText(file, 'utf8');
        },

        fillImportSample(kind) {
            const area = document.getElementById('wm-import-textarea');
            if (!area) return;
            if (kind === 'json') {
                area.value = JSON.stringify({
                    spells: [
                        {
                            name: 'Lâmina da Estrela Faminta',
                            level: 3,
                            school: 'Evocação',
                            castingTime: '1 ação bônus',
                            range: 'Pessoal',
                            components: 'V, S',
                            duration: 'Concentração, 1 minuto',
                            classes: ['Bruxo', 'Feiticeiro'],
                            damageOrRoll: '3d8 Necrótico',
                            description: 'Conjura uma lâmina de vazio estelar que causa 3d8 necrótico em ataques corpo a corpo e suga 1d4 PV de cura no crítico.'
                        }
                    ],
                    wildEffects: [
                        {
                            title: 'Chuva de Moedas Ilusórias',
                            category: 'Roleplay / Bizarro',
                            severity: 'neutro',
                            duration: '1 minuto',
                            description: 'Moedas douradas fantasmagóricas chovem num raio de 6 m e desaparecem ao serem guardadas.'
                        }
                    ]
                }, null, 2);
            } else {
                area.value = [
                    'Explosão Cromática | 2 | Evocação | 4d6 Elemental | 18 m | Instantânea | Projétil prismático explode (DES metade) causando 4d6 de um elemento aleatório.',
                    'Passo das Cinzas | 1 | Conjuração | 1d6 Fogo | 9 m | Instantânea | Teleporta 9 m deixando explosão de brasa de 1d6 fogo para trás.',
                    '01-02 | Efeito Sombra Súbita | Cósmico | Perigoso | Toda luz não mágica num raio de 9 m apaga e você ganha 2d6 PV temporários.'
                ].join('\n');
            }
        },

        submitManualSpell() {
            if (!isGmAuthorized()) return;
            const name = (document.getElementById('wm-add-sp-name')?.value || '').trim();
            if (!name) {
                if (typeof showToast === 'function') showToast('⚠️ Informe o nome da magia.');
                return;
            }
            const sp = normalizeSpellRecord({
                name,
                level: Number(document.getElementById('wm-add-sp-level')?.value || 1),
                school: document.getElementById('wm-add-sp-school')?.value || 'Evocação',
                damageOrRoll: document.getElementById('wm-add-sp-dmg')?.value || '',
                range: document.getElementById('wm-add-sp-range')?.value || '18 m',
                duration: document.getElementById('wm-add-sp-dur')?.value || 'Instantânea',
                description: document.getElementById('wm-add-sp-desc')?.value || ''
            });
            const counts = commitImportedItems({ spells: [sp], effects: [] });
            if (typeof showToast === 'function') showToast(`✨ Magia "${sp.name}" ${counts.updatedSpells ? 'atualizada' : 'adicionada'}!`);
            renderWildMagicScreen();
        },

        submitManualEffect() {
            if (!isGmAuthorized()) return;
            const title = (document.getElementById('wm-add-ef-title')?.value || '').trim();
            const desc = (document.getElementById('wm-add-ef-desc')?.value || '').trim();
            if (!title && !desc) {
                if (typeof showToast === 'function') showToast('⚠️ Informe um título ou descrição para o efeito.');
                return;
            }
            const ef = normalizeEffectRecord({
                title: title || 'Efeito Selvagem Customizado',
                severity: document.getElementById('wm-add-ef-sev')?.value || 'neutro',
                category: document.getElementById('wm-add-ef-cat')?.value || 'Custom / Mesa',
                duration: document.getElementById('wm-add-ef-dur')?.value || '1 minuto',
                rollFormula: document.getElementById('wm-add-ef-roll')?.value || '',
                description: desc || title
            });
            commitImportedItems({ spells: [], effects: [ef] });
            if (typeof showToast === 'function') showToast(`🌀 Efeito "${ef.title}" salvo!`);
            renderWildMagicScreen();
        },

        deleteCustomSpell(id) {
            if (!isGmAuthorized()) return;
            wmState.customSpells = wmState.customSpells.filter(s => s.id !== id);
            saveWildMagicPersistence();
            renderWildMagicScreen();
        },

        deleteCustomEffect(id) {
            if (!isGmAuthorized()) return;
            wmState.customEffects = wmState.customEffects.filter(e => e.id !== id);
            saveWildMagicPersistence();
            renderWildMagicScreen();
        },

        clearCustomLibrary() {
            if (!isGmAuthorized()) return;
            if (typeof confirm === 'function' && !confirm('Remover todas as magias e efeitos importados manualmente?')) return;
            wmState.customSpells = [];
            wmState.customEffects = [];
            saveWildMagicPersistence();
            renderWildMagicScreen();
        },

        setLibraryFilter(key, val) {
            if (!isGmAuthorized()) return;
            wmState[key] = val;
            renderWildMagicScreen();
        },

        clearHistory() {
            if (!isGmAuthorized()) return;
            wmState.history = [];
            wmState.lastCalculationResult = null;
            saveWildMagicPersistence();
            renderWildMagicScreen();
        },

        copyTextSummary(text) {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    if (typeof showToast === 'function') showToast('📋 Copiado para a área de transferência!');
                }).catch(() => {});
            }
        }
    };

    if (typeof window !== 'undefined') {
        window.CompendioWildMagic = CompendioWildMagic;
        window.renderWildMagicScreen = renderWildMagicScreen;
    }
})();
