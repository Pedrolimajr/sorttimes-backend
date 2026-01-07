const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const Planilha = require('../models/Planilha');
// Middleware para headers CORS
router.use((req, res, next) => {
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Todas as rotas abaixo exigem autenticação
router.use(auth);

// GET todas as planilhas
router.get('/', async (req, res) => {
  try {
    const planilhas = await Planilha.find().sort({ dataAtualizacao: -1 });
    res.status(200).json({
      status: 'success',
      data: planilhas
    });
  } catch (error) {
    console.error('Erro ao buscar planilhas:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erro ao buscar planilhas'
    });
  }
});


// POST criar nova planilha (ATUALIZADO)
router.post('/', async (req, res) => {
  try {
    const { titulo, subtitulo, tabela } = req.body;
    
    // Validação reforçada
    if (!titulo || !titulo.trim()) {
      return res.status(400).json({
        status: 'error',
        code: 'MISSING_TITLE',
        message: 'Título é obrigatório'
      });
    }

    const novaPlanilha = new Planilha({
      titulo: titulo.trim(),
      subtitulo: subtitulo?.trim() || '',
      tabela: tabela || [['Cabeçalho', 'Valor'], ['', '']],
      dataCriacao: new Date(),
      dataAtualizacao: new Date()
    });

    const planilhaSalva = await novaPlanilha.save();
    
    res.status(201).json({
      status: 'success',
      data: {
        _id: planilhaSalva._id,
        titulo: planilhaSalva.titulo,
        subtitulo: planilhaSalva.subtitulo,
        tabela: planilhaSalva.tabela,
        dataAtualizacao: planilhaSalva.dataAtualizacao
      }
    });

  } catch (error) {
    console.error('Erro ao criar planilha:', error);
    res.status(400).json({
      status: 'error',
      code: 'CREATION_FAILED',
      message: 'Falha ao criar planilha'
    });
  }
});

// PUT atualizar planilha (ATUALIZADO)
router.put('/:id', async (req, res) => {
  try {
    // Validação de ID
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_ID',
        message: 'ID inválido'
      });
    }

    const { titulo, subtitulo, tabela } = req.body;
    
    const updateData = {
      titulo: titulo?.trim(),
      subtitulo: subtitulo?.trim() || '',
      tabela: tabela || [['Cabeçalho', 'Valor'], ['', '']],
      dataAtualizacao: new Date()
    };

    const planilhaAtualizada = await Planilha.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!planilhaAtualizada) {
      return res.status(404).json({
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Planilha não encontrada'
      });
    }

    res.json({
      status: 'success',
      data: planilhaAtualizada
    });

  } catch (error) {
    console.error('Erro ao atualizar:', error);
    res.status(500).json({
      status: 'error',
      code: 'UPDATE_FAILED',
      message: 'Falha na atualização'
    });
  }
});

// DELETE excluir planilha
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validação de ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_ID',
        message: 'ID inválido'
      });
    }

    const planilha = await Planilha.findByIdAndDelete(id);

    if (!planilha) {
      return res.status(404).json({
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Planilha não encontrada'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Planilha excluída com sucesso',
      data: planilha
    });
  } catch (error) {
    console.error('Erro ao excluir planilha:', error);
    res.status(500).json({
      status: 'error',
      code: 'DELETE_FAILED',
      message: 'Falha ao excluir planilha'
    });
  }
});


module.exports = router;