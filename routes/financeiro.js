const express = require('express');
const router = express.Router();
const Jogador = require('../models/Jogador');
const Transacao = require('../models/Transacao'); // Você precisará criar este modelo

// Rota GET - Estatísticas financeiras
router.get('/estatisticas', async (req, res) => {
  try {
    const { mes } = req.query;
    const year = mes ? mes.split('-')[0] : new Date().getFullYear();
    
    // Calcula totais de receitas (ignorando isenções) e despesas
    const receitas = await Transacao.aggregate([
      { 
        $match: { 
          tipo: 'receita',
          isento: { $ne: true }, // Ignora transações isentas
          data: { $regex: `^${year}` }
        } 
      },
      { $group: { _id: null, total: { $sum: '$valor' } } }
    ]);
    
    const despesas = await Transacao.aggregate([
      { 
        $match: { 
          tipo: 'despesa',
          data: { $regex: `^${year}` }
        } 
      },
      { $group: { _id: null, total: { $sum: '$valor' } } }
    ]);
    
    // Calcula pagamentos pendentes
    const jogadores = await Jogador.find({});
    const pagamentosPendentes = jogadores.reduce((total, jogador) => {
      return total + jogador.pagamentos.filter(p => !p).length;
    }, 0);
    
    res.json({
      totalReceitas: receitas[0]?.total || 0,
      totalDespesas: despesas[0]?.total || 0,
      saldo: (receitas[0]?.total || 0) - (despesas[0]?.total || 0),
      pagamentosPendentes,
      totalJogadores: jogadores.length
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao calcular estatísticas' });
  }
});

// Rota GET - Transações por mês
router.get('/transacoes', async (req, res) => {
  try {
    const { mes } = req.query;
    const query = mes ? { data: { $regex: `^${mes}` } } : {};
    
    const transacoes = await Transacao.find(query)
      .sort({ data: -1 })
      .lean();
    
    res.json(transacoes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao buscar transações' });
  }
});


// Rotas para transações
router.post('/transacoes', async (req, res) => {
  try {
    // 1. INCLUDE 'isento' in destructuring
    const { descricao, valor, tipo, categoria, data, jogadorId, jogadorNome, isento } = req.body;
    
    // --- CRUCIAL DEBUGGING STEP ---
    // Log the received body to verify all fields are present and correctly typed
    console.log('📝 Dados recebidos em /financeiro/transacoes:', { 
        descricao, valor, tipo, categoria, data, jogadorId, jogadorNome, isento 
    });

    // 2. Add more specific validation messages for debugging (temporarily)
    if (!descricao) {
      return res.status(400).json({ success: false, message: 'Campo "descricao" é obrigatório.' });
    }
    // 'valor' can be 0, so check for null or undefined, not just falsy
    if (valor === undefined || valor === null) { 
      return res.status(400).json({ success: false, message: 'Campo "valor" é obrigatório.' });
    }
    if (!tipo) {
      return res.status(400).json({ success: false, message: 'Campo "tipo" é obrigatório.' });
    }
    if (!data) { // Ensure data is present
      return res.status(400).json({ success: false, message: 'Campo "data" é obrigatório.' });
    }
    // Also validate 'tipo' against the enum values
    if (!['receita', 'despesa'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'O campo "tipo" deve ser "receita" ou "despesa".' });
    }


    // Corrige o problema da data (handling timezone offset is often a good idea)
    // Make sure 'data' is a valid date string before attempting to create a Date object
    let dataCorrigida;
    try {
        dataCorrigida = new Date(data);
        // Check if dataCorrigida is actually a valid Date object
        if (isNaN(dataCorrigida.getTime())) {
            throw new Error('Data inválida.');
        }
        dataCorrigida.setMinutes(dataCorrigida.getMinutes() + dataCorrigida.getTimezoneOffset());
    } catch (dateError) {
        return res.status(400).json({ success: false, message: 'Formato de data inválido.' });
    }


    // Cria objeto de transação
    const transacaoData = {
      descricao,
      valor: parseFloat(valor), // Ensure valor is a number
      tipo,
      categoria: categoria || (tipo === 'receita' ? 'mensalidade' : 'outros'), // Assuming 'mensalidade' as default for receita
      data: dataCorrigida,
      isento: isento // 3. PASS 'isento' to the Transacao object
    };

    // Apenas adiciona jogadorId e jogadorNome se existirem e for receita
    if (tipo === 'receita' && jogadorId) {
      transacaoData.jogadorId = jogadorId;
      transacaoData.jogadorNome = jogadorNome;
    }

    const novaTransacao = new Transacao(transacaoData);
    await novaTransacao.save();
    
    // Socket.IO event emission (if applicable to this finance route)
    // const io = req.app.get('io');
    // if (io) {
    //   // Emit a finance update event if you have a dashboard that needs real-time updates
    //   // You would need to re-calculate totals here or retrieve them.
    //   // io.emit('novaTransacao', novaTransacao); 
    // }

    res.status(201).json({
      success: true,
      message: 'Transação registrada com sucesso!', // Added success message
      data: novaTransacao
    });
  } catch (error) {
    // --- CRUCIAL DEBUGGING STEP ---
    // Log the FULL error object for backend errors
    console.error('❌ Erro no backend (financeiro.js /transacoes):', error);
    
    // Improve error messages for validation errors
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
            success: false,
            message: 'Erro de validação: ' + messages.join(', ')
        });
    }

    // Generic error handling
    res.status(500).json({
      success: false,
      message: error.message || 'Erro interno do servidor ao adicionar transação'
    });
  }
});

// Rota DELETE - Remover transação
// No seu arquivo de rotas do backend (financeiro.js)
router.delete('/transacoes/:id', async (req, res) => {
  try {
    const transacao = await Transacao.findByIdAndDelete(req.params.id);
    if (!transacao) {
      return res.status(404).json({ success: false, message: 'Transação não encontrada' });
    }
    res.json({ success: true, message: 'Transação removida com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao deletar transação' });
  }
});
module.exports = router;

