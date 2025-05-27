const express = require('express');
const router = express.Router();
const Presenca = require('../models/Presenca');

// POST /api/presenca - Criar novo link de presença
router.post('/', async (req, res) => {
  try {
    const { linkId, dataJogo, jogadores } = req.body;

    const novaPresenca = await Presenca.create({
      linkId,
      dataJogo,
      jogadores,
      dataCriacao: new Date()
    });

    res.json({
      success: true,
      data: novaPresenca
    });

  } catch (error) {
    console.error('Erro ao criar link de presença:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar link de presença'
    });
  }
});

module.exports = router;