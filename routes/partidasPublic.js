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
    const { tipo, jogador } = req.body;
    const link = await LinkPartida.findOne({ linkId: req.params.linkId });
    
    if (!link) return res.status(404).json({ success: false, message: 'Link expirado' });

    const partida = await Partida.findById(link.partidaId);
    if (partida.encerrada) return res.status(400).json({ success: false, message: 'Partida já encerrada' });

    switch (tipo) {
      case 'gol':
        partida.gols.push({ jogador });
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