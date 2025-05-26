const express = require('express');
const router = express.Router();
const Partida = require('../models/Partida');

// Listar todas as partidas agendadas
router.get('/', async (req, res) => {
  try {
    const partidas = await Partida.find().sort({ data: 1 });
    res.json(partidas);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar partidas' });
  }
});

// Agendar nova partida
router.post('/', async (req, res) => {
  try {
    const { data, horario, local, observacoes } = req.body;
    
    const novaPartida = new Partida({
      data,
      horario,
      local,
      observacoes
    });

    await novaPartida.save();
    res.status(201).json(novaPartida);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao agendar partida' });
  }
});

// Obter detalhes de uma partida
router.get('/:id', async (req, res) => {
  try {
    const partida = await Partida.findById(req.params.id);
    if (!partida) {
      return res.status(404).json({ error: 'Partida não encontrada' });
    }
    res.json(partida);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar partida' });
  }
});

// Atualizar partida
router.put('/:id', async (req, res) => {
  try {
    const { data, horario, local, observacoes } = req.body;
    
    const partidaAtualizada = await Partida.findByIdAndUpdate(
      req.params.id,
      { data, horario, local, observacoes },
      { new: true }
    );

    if (!partidaAtualizada) {
      return res.status(404).json({ error: 'Partida não encontrada' });
    }
    
    res.json(partidaAtualizada);
  } catch (error) {
    res.status(400).json({ error: 'Erro ao atualizar partida' });
  }
});

// Excluir partida
router.delete('/:id', async (req, res) => {
  try {
    const partidaExcluida = await Partida.findByIdAndDelete(req.params.id);
    if (!partidaExcluida) {
      return res.status(404).json({ error: 'Partida não encontrada' });
    }
    res.json({ message: 'Partida excluída com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir partida' });
  }
});

module.exports = router;
