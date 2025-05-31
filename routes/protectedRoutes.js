const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Partida = require('../models/Partida');
const Jogador = require('../models/Jogador');
const Transacao = require('../models/Transacao');

// Rotas do Dashboard
router.get('/dashboard', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-senha');
    
    // Estatísticas para o dashboard
    const totalJogadores = await Jogador.countDocuments();
    const totalPartidas = await Partida.countDocuments();
    const proximasPartidas = await Partida.find({
      data: { $gte: new Date() }
    }).sort({ data: 1 }).limit(3);
    
    // Últimas transações financeiras
    const ultimasTransacoes = await Transacao.find()
      .sort({ data: -1 })
      .limit(5)
      .populate('jogador', 'nome');
    
    res.json({
      success: true,
      user,
      dashboardData: {
        totalJogadores,
        totalPartidas,
        proximasPartidas,
        ultimasTransacoes
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Rotas de Jogadores
router.get('/lista-jogadores', auth, async (req, res) => {
  try {
    const jogadores = await Jogador.find().sort({ nome: 1 });
    res.json({
      success: true,
      jogadores
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/cadastro-jogadores', auth, async (req, res) => {
  try {
    const { nome, email, telefone, posicao } = req.body;
    
    const novoJogador = new Jogador({
      nome,
      email,
      telefone,
      posicao,
      criadoPor: req.user.id
    });

    await novoJogador.save();
    
    res.status(201).json({
      success: true,
      jogador: novoJogador
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rotas de Partidas
router.get('/partidas-agendadas', auth, async (req, res) => {
  try {
    const partidas = await Partida.find()
      .sort({ data: 1 })
      .populate('jogadores', 'nome');
    
    res.json({
      success: true,
      partidas
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/agendar-partida', auth, async (req, res) => {
  try {
    const { local, data, hora, adversario, jogadores } = req.body;
    
    const novaPartida = new Partida({
      local,
      data,
      hora,
      adversario,
      jogadores,
      agendadoPor: req.user.id
    });

    await novaPartida.save();
    
    res.status(201).json({
      success: true,
      partida: novaPartida
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/informacoes-partida/:id', auth, async (req, res) => {
  try {
    const partida = await Partida.findById(req.params.id)
      .populate('jogadores', 'nome presente')
      .populate('time1.jogadores', 'nome')
      .populate('time2.jogadores', 'nome');
    
    if (!partida) {
      return res.status(404).json({
        success: false,
        message: 'Partida não encontrada'
      });
    }
    
    res.json({
      success: true,
      partida
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rota de Sorteio de Times
router.post('/sorteio-times', auth, async (req, res) => {
  try {
    const { partidaId, criterio } = req.body;
    
    const partida = await Partida.findById(partidaId).populate('jogadores', 'nome habilidade posicao');
    
    if (!partida) {
      return res.status(404).json({
        success: false,
        message: 'Partida não encontrada'
      });
    }
    
    // Lógica básica de sorteio (pode ser aprimorada)
    const jogadores = partida.jogadores;
    const shuffled = [...jogadores].sort(() => 0.5 - Math.random());
    
    const time1 = shuffled.slice(0, Math.ceil(shuffled.length / 2));
    const time2 = shuffled.slice(Math.ceil(shuffled.length / 2));
    
    partida.time1 = { jogadores: time1.map(j => j._id) };
    partida.time2 = { jogadores: time2.map(j => j._id) };
    partida.sorteioRealizado = true;
    
    await partida.save();
    
    res.json({
      success: true,
      partida: {
        time1,
        time2
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rotas Financeiras
router.get('/financeiro', auth, async (req, res) => {
  try {
    const transacoes = await Transacao.find()
      .sort({ data: -1 })
      .populate('jogador', 'nome');
    
    const saldo = await Transacao.aggregate([
      {
        $group: {
          _id: null,
          receitas: { $sum: { $cond: [{ $eq: ["$tipo", "receita"] }, "$valor", 0] } },
          despesas: { $sum: { $cond: [{ $eq: ["$tipo", "despesa"] }, "$valor", 0] } }
        }
      }
    ]);
    
    res.json({
      success: true,
      transacoes,
      saldo: saldo[0] || { receitas: 0, despesas: 0 }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/financeiro', auth, async (req, res) => {
  try {
    const { tipo, valor, descricao, jogadorId } = req.body;
    
    const novaTransacao = new Transacao({
      tipo,
      valor,
      descricao,
      jogador: jogadorId,
      registradoPor: req.user.id
    });

    await novaTransacao.save();
    
    res.status(201).json({
      success: true,
      transacao: novaTransacao
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Rotas de Configurações da Conta
router.get('/configuracoes', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-senha');
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.put('/configuracoes', auth, async (req, res) => {
  try {
    const { nome, email, senhaAtual, novaSenha } = req.body;
    
    const user = await User.findById(req.user.id);
    
    if (nome) user.nome = nome;
    if (email) user.email = email;
    
    if (novaSenha) {
      const isMatch = await bcrypt.compare(senhaAtual, user.senha);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Senha atual incorreta'
        });
      }
      
      const salt = await bcrypt.genSalt(10);
      user.senha = await bcrypt.hash(novaSenha, salt);
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Configurações atualizadas com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;