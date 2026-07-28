// routes/sorteioTimes.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Jogador = require('../models/Jogador');
const mongoose = require('mongoose');

// Definição do modelo Sorteio diretamente aqui para resolver o erro de módulo não encontrado
// sem a necessidade de criar arquivos externos, garantindo compatibilidade no Render.
const SorteioSchema = new mongoose.Schema({
  times: { type: Array, required: true },
  jogadoresPresentes: { type: Number, required: true },
  balanceamento: { type: String, required: true },
  posicaoUnica: { type: String },
  data: { type: Date, default: Date.now },
  // Vínculo opcional com partida para auditoria
  partidaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partida' }
}, { timestamps: true });

const Sorteio = mongoose.models.Sorteio || mongoose.model('Sorteio', SorteioSchema);

const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

// Configurações do Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'jogadores',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }]
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Constantes para tipos de balanceamento e posições
const BALANCEAMENTOS = {
  ALEATORIO: 'aleatorio',
  NIVEL: 'nivel',
  POSICAO: 'posicao',
  MISTO: 'misto'
};

const POSICOES = {
  GOLEIRO: 'Goleiro',
  ZAGUEIRO: 'Defensor',
  LATERAL_DIREITO: 'Lateral-Direito',
  LATERAL_ESQUERDO: 'Lateral-Esquerdo',
  VOLANTE: 'Volante',
  MEIA_DIREITA: 'Meia-Direita',
  MEIA_ESQUERDA: 'Meia-Esquerda',
  ATACANTE: 'Centroavante'
};

const POSICOES_ESPECIAIS = [POSICOES.GOLEIRO]; // Posições que requerem tratamento especial

// Função para converter nível textual para valor numérico
const converterNivelParaNumero = (nivel) => {
  return nivel === 'Associado' ? 3 : 
         nivel === 'Convidado' ? 2 : 
         1; // Iniciante ou padrão
};

// Funções de distribuição
function distribuirAleatoriamente(jogadores, quantidadeTimes) {
  const times = Array.from({ length: quantidadeTimes }, () => []);
  const jogadoresEmbaralhados = [...jogadores].sort(() => Math.random() - 0.5);
  
  jogadoresEmbaralhados.forEach((jogador, index) => {
    times[index % quantidadeTimes].push(jogador);
  });
  
  return times;
}

function distribuirPorNivel(jogadores, quantidadeTimes) {
  const times = Array.from({ length: quantidadeTimes }, () => []);
  // Ordena por nível numérico decrescente
  const jogadoresOrdenados = [...jogadores].sort((a, b) => 
    converterNivelParaNumero(b.nivel) - converterNivelParaNumero(a.nivel)
  );
  
  jogadoresOrdenados.forEach((jogador, index) => {
    const timeIndex = index % quantidadeTimes;
    times[timeIndex].push(jogador);
  });
  
  return times;
}

function distribuirPorPosicao(jogadores, quantidadeTimes, posicoesEspecificas = {}) {
  const times = Array.from({ length: quantidadeTimes }, () => []);
  
  // 1. Tratamento especial para posições específicas (como goleiros)
  POSICOES_ESPECIAIS.forEach(posicaoEspecial => {
    const jogadoresEspeciais = jogadores.filter(j => j.posicao === posicaoEspecial);
    const quantidadeRequerida = posicoesEspecificas[posicaoEspecial] || 1;
    
    // Distribui igualmente entre os times
    jogadoresEspeciais.forEach((jogador, index) => {
      const timeIndex = index % quantidadeTimes;
      if (times[timeIndex].filter(j => j.posicao === posicaoEspecial).length < quantidadeRequerida) {
        times[timeIndex].push(jogador);
      }
    });
  });
  
  // 2. Filtra jogadores que já foram alocados
  const jogadoresAlocados = times.flat();
  const jogadoresRestantes = jogadores.filter(j => !jogadoresAlocados.includes(j));
  
  // 3. Agrupa por posição e distribui o restante
  const posicoesAgrupadas = {};
  jogadoresRestantes.forEach(jogador => {
    if (!posicoesAgrupadas[jogador.posicao]) {
      posicoesAgrupadas[jogador.posicao] = [];
    }
    posicoesAgrupadas[jogador.posicao].push(jogador);
  });
  
  Object.values(posicoesAgrupadas).forEach(jogadoresPosicao => {
    jogadoresPosicao.forEach((jogador, index) => {
      const timeIndex = index % quantidadeTimes;
      times[timeIndex].push(jogador);
    });
  });
  
  return times;
}

function distribuirMisto(jogadores, quantidadeTimes, posicoesEspecificas = {}) {
  // Primeiro distribui por posição
  let times = distribuirPorPosicao(jogadores, quantidadeTimes, posicoesEspecificas);
  
  // Depois balanceia por nível dentro de cada time
  return times.map(time => {
    return time.sort((a, b) => converterNivelParaNumero(b.nivel) - converterNivelParaNumero(a.nivel));
  });
}

// Middleware para validar ObjectId
const validateObjectId = (req, res, next) => {
  if (!req.params.id || !req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ 
      success: false,
      message: 'ID inválido'
    });
  }
  next();
};

// Todas as rotas abaixo exigem autenticação
router.use(auth);

// Rota GET /api/sorteio-times/historico - Retorna os últimos 5 sorteios
router.get('/historico', async (req, res) => {
  try {
    const historico = await Sorteio.find()
      .sort({ data: -1 })
      .limit(5);
    res.json({ success: true, data: historico });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao buscar histórico' });
  }
});

// Rota POST /api/sorteio-times/historico - Salva um novo sorteio
router.post('/historico', async (req, res) => {
  try {
    const { times, jogadoresPresentes, balanceamento, posicaoUnica, data, partidaVinculadaId } = req.body;
    const novoSorteio = new Sorteio({
      times,
      jogadoresPresentes,
      balanceamento,
      posicaoUnica,
      data: data || new Date(),
      partidaId: partidaVinculadaId || null
    });
    await novoSorteio.save();
    res.status(201).json({ success: true, data: novoSorteio });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao salvar no histórico' });
  }
});

// Rota PUT /api/sorteio-times/historico/:id - Atualiza um sorteio específico no histórico
router.put('/historico/:id', validateObjectId, async (req, res) => {
  try {
    const { times, jogadoresPresentes, partidaId } = req.body;
    const sorteio = await Sorteio.findByIdAndUpdate(
      req.params.id,
      { times, jogadoresPresentes, partidaId },
      { new: true }
    );
    if (!sorteio) return res.status(404).json({ success: false, message: 'Sorteio não encontrado' });
    res.json({ success: true, data: sorteio });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao atualizar histórico' });
  }
});

// Rota DELETE /api/sorteio-times/historico/:id - Remove um item específico
router.delete('/historico/:id', async (req, res) => {
  try {
    await Sorteio.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Sorteio removido do histórico' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao remover sorteio' });
  }
});

// Rota DELETE /api/sorteio-times/historico - Limpa todo o histórico
router.delete('/historico', async (req, res) => {
  try {
    await Sorteio.deleteMany({});
    res.json({ success: true, message: 'Histórico limpo com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao limpar histórico' });
  }
});

// Rota POST /api/sorteio-times/sortear
router.post('/sortear', async (req, res) => {
  try {
    const { 
      jogadoresIds, 
      quantidadeTimes = 2, 
      balanceamento = BALANCEAMENTOS.ALEATORIO,
      posicoes = {}, // Posições modificadas para jogadores específicos
      posicaoUnica = null, // Nova propriedade para posição única para todos
      posicoesEspecificas = {}, // Ex: { 'Goleiro': 1 } - 1 goleiro por time
      jogadoresPorTime = 7 
    } = req.body;
    
    // Validação básica
    if (!jogadoresIds || !Array.isArray(jogadoresIds)) {
      return res.status(400).json({
        success: false,
        message: 'Lista de jogadores é obrigatória'
      });
    }

    // Busca jogadores no banco de dados
    const jogadores = await Jogador.find({ 
      _id: { $in: jogadoresIds } 
    }).select('nome posicao nivel');

    if (jogadores.length < quantidadeTimes) {
      return res.status(400).json({
        success: false,
        message: `Número insuficiente de jogadores para ${quantidadeTimes} times`
      });
    }

    // Aplica posição única (se fornecida) ou posições individuais
    const jogadoresComPosicoesAtualizadas = jogadores.map(jogador => {
      const jogadorObj = jogador.toObject();
      return {
        ...jogadorObj,
        // Aplica posição única se existir, senão usa posição individual, senão usa a original
        posicao: posicaoUnica || posicoes[jogador._id.toString()] || jogadorObj.posicao
      };
    });

    // Calcula quantidade de times baseado em jogadores por time
    const qtdTimesCalculada = Math.ceil(jogadoresComPosicoesAtualizadas.length / jogadoresPorTime) || quantidadeTimes;

    // Distribui os jogadores nos times conforme o tipo de balanceamento
    let times;
    switch (balanceamento) {
      case BALANCEAMENTOS.POSICAO:
        times = distribuirPorPosicao(jogadoresComPosicoesAtualizadas, qtdTimesCalculada, posicoesEspecificas);
        break;
      case BALANCEAMENTOS.NIVEL:
        times = distribuirPorNivel(jogadoresComPosicoesAtualizadas, qtdTimesCalculada);
        break;
      case BALANCEAMENTOS.MISTO:
        times = distribuirMisto(jogadoresComPosicoesAtualizadas, qtdTimesCalculada, posicoesEspecificas);
        break;
      default:
        times = distribuirAleatoriamente(jogadoresComPosicoesAtualizadas, qtdTimesCalculada);
    }

    // Calcula estatísticas dos times
    const timesComInfo = times.map((time, index) => {
      const nivelTotal = time.reduce((sum, jogador) => sum + converterNivelParaNumero(jogador.nivel), 0);
      return {
        nome: `Time ${index + 1}`,
        jogadores: time,
        nivelMedio: (nivelTotal / time.length).toFixed(2),
        quantidade: time.length
      };
    });

    res.json({
      success: true,
      data: {
        times: timesComInfo,
        balanceamento,
        totalJogadores: jogadores.length,
        jogadoresPorTime,
        quantidadeTimes: qtdTimesCalculada,
        posicaoUnicaAplicada: posicaoUnica // Retorna a posição única aplicada
      }
    });
  
  } catch (error) {
    console.error('Erro no sorteio:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao sortear times'
    });
  }
});

// Rotas PUT e DELETE
router.put('/:id', validateObjectId, upload.single('foto'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const file = req.file;

    const jogadorExistente = await Jogador.findById(id);
    if (!jogadorExistente) {
      return res.status(404).json({
        success: false,
        message: 'Jogador não encontrado'
      });
    }

    if (file) {
      if (jogadorExistente.foto) {
        const publicId = jogadorExistente.foto.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`jogadores/${publicId}`);
      }
      updates.foto = file.path;
    }

    const jogadorAtualizado = await Jogador.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).select('-__v');

    res.json({
      success: true,
      message: 'Jogador atualizado com sucesso',
      data: jogadorAtualizado
    });

  } catch (error) {
    console.error('Erro ao atualizar:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao atualizar jogador'
    });
  }
});

router.delete('/:id', validateObjectId, async (req, res) => {
  try {
    const jogador = await Jogador.findById(req.params.id);
    
    if (!jogador) {
      return res.status(404).json({
        success: false,
        message: 'Jogador não encontrado'
      });
    }

    if (jogador.foto) {
      const publicId = jogador.foto.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`jogadores/${publicId}`);
    }

    await jogador.deleteOne();

    res.json({
      success: true,
      message: 'Jogador removido com sucesso',
      data: { id: req.params.id }
    });

  } catch (error) {
    console.error('Erro ao excluir:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erro ao remover jogador'
    });
  }
});

module.exports = router;