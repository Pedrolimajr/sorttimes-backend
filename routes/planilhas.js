const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // Adicione esta linha
const Planilha = require('../models/Planilha');

// GET todas as planilhas
router.get('/', async (req, res) => {
  try {
    const planilhas = await Planilha.find().sort({ dataAtualizacao: -1 });
    res.json({ success: true, data: planilhas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET uma planilha específica
router.get('/:id', async (req, res) => {
  try {
    const planilha = await Planilha.findById(req.params.id);
    if (!planilha) {
      return res.status(404).json({ success: false, message: 'Planilha não encontrada' });
    }
    res.json({ success: true, data: planilha });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST criar nova planilha
router.post('/', async (req, res) => {
  try {
    console.log('Corpo da requisição:', req.body);
    
    const { titulo, subtitulo, tabela } = req.body;
    
    if (!titulo || typeof titulo !== 'string' || !titulo.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Título é obrigatório e deve ser um texto válido' 
      });
    }

    if (!tabela || !Array.isArray(tabela) || tabela.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'A tabela é obrigatória e deve ser um array não vazio' 
      });
    }

    const isValidTable = tabela.every(row => Array.isArray(row));
    if (!isValidTable) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cada linha da tabela deve ser um array' 
      });
    }

    const novaPlanilha = new Planilha({
      titulo: titulo.trim(),
      subtitulo: subtitulo ? subtitulo.trim() : '',
      tabela,
      dataCriacao: new Date(),
      dataAtualizacao: new Date()
    });

    const planilhaSalva = await novaPlanilha.save();
    res.status(201).json({ success: true, data: planilhaSalva });
    
  } catch (error) {
    console.error('Erro ao salvar planilha:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// PUT atualizar planilha
router.put('/:id', async (req, res) => {
  try {
    const { titulo, subtitulo, tabela } = req.body;
    
    if (!titulo || typeof titulo !== 'string' || titulo.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'O título é obrigatório e deve ser um texto válido' 
      });
    }

    if (!tabela || !Array.isArray(tabela)) {
      return res.status(400).json({ 
        success: false, 
        message: 'A tabela é obrigatória e deve ser um array' 
      });
    }
  
    const isTableValid = tabela.every(row => Array.isArray(row));
    if (!isTableValid) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cada linha da tabela deve ser um array' 
      });
    }

    const updateData = {
      titulo: titulo.trim(),
      subtitulo: subtitulo ? subtitulo.trim() : '',
      tabela,
      dataAtualizacao: new Date()
    };

    const planilhaAtualizada = await Planilha.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!planilhaAtualizada) {
      return res.status(404).json({ success: false, message: 'Planilha não encontrada' });
    }

    res.json({ 
      success: true, 
      data: planilhaAtualizada,
      message: 'Planilha atualizada com sucesso' 
    });
    
  } catch (error) {
    console.error('Erro ao atualizar planilha:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        message: Object.values(error.errors).map(e => e.message).join(', ')
      });
    }
    
    res.status(500).json({ success: false, message: 'Erro interno ao atualizar a planilha' });
  }
});

// DELETE excluir planilha (ROTA CORRIGIDA - MOVIDA PARA FORA DO POST)
router.delete('/:id', async (req, res) => {
  console.log(`[DELETE] Tentando excluir ID: ${req.params.id}`);
  
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      success: false,
      error: 'ID_INVALID_FORMAT',
      message: 'O ID fornecido não está no formato correto'
    });
  }

  try {
    const result = await Planilha.deleteOne({ _id: req.params.id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Nenhuma planilha encontrada com este ID'
      });
    }

    res.json({
      success: true,
      deletedId: req.params.id,
      message: 'Planilha excluída com sucesso'
    });

  } catch (error) {
    console.error('Erro na exclusão:', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao processar a exclusão'
    });
  }
});

module.exports = router;