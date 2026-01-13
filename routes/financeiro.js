// @ts-nocheck
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Jogador = require('../models/Jogador');
const Transacao = require('../models/Transacao'); // Você precisará criar este modelo
const mongoose = require('mongoose');

// Helper de data para fuso America/Sao_Paulo (robusto)
const getNowInSaoPaulo = () => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const get = (type) => {
    const part = parts.find(p => p.type === type);
    const value = part && part.value ? String(part.value) : '';
    return value ? value.padStart(2, '0') : '00';
  };

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  // Construímos string ISO local (ex.: 2026-01-13T15:04:05) e criamos Date
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
};

// Todas as rotas abaixo exigem autenticação
router.use(auth);

// Rota GET - Estatísticas financeiras
router.get('/estatisticas', async (req, res) => {
  try {
    const { mes } = req.query;
    const year = mes ? mes.split('-')[0] : getNowInSaoPaulo().getFullYear();
    
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
      const mesAtual = getNowInSaoPaulo().getMonth(); // 0 para Jan, 11 para Dez
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
    res.status(500).json({ success: false, message: process.env.NODE_ENV === 'production' ? 'Erro ao buscar estatísticas financeiras' : (error.message || 'Erro ao buscar estatísticas financeiras'), ...(process.env.NODE_ENV !== 'production' ? { stack: error.stack } : {}) });
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

    const transacoesRaw = await Transacao.find(query).sort({ data: -1 });

    // Normaliza e corrige transações com campos de data inválidos para evitar erros no cliente
    const transacoes = transacoesRaw.map(t => t.toObject ? t.toObject() : t);
    const toFix = [];

    transacoes.forEach(tr => {
      let needsFix = false;

      // Valida 'data'
      if (!tr.data || isNaN(new Date(tr.data).getTime())) {
        tr.data = new Date().toISOString();
        needsFix = true;
      } else {
        tr.data = new Date(tr.data).toISOString();
      }

      // Valida 'createdAt'
      if (!tr.createdAt || isNaN(new Date(tr.createdAt).getTime())) {
        tr.createdAt = new Date().toISOString();
        needsFix = true;
      } else {
        tr.createdAt = new Date(tr.createdAt).toISOString();
      }

      if (needsFix) {
        toFix.push({ id: tr._id, data: tr.data, createdAt: tr.createdAt });
      }
    });

    if (toFix.length > 0) {
      console.warn('Corrigindo transações com datas inválidas:', toFix.map(f => f.id));
      // Atualiza os documentos no banco para evitar reocorrência do problema
      await Promise.all(toFix.map(f => Transacao.updateOne({ _id: f.id }, { $set: { data: new Date(f.data), createdAt: new Date(f.createdAt) } })));
    }

    res.json({ success: true, data: transacoes });
  } catch (error) {
    console.error('Erro ao buscar transações:', error);
    res.status(500).json({ success: false, message: process.env.NODE_ENV === 'production' ? 'Erro ao buscar transações' : (error.message || 'Erro ao buscar transações'), ...(process.env.NODE_ENV !== 'production' ? { stack: error.stack } : {}) });
  }
});

// Endpoint administrativo para corrigir todas as transações com `createdAt` ou `data` inválidos
router.post('/transacoes/fix-dates', async (req, res) => {
  try {
    // Permitir execução apenas em ambiente de desenvolvimento (ou com token admin se desejar)
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Não permitido em produção' });
    }

    const transacoes = await Transacao.find();
    const toFix = [];

    transacoes.forEach(t => {
      const obj = t.toObject ? t.toObject() : t;
      let fixNeeded = false;
      const updates = {};

      if (!obj.data || isNaN(new Date(obj.data).getTime())) {
        updates.data = new Date();
        fixNeeded = true;
      }
      if (!obj.createdAt || isNaN(new Date(obj.createdAt).getTime())) {
        updates.createdAt = new Date();
        fixNeeded = true;
      }

      if (fixNeeded) {
        toFix.push({ id: obj._id, updates });
      }
    });

    await Promise.all(toFix.map(f => Transacao.updateOne({ _id: f.id }, { $set: f.updates })));

    res.json({ success: true, fixed: toFix.length });
  } catch (error) {
    console.error('Erro ao rodar fix-dates:', error);
    res.status(500).json({ success: false, message: error.message || 'Erro ao corrigir datas' });
  }
});


// Rotas para transações
router.post('/transacoes', async (req, res) => {
  try {
    console.log('POST /transacoes recebendo payload:', JSON.stringify(req.body));

    const { descricao, valor, tipo, categoria, data, jogadorId, jogadorNome, isento } = req.body;

    // Validações simples para evitar 500s por payload inválido
    if (!descricao || typeof descricao !== 'string' || !descricao.trim()) {
      return res.status(400).json({ success: false, message: 'Descrição é obrigatória' });
    }

    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum < 0) {
      return res.status(400).json({ success: false, message: 'Valor inválido' });
    }

    if (!tipo || (tipo !== 'receita' && tipo !== 'despesa')) {
      return res.status(400).json({ success: false, message: 'Tipo inválido' });
    }

    if (!data || isNaN(Date.parse(data))) {
      return res.status(400).json({ success: false, message: 'Data inválida' });
    }

    if (jogadorId && !mongoose.Types.ObjectId.isValid(jogadorId)) {
      return res.status(400).json({ success: false, message: 'jogadorId inválido' });
    }

    // Se for receita e houver jogadorId, verifique se o jogador existe
    if (tipo === 'receita' && jogadorId) {
      const jogador = await Jogador.findById(jogadorId);
      if (!jogador) {
        return res.status(404).json({ success: false, message: 'Jogador não encontrado' });
      }
    }

    // Remover campos sensíveis/enviados indevidamente pelo cliente (ex.: createdAt inválido)
    if (req.body.createdAt) delete req.body.createdAt;
    if (req.body.updatedAt) delete req.body.updatedAt;

    // A data já deve vir normalizada do frontend (meio-dia em America/Sao_Paulo)
    const dataCorrigida = new Date(data);

    // Forçar createdAt no servidor com horário de São Paulo para evitar 'Invalid Date'
    const createdAtNow = getNowInSaoPaulo();

    // Cria objeto de transação. Não confie em qualquer createdAt vindo do client
    const transacaoData = {
      descricao: descricao.trim(),
      valor: valorNum,
      tipo,
      categoria: categoria || (tipo === 'receita' ? 'mensalidade' : 'outros'), // Categoria padrão
      data: dataCorrigida,
      isento: Boolean(isento),
      createdAt: createdAtNow
    };

    // Apenas adiciona jogadorId e jogadorNome se existirem e for receita
    if (tipo === 'receita' && jogadorId) {
      transacaoData.jogadorId = jogadorId;
      transacaoData.jogadorNome = jogadorNome;
    }

    console.log('Criando transacao com dados (após validação):', JSON.stringify({ ...transacaoData, data: transacaoData.data.toISOString(), createdAt: transacaoData.createdAt.toISOString() }));

    const novaTransacao = new Transacao(transacaoData);
    try {
      await novaTransacao.save();
    } catch (saveError) {
      console.error('Erro no save da transacao:', saveError);
      // se for validation error, propague detalhadamente
      if (saveError && saveError.name === 'ValidationError') {
        return res.status(400).json({ success: false, message: saveError.message, details: saveError.errors });
      }
      throw saveError;
    }

    res.status(201).json({
      success: true,
      data: novaTransacao
    });
  } catch (error) {
    console.error('Erro ao adicionar transação:', error);
    // Retorna detalhes de validação/erro quando possível (evita 500 genérico sem contexto)
    if (error && error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message, details: error.errors });
    }
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Erro ao adicionar transação' : (error.message || 'Erro ao adicionar transação'),
      ...(process.env.NODE_ENV !== 'production' ? { stack: error.stack } : {})
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
    res.status(500).json({ success: false, message: process.env.NODE_ENV === 'production' ? 'Erro ao remover transação' : (error.message || 'Erro ao remover transação'), ...(process.env.NODE_ENV !== 'production' ? { stack: error.stack } : {}) });
  }
});

module.exports = router;

