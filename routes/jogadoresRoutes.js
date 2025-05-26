const express = require('express');
const router = express.Router();
const Jogador = require('../models/Jogador');

// Atualizar pagamento específico
router.put('/:id/pagamentos/:mesIndex', async (req, res) => {
  try {
    const { id, mesIndex } = req.params;
    const { pago, valor, dataPagamento } = req.body;
    const mes = parseInt(mesIndex);

    // Validação do índice do mês
    if (isNaN(mes) || mes < 0 || mes > 11) {
      return res.status(400).json({ 
        success: false,
        message: 'Índice do mês inválido (0-11)' 
      });
    }

    // Encontra o jogador
    const jogador = await Jogador.findById(id);
    if (!jogador) {
      return res.status(404).json({ 
        success: false,
        message: 'Jogador não encontrado' 
      });
    }

    // Atualiza o pagamento usando o método do modelo
    const jogadorAtualizado = await jogador.atualizarPagamento(
      mes,
      pago,
      valor,
      new Date(dataPagamento)
    );

    // Resposta de sucesso
    res.json({
      success: true,
      data: {
        _id: jogadorAtualizado._id,
        nome: jogadorAtualizado.nome,
        pagamentos: jogadorAtualizado.pagamentos,
        statusFinanceiro: jogadorAtualizado.statusFinanceiro
      }
    });

  } catch (error) {
    console.error('Erro ao atualizar pagamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar pagamento',
      error: error.message
    });
  }
});

module.exports = router;