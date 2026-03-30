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
    const linkId = uuidv4();
    
    // Define expiração para 3 dias (72 horas)
    const expireAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const novoLink = new LinkPartida({
      linkId,
      partidaId,
      expireAt
    });

    await novoLink.save();
    res.json({ success: true, linkId });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao gerar link' });
  }
});

// Buscar dados da partida via link público
router.get('/:linkId', async (req, res) => {
  try {
    const link = await LinkPartida.findOne({ linkId: req.params.linkId }).populate('partidaId');
    if (!link) {
      return res.status(404).json({ success: false, message: 'Link expirado ou inexistente' });
    }

    // Busca apenas os nomes dos jogadores ativos para o select público
    const jogadores = await Jogador.find({ ativo: { $ne: false } }).select('nome').sort({ nome: 1 });
    
    res.json({ 
      success: true, 
      data: link.partidaId,
      jogadores: jogadores.map(j => j.nome)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao buscar partida' });
  }
});

// Registrar Evento (Gol ou Cartão)
router.post('/:linkId/evento', async (req, res) => {
  try {
    const { tipo, jogador, time } = req.body;
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

// Autenticação do Jogador para Votação
router.post('/:linkId/auth-jogador', async (req, res) => {
  try {
    const { nome, password } = req.body; // password = DDMMAAAA
    const link = await LinkPartida.findOne({ linkId: req.params.linkId });
    if (!link) return res.status(404).json({ success: false, message: 'Link inválido' });

    const nomeNormalizado = nome.trim().toLowerCase();
    const jogador = await Jogador.findOne({ 
      nome: { $regex: new RegExp(`^${nomeNormalizado}$`, 'i') },
      ativo: { $ne: false }
    });

    if (!jogador || !jogador.dataNascimento) {
      return res.status(401).json({ success: false, message: 'Jogador não encontrado ou sem data de nascimento.' });
    }

    const data = new Date(jogador.dataNascimento);
    const dd = String(data.getDate()).padStart(2, '0');
    const mm = String(data.getMonth() + 1).padStart(2, '0');
    const yyyy = String(data.getFullYear());
    const senhaCorreta = `${dd}${mm}${yyyy}`;

    if (password !== senhaCorreta) {
      return res.status(401).json({ success: false, message: 'Data de nascimento incorreta.' });
    }

    // Verifica se já votou nesta partida
    const partida = await Partida.findById(link.partidaId);
    const jaVotou = partida.jogadoresQueVotaram.includes(jogador._id);

    res.json({ 
      success: true, 
      jogador: { id: jogador._id, nome: jogador.nome },
      jaVotou 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro na autenticação.' });
  }
});

// Autenticação do Admin na Votação
router.post('/:linkId/auth-admin', async (req, res) => {
  const { username, password } = req.body;
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