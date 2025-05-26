const express = require('express');
const router = express.Router();
const Jogador = require('../models/Jogador');
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

// Configuração do storage para multer usando Cloudinary
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
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Helper para tratamento de erros
const handleError = (res, error, defaultMessage = 'Erro no servidor') => {
  console.error(error);
  res.status(500).json({ 
    success: false,
    message: error.message || defaultMessage
  });
};

// Middleware para validar ObjectId
const validateObjectId = (req, res, next) => {
  if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ 
      success: false,
      message: 'ID inválido'
    });
  }
  next();
};

// Rota POST - Cadastrar novo jogador
router.post('/', upload.single('foto'), async (req, res) => {
  try {
    const { body, file } = req;
    
    // Validação dos campos obrigatórios
    const camposObrigatorios = ['nome', 'posicao', 'nivel'];
    const faltantes = camposObrigatorios.filter(campo => !body[campo]);
    
    if (faltantes.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Campos obrigatórios faltando: ${faltantes.join(', ')}`
      });
    }

    // Verifica se o email foi fornecido e não está vazio
    const email = body.email && body.email.trim() !== '' ? body.email : undefined;

    // Remove a validação obrigatória da foto
    const novoJogador = new Jogador({
      nome: body.nome,
      dataNascimento: body.dataNascimento || null,
      endereco: body.endereco || '',
      telefone: body.telefone || '',
      email: email, // Usa undefined se não houver email
      dataIngresso: body.dataIngresso || new Date(),
      posicao: body.posicao,
      numeroCamisa: body.numeroCamisa || null,
      nivel: body.nivel || 'Associado',
      foto: file ? file.path : '',
      statusFinanceiro: 'Inadimplente',
      pagamentos: Array(12).fill(false)
    });

    await novoJogador.save();

    res.status(201).json({
      success: true,
      message: 'Jogador cadastrado com sucesso!',
      data: novoJogador
    });

  } catch (error) {
    handleError(res, error, 'Erro ao cadastrar jogador');
  }
});

// Rota GET - Listar todos os jogadores com filtros
router.get('/', async (req, res) => {
  try {
    const { posicao, status, nome } = req.query;
    const filter = {};
    
    if (posicao) filter.posicao = posicao;
    if (status) filter.statusFinanceiro = status;
    if (nome) filter.nome = { $regex: nome, $options: 'i' };

    const jogadores = await Jogador.find(filter)
      .sort({ nome: 1 })
      .select('-__v -createdAt -updatedAt');

    res.json({
      success: true,
      count: jogadores.length,
      data: jogadores
    });
  } catch (error) {
    handleError(res, error, 'Erro ao buscar jogadores');
  }
});

// Rota GET - Obter um jogador específico
router.get('/:id', validateObjectId, async (req, res) => {
  try {
    const jogador = await Jogador.findById(req.params.id)
      .select('-__v -createdAt -updatedAt');
    
    if (!jogador) {
      return res.status(404).json({
        success: false,
        message: 'Jogador não encontrado'
      });
    }

    res.json({
      success: true,
      data: jogador
    });

  } catch (error) {
    handleError(res, error, 'Erro ao buscar jogador');
  }
});

// Rota PUT - Atualizar jogador (com suporte a imagem)
router.put('/:id', validateObjectId, upload.single('foto'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const file = req.file;

    // Verifica se o jogador existe
    const jogadorExistente = await Jogador.findById(id);
    if (!jogadorExistente) {
      return res.status(404).json({
        success: false,
        message: 'Jogador não encontrado'
      });
    }

    // Valida apenas os campos obrigatórios se eles estiverem sendo atualizados
    if (updates.nome === '' || updates.posicao === '' || updates.nivel === '') {
      return res.status(400).json({
        success: false,
        message: 'Nome, Posição e Nível não podem ficar vazios'
      });
    }

    // Se uma nova foto foi enviada, atualiza o caminho
    if (file) {
      updates.foto = file.path;
    }

    const jogadorAtualizado = await Jogador.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).select('-__v -createdAt -updatedAt');

    res.json({
      success: true,
      message: 'Jogador atualizado com sucesso',
      data: jogadorAtualizado
    });

  } catch (error) {
    handleError(res, error, 'Erro ao atualizar jogador');
  }
});

// Rota PUT - Atualizar status de pagamento mensal
router.put('/:id/pagamentos/:mes', async (req, res) => {
  try {
    const { id, mes } = req.params;
    const { pago, valor, dataPagamento } = req.body;

    const jogador = await Jogador.findById(id);
    if (!jogador) {
      return res.status(404).json({ message: 'Jogador não encontrado' });
    }

    // Garante que o array de pagamentos existe
    if (!jogador.pagamentos) {
      jogador.pagamentos = Array(12).fill(false);
    }

    // Atualiza o pagamento específico
    jogador.pagamentos[mes] = pago;

    // Atualiza o status financeiro
    const mesAtual = new Date().getMonth();
    const mesesDevendo = jogador.pagamentos
      .slice(0, mesAtual + 1)
      .filter(p => !p).length;

    jogador.statusFinanceiro = mesesDevendo === 0 ? 'Adimplente' : 'Inadimplente';

    await jogador.save();

    res.json(jogador);
  } catch (error) {
    console.error('Erro ao atualizar pagamento:', error);
    res.status(500).json({ message: 'Erro ao atualizar pagamento' });
  }
});

// Rota PATCH - Atualizar status financeiro
router.patch('/:id/status', validateObjectId, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status || !['Adimplente', 'Inadimplente'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status inválido'
      });
    }

    const jogador = await Jogador.findByIdAndUpdate(
      req.params.id,
      { statusFinanceiro: status },
      { new: true }
    ).select('-__v -createdAt -updatedAt');

    if (!jogador) {
      return res.status(404).json({
        success: false,
        message: 'Jogador não encontrado'
      });
    }

    res.json({
      success: true,
      message: `Status atualizado para ${status}`,
      data: jogador
    });

  } catch (error) {
    handleError(res, error, 'Erro ao atualizar status');
  }
});

// Rota DELETE - Remover jogador
router.delete('/:id', validateObjectId, async (req, res) => {
  try {
    const jogador = await Jogador.findById(req.params.id);
    
    if (!jogador) {
      return res.status(404).json({
        success: false,
        message: 'Jogador não encontrado'
      });
    }

    // Remove a imagem do Cloudinary se existir
    if (jogador.foto) {
      try {
        const publicId = jogador.foto.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`jogadores/${publicId}`);
      } catch (cloudinaryError) {
        console.error('Erro ao remover imagem do Cloudinary:', cloudinaryError);
      }
    }

    await jogador.deleteOne();

    res.json({
      success: true,
      message: 'Jogador removido com sucesso',
      data: { id: req.params.id }
    });

  } catch (error) {
    handleError(res, error, 'Erro ao remover jogador');
  }
});

// Rota POST - Sorteio de Times
router.post('/sortear-times', async (req, res) => {
  try {
    const { jogadoresIds, quantidadeTimes = 2, balanceamento = 'aleatorio' } = req.body;
    
    if (!jogadoresIds || !Array.isArray(jogadoresIds)) {
      return res.status(400).json({
        success: false,
        message: 'Lista de jogadores é obrigatória'
      });
    }

    // Busca os jogadores no banco de dados
    const jogadores = await Jogador.find({ 
      _id: { $in: jogadoresIds } 
    }).select('nome posicao nivel');

    if (jogadores.length < quantidadeTimes) {
      return res.status(400).json({
        success: false,
        message: `Número insuficiente de jogadores para ${quantidadeTimes} times`
      });
    }

    let times = Array.from({ length: quantidadeTimes }, () => []);

    // Balanceamento por posição
    if (balanceamento === "posicao") {
      const porPosicao = {};
      const POSICOES = [
        "Goleiro", "Defensor", "Lateral-Direito", "Lateral-Esquerdo", 
        "Volante", "Meia-Direita", "Meia-Esquerda", "Centroavante"
      ];
      
      POSICOES.forEach(pos => {
        porPosicao[pos] = jogadores.filter(j => j.posicao === pos);
      });

      Object.values(porPosicao).forEach(jogadoresPosicao => {
        jogadoresPosicao.sort(() => Math.random() - 0.5).forEach((jogador, i) => {
          times[i % quantidadeTimes].push(jogador);
        });
      });
    } 
    // Balanceamento por nível
    else if (balanceamento === "nivel") {
      jogadores.sort((a, b) => b.nivel - a.nivel);
      jogadores.forEach((jogador, index) => {
        times[index % quantidadeTimes].push(jogador);
      });
    } 
    // Sorteio aleatório
    else {
      const jogadoresEmbaralhados = [...jogadores].sort(() => Math.random() - 0.5);
      const jogadoresPorTime = Math.floor(jogadoresEmbaralhados.length / quantidadeTimes);
      
      for (let i = 0; i < quantidadeTimes; i++) {
        times[i] = jogadoresEmbaralhados.slice(
          i * jogadoresPorTime,
          (i + 1) * jogadoresPorTime
        );
      }
      
      // Distribui jogadores restantes
      let indexTime = 0;
      for (let i = quantidadeTimes * jogadoresPorTime; i < jogadoresEmbaralhados.length; i++) {
        times[indexTime % quantidadeTimes].push(jogadoresEmbaralhados[i]);
        indexTime++;
      }
    }

    // Calcula o nível médio de cada time para balanceamento
    const timesComInfo = times.map(time => {
      const nivelTotal = time.reduce((sum, jogador) => sum + (jogador.nivel || 3), 0);
      return {
        jogadores: time,
        nivelMedio: parseFloat((nivelTotal / time.length).toFixed(2)),
        quantidade: time.length
      };
    });

    res.json({
      success: true,
      data: {
        times: timesComInfo,
        balanceamento,
        totalJogadores: jogadores.length
      }
    });

  } catch (error) {
    handleError(res, error, 'Erro ao sortear times');
  }
});

module.exports = router;