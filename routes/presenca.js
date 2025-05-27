const express = require('express');
const router = express.Router();
const Presenca = require('../models/Presenca');

// Criar novo link de presença
router.post('/', async (req, res) => {
  try {
    const { linkId, dataJogo, jogadores } = req.body;

    if (!linkId || !dataJogo || !jogadores) {
      return res.status(400).json({
        success: false,
        message: 'Dados incompletos'
      });
    }

    const novaPresenca = await Presenca.create({
      linkId,
      dataJogo: new Date(dataJogo),
      jogadores: jogadores.map(j => ({
        id: j.id,
        nome: j.nome,
        presente: false
      }))
    });

    return res.json({
      success: true,
      data: novaPresenca
    });
  } catch (error) {
    console.error('Erro ao criar presença:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao criar link de presença'
    });
  }
});

// Buscar presença por linkId
router.get('/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;
    const presenca = await Presenca.findOne({ linkId });

    if (!presenca) {
      return res.status(404).json({
        success: false,
        message: 'Link inválido ou expirado'
      });
    }

    return res.json({
      success: true,
      data: presenca
    });
  } catch (error) {
    console.error('Erro ao buscar presença:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar dados de presença'
    });
  }
});

// Confirmar/desconfirmar presença
router.post('/:linkId/confirmar', async (req, res) => {
  try {
    const { linkId } = req.params;
    const { jogadorId, presente } = req.body;

    const presenca = await Presenca.findOne({ linkId });

    if (!presenca) {
      return res.status(404).json({
        success: false,
        message: 'Link inválido ou expirado'
      });
    }

    // Atualiza o status do jogador
    const jogadorIndex = presenca.jogadores.findIndex(j => j.id === jogadorId);
    if (jogadorIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Jogador não encontrado'
      });
    }

    presenca.jogadores[jogadorIndex].presente = presente;
    await presenca.save();

    return res.json({
      success: true,
      data: presenca
    });
  } catch (error) {
    console.error('Erro ao confirmar presença:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao atualizar presença'
    });
  }
});

module.exports = router;