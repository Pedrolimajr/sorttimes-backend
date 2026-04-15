const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Partida = require('../models/Partida');

// Todas as rotas abaixo exigem autenticação
router.use(auth);

// Listar todas as partidas agendadas
router.get('/', async (req, res) => {
  try {
    let query = Partida.find().sort({ data: 1 });
    if (req.query.populate === 'participantes') {
      query = query.populate('participantes', 'nome'); // Popula apenas o nome dos participantes
    }
    const partidas = await query.exec();
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

// --- Rotas Administrativas de Eventos (Gols e Cartões) ---

// PATCH - Editar um gol por nome do jogador (atualiza todos os gols desse atleta na partida)
router.patch('/:partidaId/evento/gol/by-name', async (req, res) => {
  try {
    const { partidaId } = req.params;
    const { oldName, newName } = req.body;

    const partida = await Partida.findById(partidaId);
    if (!partida) return res.status(404).json({ success: false, message: 'Partida não encontrada' });
    if (partida.encerrada) return res.status(400).json({ success: false, message: 'Partida encerrada' });

    if (partida.gols) {
      partida.gols = partida.gols.map(gol => {
        if (gol.jogador === oldName) return { ...gol, jogador: newName };
        return gol;
      });
      partida.markModified('gols');
      await partida.save();
    }

    res.json({ success: true, data: partida });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao editar gol' });
  }
});

// PATCH - Editar um cartão por índice
router.patch('/:partidaId/evento/:tipo/:index', async (req, res) => {
  try {
    const { partidaId, tipo, index } = req.params;
    const { novoNome } = req.body;
    const idx = parseInt(index);

    const partida = await Partida.findById(partidaId);
    if (!partida) return res.status(404).json({ success: false, message: 'Partida não encontrada' });
    if (partida.encerrada) return res.status(400).json({ success: false, message: 'Partida encerrada' });

    const fieldMap = { 'amarelo': 'cartoesAmarelos', 'vermelho': 'cartoesVermelhos', 'azul': 'cartoesAzuis' };
    const field = fieldMap[tipo];

    if (field && partida[field] && partida[field][idx] !== undefined) {
      partida[field][idx] = novoNome;
      partida.markModified(field);
      await partida.save();
    } else {
      return res.status(400).json({ success: false, message: 'Tipo ou índice inválido' });
    }

    res.json({ success: true, data: partida });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao editar cartão' });
  }
});

// DELETE - Remover um evento (Gol ou Cartão) por índice
router.delete('/:partidaId/evento/:tipo/:index', async (req, res) => {
  try {
    const { partidaId, tipo, index } = req.params;
    const idx = parseInt(index);

    const partida = await Partida.findById(partidaId);
    if (!partida) return res.status(404).json({ success: false, message: 'Partida não encontrada' });
    if (partida.encerrada) return res.status(400).json({ success: false, message: 'Partida encerrada' });

    if (tipo === 'gol') {
      if (partida.gols && partida.gols[idx] !== undefined) {
        partida.gols.splice(idx, 1);
        partida.markModified('gols');
      }
    } else {
      const fieldMap = { 'amarelo': 'cartoesAmarelos', 'vermelho': 'cartoesVermelhos', 'azul': 'cartoesAzuis' };
      const field = fieldMap[tipo];
      if (field && partida[field] && partida[field][idx] !== undefined) {
        partida[field].splice(idx, 1);
        partida.markModified(field);
      } else {
        return res.status(400).json({ success: false, message: 'Tipo ou índice inválido' });
      }
    }

    await partida.save();
    res.json({ success: true, data: partida });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao remover evento' });
  }
});

module.exports = router;
