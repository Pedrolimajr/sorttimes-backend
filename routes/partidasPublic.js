const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const LinkPartida = require('../models/LinkPartida');
const Partida = require('../models/Partida');
const Jogador = require('../models/Jogador');
const auth = require('../middleware/auth');

// Gerar link público (Apenas Admin)
router.post('/gerar-link/:partidaId', auth, async (req, res) => {
  try {
    const { partidaId } = req.params;
    const { tipo } = req.body; // 'eventos' ou 'votacao'
    const linkId = uuidv4();
    
    // Define expiração para 2 dias (48 horas)
    const expireAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

    const novoLink = new LinkPartida({
      linkId,
      partidaId,
      expireAt,
      tipo: tipo || 'eventos'
    });

    const savedLink = await novoLink.save();
    res.json({ 
      success: true, 
      linkId: savedLink.linkId, 
      expireAt: savedLink.expireAt,
      createdAt: savedLink.createdAt || new Date()
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao gerar link' });
  }
});

// Vincular participantes a uma partida (vindo do sorteio)
router.post('/vincular-participantes/:partidaId', auth, async (req, res) => {
  try {
    const { participantes } = req.body; // Array de IDs de jogadores
    console.log(`[BACKEND - VINCULAR] Recebido para partida ${req.params.partidaId}:`, participantes);
    await Partida.findByIdAndUpdate(req.params.partidaId, { participantes });
    res.json({ success: true, message: 'Lista de participantes atualizada!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao vincular participantes' });
  }
});

// Buscar dados da partida via link público
router.get('/:linkId', async (req, res) => {
  try {
    // Popula o link e a partida com os participantes e seus nomes/níveis
    const link = await LinkPartida.findOne({ linkId: req.params.linkId }).populate({
      path: 'partidaId',
      populate: { path: 'participantes', select: 'nome nivel foto' }
    });

    if (!link) {
      return res.status(404).json({ success: false, message: 'Link expirado ou inexistente' });
    }

    let nomesJogadores = [];
    // Converte para objeto plano para podermos filtrar a lista de participantes que vai para o front
    // Isso garante que se o VotacaoPartida.jsx usar data.participantes, ele já receba filtrado.
    const partidaData = link.partidaId ? link.partidaId.toObject() : null;

    // Lista de termos a serem filtrados (placeholders), em minúsculas e sem acentos/caracteres especiais
    const placeholderTerms = [
      'convidado / outro', 'convidado', 'visitante', 'outro', 'teste', 'jogador teste',
      'convidado / visitante', 'convidado(a)', 'convidado(s)', 'visitante(s)', 'jogador convidado'
    ];

    // Função auxiliar para verificar se um nome é um placeholder
    const isPlaceholderName = (name) => {
      if (!name) return true; // Nomes nulos ou vazios são considerados placeholders
      const cleanedName = name.trim().toLowerCase();
      // Verifica se o nome limpo é exatamente um dos termos ou se o inclui
      return placeholderTerms.some(term => cleanedName === term || cleanedName.includes(term));
    };

    if (link.tipo === 'votacao' || !link.tipo) {
      if (partidaData && partidaData.participantes) {
        // Filtra a lista de participantes que o frontend pode estar usando (populada no partidaId)
        partidaData.participantes = partidaData.participantes.filter(j => {
          const isAssociado = j && j.nivel === 'Associado';
          const isPlaceholder = isPlaceholderName(j?.nome);
          return isAssociado && !isPlaceholder;
        });
      }

      // A lista de nomes simplificada também fica filtrada
      nomesJogadores = (partidaData?.participantes || []).map(j => j.nome).sort();
    } else {
      // Para eventos live (Gols/Cartões), mantém a lista de todos os jogadores ativos (pode haver gol de convidado)
      const jogadores = await Jogador.find({ ativo: { $ne: false } }).select('nome').sort({ nome: 1 });
      nomesJogadores = jogadores.map(j => j.nome).filter(nome => !isPlaceholderName(nome));
    }

    res.json({ 
      success: true, 
      data: partidaData, // Retorna o objeto partida com participantes já filtrados
      jogadores: nomesJogadores,
      expireAt: link.expireAt
    });
  } catch (error) {
    console.error('Erro ao buscar dados do link:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar partida' });
  }
});

// Registrar Evento (Gol ou Cartão)
router.post('/:linkId/evento', async (req, res) => {
  try {
    const { tipo, jogador, time } = req.body; // 'time' é opcional para cartões
    const link = await LinkPartida.findOne({ linkId: req.params.linkId });
    
    if (!link) return res.status(404).json({ success: false, message: 'Link expirado' });

    const partida = await Partida.findById(link.partidaId);
    if (partida.encerrada) return res.status(400).json({ success: false, message: 'Partida já encerrada' });

    // Inicialização de segurança para documentos antigos
    if (!partida.gols) partida.gols = [];
    if (!partida.cartoesAmarelos) partida.cartoesAmarelos = [];
    if (!partida.cartoesVermelhos) partida.cartoesVermelhos = [];
    if (!partida.cartoesAzuis) partida.cartoesAzuis = [];

    switch (tipo) {
      case 'gol':
        partida.gols.push({ jogador, time });
        break;
      case 'amarelo':
        partida.cartoesAmarelos.push(jogador);
        break;
      case 'vermelho':
        partida.cartoesVermelhos.push(jogador);
        break;
      case 'azul':
        partida.cartoesAzuis.push(jogador);
        break;
    }

    await partida.save();
    
    // Opcional: Emitir via socket.io se configurado
    // req.app.get('io').emit('partidaAtualizada', partida);

    res.json({ success: true, data: partida });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao registrar evento' });
  }
});

// Excluir um evento (Gol ou Cartão)
router.delete('/:linkId/evento/:tipo/:index', async (req, res) => {
  try {
    const { tipo, index } = req.params;
    const link = await LinkPartida.findOne({ linkId: req.params.linkId });
    if (!link) return res.status(404).json({ success: false, message: 'Link expirado' });

    const partida = await Partida.findById(link.partidaId);
    if (partida.encerrada) return res.status(400).json({ success: false, message: 'Partida encerrada' });

    const idx = parseInt(index);
    if (tipo === 'gol') {
      partida.gols.splice(idx, 1);
    } else {
      const fieldMap = { 'amarelo': 'cartoesAmarelos', 'vermelho': 'cartoesVermelhos', 'azul': 'cartoesAzuis' };
      const field = fieldMap[tipo];
      if (field && partida[field]) partida[field].splice(idx, 1);
    }

    await partida.save();
    res.json({ success: true, data: partida });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao remover evento' });
  }
});

// Editar um evento (Gol ou Cartão)
router.patch('/:linkId/evento/:tipo/:index', async (req, res) => {
  try {
    const { tipo, index } = req.params;
    const { novoNome } = req.body;
    const link = await LinkPartida.findOne({ linkId: req.params.linkId });
    if (!link) return res.status(404).json({ success: false, message: 'Link expirado' });

    const partida = await Partida.findById(link.partidaId);
    if (partida.encerrada) return res.status(400).json({ success: false, message: 'Partida encerrada' });

    const idx = parseInt(index);
    if (tipo === 'gol') {
      if (partida.gols[idx]) partida.gols[idx].jogador = novoNome;
    } else {
      const fieldMap = { 'amarelo': 'cartoesAmarelos', 'vermelho': 'cartoesVermelhos', 'azul': 'cartoesAzuis' };
      const field = fieldMap[tipo];
      if (field && partida[field]) partida[field][idx] = novoNome;
    }

    await partida.save();
    res.json({ success: true, data: partida });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao editar evento' });
  }
});

// Atualizar Notas do Juiz (Observações)
router.patch('/:linkId/notas', async (req, res) => {
  try {
    const { notas } = req.body;
    const link = await LinkPartida.findOne({ linkId: req.params.linkId });
    if (!link) return res.status(404).json({ success: false, message: 'Link expirado' });

    const partida = await Partida.findById(link.partidaId);
    if (partida.encerrada) return res.status(400).json({ success: false, message: 'Edição bloqueada' });

    partida.observacoes = notas;
    await partida.save();

    res.json({ success: true, data: partida });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao salvar notas' });
  }
});

// Autenticação do Jogador para Votação
router.post('/:linkId/auth-jogador', async (req, res) => {
  try {
    const { nome, password } = req.body; // password = DDMMAAAA
    const link = await LinkPartida.findOne({ linkId: req.params.linkId });
    if (!link) return res.status(404).json({ success: false, message: 'Link inválido' });

    const nomeNormalizado = nome.trim().toLowerCase();
    const escapedNome = nomeNormalizado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Busca jogadores que começam com o nome digitado (permite nome + primeiro sobrenome)
    const jogadores = await Jogador.find({ 
      nome: { $regex: new RegExp(`^${escapedNome}(\\s|$)`, 'i') },
      ativo: { $ne: false }
    });

    if (jogadores.length === 0) {
      return res.status(401).json({ success: false, message: 'Jogador não encontrado.' });
    }

    // Tenta encontrar o jogador que corresponde à data de nascimento fornecida
    const jogador = jogadores.find(j => {
      if (!j.dataNascimento) return false;
      const data = new Date(j.dataNascimento);
      const dd = String(data.getDate()).padStart(2, '0');
      const mm = String(data.getMonth() + 1).padStart(2, '0');
      const yyyy = String(data.getFullYear());
      return password === `${dd}${mm}${yyyy}`;
    });

    if (!jogador) {
      return res.status(401).json({ success: false, message: 'Nome ou data de nascimento incorretos.' });
    }

    // Verifica se já votou nesta partida
    const partida = await Partida.findById(link.partidaId);

    // BLOQUEIO RIGOROSO: Apenas Associados sorteados na partida podem acessar a votação
    if (link.tipo === 'votacao' || !link.tipo) {
      const participantesIds = (partida.participantes || []).map(p => String(p));
      const jogadorIdStr = String(jogador._id);

      // Valida se participou do sorteio da partida, se é Associado, E se o nome não é um placeholder
      // Reutiliza a lógica de placeholder para consistência
      const placeholderTermsLogin = [
        'convidado / outro', 'convidado', 'visitante', 'outro', 'teste', 'jogador teste',
        'convidado / visitante', 'convidado(a)', 'convidado(s)', 'visitante(s)', 'jogador convidado'
      ];
      const isPlaceholder = placeholderTermsLogin.some(term => {
        const cleanedName = jogador.nome?.trim().toLowerCase();
        return cleanedName === term || cleanedName.includes(term);
      });

      console.log(`[DEBUG - AUTH-JOGADOR] Tentativa de login para "${jogador.nome}" (Nível: ${jogador.nivel}). Participou: ${participantesIds.includes(jogadorIdStr)}, Associado: ${jogador.nivel === 'Associado'}, É Placeholder: ${isPlaceholder}.`);

      if (!participantesIds.includes(jogadorIdStr) || 
          jogador.nivel !== 'Associado' || 
          isPlaceholder) {
        console.warn(`[BLOQUEIO] ${jogador.nome} (${jogador.nivel}) foi barrado na votação.`);
        return res.status(403).json({ 
          success: false, 
          message: 'Você não participou desta partida e não pode votar.' 
        });
      }
    }

    const jaVotou = partida.jogadoresQueVotaram.includes(jogador._id);

    res.json({ 
      success: true,
      // Retorna o partidaId para o frontend, útil para o admin
      partidaId: link.partidaId, 
      // Retorna o jogador para o frontend, para exibir o nome e usar o ID
      // no registro do voto
      jogador: { id: jogador._id, nome: jogador.nome },
      jaVotou 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro na autenticação.' });
  }
});

// Autenticação do Admin na Votação
router.post('/:linkId/auth-admin', async (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();

  console.log(`[AUTH-ADMIN] Tentativa de login: user="${username}"`);

  if (username === 'sorttimes' && password === '2025@sorttimes') {
    return res.json({ success: true, isAdmin: true });
  }
  res.status(401).json({ success: false, message: 'Credenciais de administrador inválidas.' });
});

// Registrar Voto Público
router.post('/:linkId/votar', async (req, res) => {
  try {
    const { votos, jogadorId } = req.body;
    const link = await LinkPartida.findOne({ linkId: req.params.linkId });
    if (!link) return res.status(404).json({ success: false, message: 'Link expirado' });

    // Popula a partida para ter acesso a jogadoresQueVotaram
    // const partida = await Partida.findById(link.partidaId).populate('jogadoresQueVotaram');
    // O populate não é necessário aqui, pois o array já contém os ObjectIDs
    const partida = await Partida.findById(link.partidaId);
    if (partida.encerrada) return res.status(400).json({ success: false, message: 'Votação encerrada' });

    if (partida.jogadoresQueVotaram.includes(jogadorId)) {
      return res.status(400).json({ success: false, message: 'Você já registrou seu voto!' });
    }

    // Adiciona os votos individualmente
    votos.forEach(v => {
      partida.votos.push({ categoria: v.categoria, jogador: v.jogador, votoIp: req.ip });
    });

    // Registra que este jogador votou
    partida.jogadoresQueVotaram.push(jogadorId);

    await partida.save();
    res.json({ success: true, message: 'Votos registrados com sucesso!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao registrar votos' });
  }
});

// Atualizar Destaques
router.patch('/:linkId/destaques', async (req, res) => {
  try {
    const { melhorPartida, perebaPartida, golMaisBonito } = req.body;
    const link = await LinkPartida.findOne({ linkId: req.params.linkId });
    
    if (!link) return res.status(404).json({ success: false, message: 'Link expirado' });

    const partida = await Partida.findById(link.partidaId);
    if (partida.encerrada) return res.status(400).json({ success: false, message: 'Edição bloqueada' });

    partida.destaques = { melhorPartida, perebaPartida, golMaisBonito };
    await partida.save();

    res.json({ success: true, data: partida });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao salvar destaques' });
  }
});

module.exports = router;