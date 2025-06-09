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
    const { descricao, valor, tipo, categoria, data, jogadorId, jogadorNome } = req.body;
    
    if (!descricao || !valor || !tipo || !data) {
      return res.status(400).json({ 
        success: false,
        message: 'Campos obrigatórios faltando' 
      });
    }

    // Corrige o problema da data
    const dataCorrigida = new Date(data);
    dataCorrigida.setMinutes(dataCorrigida.getMinutes() + dataCorrigida.getTimezoneOffset());

    // Cria objeto de transação
    const transacaoData = {
      descricao,
      valor: parseFloat(valor),
      tipo,
      categoria: categoria || (tipo === 'receita' ? 'outros' : 'outros'), // Alterado para 'outros' como padrão
      data: dataCorrigida
    };

    // Apenas adiciona jogadorId e jogadorNome se existirem e for receita
    if (tipo === 'receita' && jogadorId) {
      transacaoData.jogadorId = jogadorId;
      transacaoData.jogadorNome = jogadorNome;
    }

    const novaTransacao = new Transacao(transacaoData);
    await novaTransacao.save();
    
    res.status(201).json({
      success: true,
      data: novaTransacao
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao adicionar transação'
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

