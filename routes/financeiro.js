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
          data: {
            $gte: new Date(`${year}-01-01T00:00:00.000Z`),
            $lt: new Date(`${parseInt(year) + 1}-01-01T00:00:00.000Z`)
          }
        }
      },
      { $group: { _id: null, total: { $sum: '$valor' } } }
    ]);

    const despesas = await Transacao.aggregate([
      {
        $match: {
          tipo: 'despesa',
          data: {
            $gte: new Date(`${year}-01-01T00:00:00.000Z`),
            $lt: new Date(`${parseInt(year) + 1}-01-01T00:00:00.000Z`)
          }
        }
      },
      { $group: { _id: null, total: { $sum: '$valor' } } }
    ]);

    
    // Calcula pagamentos pendentes
 const jogadores = await Jogador.find({});
    const pagamentosPendentes = jogadores.reduce((total, jogador) => {
      const mesAtual = new Date().getMonth(); // 0 para Jan, 11 para Dez
      return total + jogador.pagamentos.filter((p, index) =>
        index <= mesAtual && !p.pago && !p.isento
      ).length;
    }, 0);
    
    // Calcula o saldo
    const totalReceitas = receitas.length > 0 ? receitas[0].total : 0;
    const totalDespesas = despesas.length > 0 ? despesas[0].total : 0;
    const saldo = totalReceitas - totalDespesas;

    res.json({
      success: true,
      data: {
        totalReceitas,
        totalDespesas,
        saldo,
        pagamentosPendentes
      }
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas financeiras:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar estatísticas financeiras' });
  }
});

// Rota GET - Transações por mês
router.get('/transacoes', async (req, res) => {
  try {
    const { mes, tipo, categoria, jogadorId } = req.query;
    let query = {};

    if (mes) {
      const [year, month] = mes.split('-');
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Último dia do mês
      query.data = { $gte: startDate, $lte: endDate };
    }

    if (tipo) {
      query.tipo = tipo;
    }

    if (categoria) {
      query.categoria = categoria;
    }

    if (jogadorId) {
      query.jogadorId = jogadorId;
    }

    const transacoes = await Transacao.find(query).sort({ data: -1 });
    res.json({ success: true, data: transacoes });
  } catch (error) {
    console.error('Erro ao buscar transações:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar transações' });
  }
});


// Rotas para transações
router.post('/transacoes', async (req, res) => {
  try {
    const { descricao, valor, tipo, categoria, data, jogadorId, jogadorNome, isento } = req.body;

    // Ajuste da data para lidar com fusos horários
    const dataCorrigida = new Date(data);
    dataCorrigida.setMinutes(dataCorrigida.getMinutes() + dataCorrigida.getTimezoneOffset());

    // Cria objeto de transação
    const transacaoData = {
      descricao,
      valor: parseFloat(valor),
      tipo,
      categoria: categoria || (tipo === 'receita' ? 'mensalidade' : 'outros'), // Categoria padrão
      data: dataCorrigida,
      isento: isento || false // Define isento
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
    console.error('Erro ao adicionar transação:', error);
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
    console.error('Erro ao remover transação:', error);
    res.status(500).json({ success: false, message: 'Erro ao remover transação' });
  }
});

module.exports = router;

