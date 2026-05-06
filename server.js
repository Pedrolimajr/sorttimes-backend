const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const partidasRoutes = require('./routes/partidas');
const planilhasRoutes = require('./routes/planilhas');
const authRoutes = require('./routes/authRoutes'); //Rota Login
const Transacao = require('./models/Transacao');
const Jogador = require('./models/Jogador');
const authMiddleware = require('./middleware/auth');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const LinkPresenca = require('./models/LinkPresenca');
const LinkPartida = require('./models/LinkPartida');
const Partida = require('./models/Partida');

// Controle em memória para tentativas de autenticação na confirmação de presença
// Chave: `${ip}:${linkId}`
// Valor: { attempts: number, blockedUntil: Date, lastAttemptAt: Date }
const presencaAttempts = new Map();

// Sessões temporárias de confirmação de presença
// Chave: sessionId (uuid)
// Valor: { linkId, jogadorId, expiresAt: Date }
const presencaSessions = new Map();

require('dotenv').config();

// Carrega as variáveis de ambiente
dotenv.config();

// Debug para verificar as variáveis de ambiente
console.log('Variáveis de ambiente carregadas:', {
  mongoUri: process.env.MONGO_URI ? 'Presente' : 'Ausente',
  port: process.env.PORT,
  jwtKey: process.env.JWT_PRIVATE_KEY ? 'Presente' : 'Ausente'
});

// Conexão com MongoDB
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI não está definida nas variáveis de ambiente');
    }

    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB conectado com sucesso!');

    // Configurar índice TTL para LinkPresenca (expiração automática)
    try {
      // Cria o índice na coleção diretamente para garantir que funcione mesmo sem estar no schema
      await LinkPresenca.collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
      await LinkPartida.collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
      console.log('✅ Índice TTL configurado para LinkPresenca');
      console.log('✅ Índice TTL configurado para LinkPartida');
    } catch (err) {
      console.error('Erro ao configurar índice TTL:', err);
    }
  } catch (error) {
    console.error('❌ Erro ao conectar ao MongoDB:', error.message);
    process.exit(1);
  }
};

// Inicializa a conexão
connectDB();

// Importe as rotas
const financeiroRoutes = require('./routes/financeiro');
const jogadorRoutes = require('./routes/jogadores');
const sorteioTimesRoutes = require('./routes/sorteioTimes');
const partidasPublicRoutes = require('./routes/partidasPublic');

const app = express();

// ==================== CONFIGURAÇÕES DE SEGURANÇA ====================
app.use(helmet());
app.use(mongoSanitize());
app.use(hpp());

// ==================== CONFIGURAÇÃO DO CORS ====================
const corsOptions = {
  origin: [
    'https://sorttimes-frontend.vercel.app',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Allow-Headers'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // com a mesma configuração

// Middleware para log de requisições
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://sorttimes-frontend.vercel.app');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
    return res.status(200).json({});
  }
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Adicione após as configurações do CORS
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  next();
});

// ==================== RATE LIMITING ====================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Muitas requisições deste IP, tente novamente mais tarde'
  }
});

// Aplicar rate limiting apenas a rotas específicas
app.use('/api/auth', limiter);

// ==================== MIDDLEWARES ====================
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 100
}));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de log melhorado
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Body:', req.body);
  next();
});

// ==================== ROTAS PRINCIPAIS ====================
console.log('📡 Inicializando rotas...');

// Middleware de verificação de rota para planilhas
app.use('/api/planilhas', (req, res, next) => {
  console.log(`📦 Rota /api/planilhas acessada: ${req.method} ${req.originalUrl}`);
  next();
});

app.use('/api/financeiro', (req, res, next) => {
  console.log(`💰 Rota /api/financeiro acessada: ${req.method} ${req.originalUrl}`);
  next();
});

// ADICIONE A ROTA RAIZ AQUI - ANTES DAS OUTRAS ROTAS
app.get('/', (req, res) => {
    res.json({
        message: 'SortTimes API',
        status: 'online',
        version: '1.0.0'
    });
});

// Carregar rotas
app.use('/api/jogadores', jogadorRoutes);
app.use('/api/sorteio-times', sorteioTimesRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/agenda', partidasRoutes);
app.use('/api/planilhas', planilhasRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/partida-publica', partidasPublicRoutes);

// Rota de teste para DELETE
app.delete('/api/planilhas/teste-delete', (req, res) => {
  console.log('✅ Rota DELETE de teste funcionando');
  res.json({ 
    success: true, 
    message: 'Rota DELETE de planilhas está funcionando',
    timestamp: new Date().toISOString()
  });
});

// Rota para servir o arquivo financeiro.json quando necessário
app.get('/api/financeiro/backup', async (req, res) => {
  try {
    const transacoes = await Transacao.find().lean();
    const jogadores = await Jogador.find().lean();
    
    res.json({
      success: true,
      transacoes,
      jogadores,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erro ao gerar backup financeiro'
    });
  }
});

// ==================== ROTAS DE CONFIRMAÇÃO DE PRESENÇA ====================

// POST - Gerar link de presença (admin / autenticado)
app.post('/api/gerar-link-presenca', authMiddleware, async (req, res) => {
  try {
    const { dataJogo } = req.body;

    if (!dataJogo) {
      return res.status(400).json({
        success: false,
        message: 'Data do jogo é obrigatória'
      });
    }

    const linkId = uuidv4();
    const dataJogoDate = new Date(dataJogo);
    
    // Define expiração para 15 horas após o jogo
    const expireAt = new Date(dataJogoDate.getTime() + 15 * 60 * 60 * 1000);

    const novoLink = new LinkPresenca({
      linkId,
      jogadores: [], // Inicializa vazio, pois a lista será dinâmica
      dataJogo: dataJogoDate
    });
    
    // Adiciona o campo expireAt mesmo que não esteja no schema (strict: false)
    novoLink.set('expireAt', expireAt, { strict: false });

    await novoLink.save();

    return res.status(201).json({
      success: true,
      linkId
    });
  } catch (error) {
    console.error('Erro ao gerar link de presença:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao gerar link de presença'
    });
  }
});

// Helper para obter IP real do cliente
const getClientIp = (req) => {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

// GET - Buscar dados públicos do link de presença (sem lista de jogadores)
app.get('/api/presenca/:linkId', async (req, res) => {
  try {
    const link = await LinkPresenca.findOne({ linkId: req.params.linkId });

    if (!link) {
      return res.status(404).json({
        success: false,
        message: 'Link não encontrado ou expirado'
      });
    }

    return res.json({
      success: true,
      data: {
        // Apenas informações do evento, nunca a lista completa de jogadores
        dataJogo: link.dataJogo
      }
    });
  } catch (error) {
    console.error('Erro ao buscar link de presença:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar dados de presença'
    });
  }
});

// POST - Autenticação do jogador para confirmação de presença
app.post('/api/presenca/:linkId/auth', async (req, res) => {
  try {
    const { nome, password } = req.body; // password = DDMMAAAA
    const ip = getClientIp(req);
    const { linkId } = req.params;

    // 1. Busca o link para validar existência
    const link = await LinkPresenca.findOne({ linkId });
    if (!link) return res.status(404).json({ success: false, message: 'Link expirado' });

    // 2. Busca o jogador DIRETAMENTE na coleção principal (Sincronização em tempo real)
    const escapedNome = nome.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const jogadores = await Jogador.find({ 
      nome: { $regex: new RegExp(escapedNome, 'i') },
      nivel: 'Associado',
      ativo: { $ne: false }
    });

    if (jogadores.length === 0) return res.status(401).json({ success: false, message: 'Jogador não encontrado ou inativo.' });

    // 3. Valida a senha (Data de Nascimento)
    const jogador = jogadores.find(j => {
      if (!j.dataNascimento) return false;
      const data = new Date(j.dataNascimento);
      const dd = String(data.getDate()).padStart(2, '0');
      const mm = String(data.getMonth() + 1).padStart(2, '0');
      const yyyy = String(data.getFullYear());
      return password === `${dd}${mm}${yyyy}`;
    });

    if (!jogador || !jogador.dataNascimento) {
      return res.status(401).json({
        success: false,
        message: 'Não foi possível autenticar com os dados informados.'
      });
    }

    // Verifica se já está presente no LinkPresenca
    const jogadorNoLink = link.jogadores.find(j => String(j.id || j._id) === String(jogador._id));

    // Autenticação bem-sucedida: limpa tentativas
    presencaAttempts.delete(`${ip}:${linkId}`);

    // Cria sessão temporária exclusiva para este jogador
    const now = new Date();
    const sessionId = uuidv4();
    const sessionDurationMinutes = 30;
    const expiresAt = new Date(now.getTime() + sessionDurationMinutes * 60 * 1000);

    presencaSessions.set(sessionId, {
      linkId,
      jogadorId: String(jogador._id),
      expiresAt
    });

    console.log(`✅ Sessão de presença criada. Jogador=${jogador.nome} Link=${linkId} IP=${ip} Expira=${expiresAt.toISOString()}`);

    return res.json({
      success: true,
      jogador: {
        id: String(jogador._id),
        nome: jogador.nome,
        presente: jogadorNoLink ? !!jogadorNoLink.presente : false,
        foto: jogador.foto
      },
      sessionId
    });
  } catch (error) {
    console.error('Erro na autenticação de presença:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao autenticar presença'
    });
  }
});

// POST - Autenticação de admin para visualizar todos os jogadores do link
app.post('/api/presenca/:linkId/admin-auth', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Normaliza credenciais recebidas (remove espaços e ignora maiúsculas/minúsculas no usuário)
    const usernameNorm = (username || '').trim().toLowerCase();
    const passwordNorm = (password || '').trim();

    // Credenciais para acesso admin da tela de presença (via variáveis de ambiente)
    const ADMIN_USER = process.env.PRESENCA_ADMIN_USER;
    const ADMIN_PASS = process.env.PRESENCA_ADMIN_PASS;

    // Validação para garantir que as variáveis de ambiente estão configuradas
    if (!ADMIN_USER || !ADMIN_PASS) {
      const devMessage = 'ERRO: As variáveis de ambiente PRESENCA_ADMIN_USER e/ou PRESENCA_ADMIN_PASS não estão configuradas no servidor.';
      console.error(devMessage);
      return res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' 
          ? 'Erro de configuração do servidor. Contate o administrador.'
          : devMessage
      });
    }

    // Compara as credenciais fornecidas com as do ambiente
    if (usernameNorm !== ADMIN_USER.trim().toLowerCase() || passwordNorm !== ADMIN_PASS.trim()) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais de admin inválidas.'
      });
    }

    const { linkId } = req.params;
    const link = await LinkPresenca.findOne({ linkId });

    if (!link) {
      return res.status(404).json({
        success: false,
        message: 'Link não encontrado ou expirado'
      });
    }

    // 1. Busca todos os associados ativos no momento da consulta (Dinamismo)
    const associadosAtivos = await Jogador.find({ 
      nivel: 'Associado', 
      ativo: { $ne: false } 
    }).select('nome foto').sort({ nome: 1 });

    // 2. Mapeia o status de presença armazenado no link
    const jogadoresFinal = associadosAtivos.map(atleta => {
      const presenca = link.jogadores.find(p => String(p.id || p._id) === String(atleta._id));
      return {
        id: atleta._id,
        nome: atleta.nome,
        foto: atleta.foto,
        presente: presenca ? !!presenca.presente : false
      };
    });

    return res.json({
      success: true,
      data: {
        dataJogo: link.dataJogo,
        jogadores: jogadoresFinal
      }
    });
  } catch (error) {
    console.error('Erro na autenticação admin de presença:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao autenticar admin de presença'
    });
  }
});

// POST - Confirmar presença
// - Fluxo jogador: usa sessionId (não confia em jogadorId vindo do client)
// - Fluxo admin (SorteioTimes): usa jogadorId diretamente (mantém funcionalidade atual)
app.post('/api/presenca/:linkId/confirmar', async (req, res) => {
  try {
    const { jogadorId, presente, sessionId } = req.body;
    const { linkId } = req.params;

    const link = await LinkPresenca.findOne({ linkId });

    if (!link) {
      return res.status(404).json({
        success: false,
        message: 'Link não encontrado'
      });
    }

    let jogadorIdEfetivo = jogadorId;

    // Se vier sessionId, trata como confirmação do próprio jogador autenticado
    if (sessionId) {
      const session = presencaSessions.get(sessionId);
      const now = new Date();

      if (!session || session.linkId !== linkId || session.expiresAt <= now) {
        return res.status(401).json({
          success: false,
          message: 'Sessão de confirmação expirada ou inválida.'
        });
      }

      jogadorIdEfetivo = session.jogadorId;
    }

    const jogadorIndex = link.jogadores.findIndex(j => String(j.id || j._id) === String(jogadorIdEfetivo));

    // Se o jogador não existe no array do link (foi cadastrado depois do link ser gerado)
    // precisamos buscar os dados dele e adicionar ao link agora.
    if (jogadorIndex === -1) {
      const atletaOriginal = await Jogador.findById(jogadorIdEfetivo);
      if (!atletaOriginal) return res.status(404).json({ success: false, message: 'Jogador não existe.' });
      
      link.jogadores.push({
        id: atletaOriginal._id,
        nome: atletaOriginal.nome,
        foto: atletaOriginal.foto,
        presente: !!presente
      });
    } else {
      link.jogadores[jogadorIndex].presente = !!presente;
    }

    // Informa que o campo foi modificado
    link.markModified('jogadores');

    await link.save();

    io.emit('presencaAtualizada', { jogadorId: jogadorIdEfetivo, presente: !!presente });

    return res.json({ success: true });
  } catch (error) {
    console.error('Erro ao confirmar presença:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao confirmar presença'
    });
  }
});

// Rota de saúde aprimorada 
app.get('/api/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const statusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  try {
    // Teste adicional para verificar coleção de transações
    const transacoesCount = await Transacao.countDocuments();
    
    res.status(dbStatus === 1 ? 200 : 503).json({
      status: dbStatus === 1 ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: statusMap[dbStatus] || 'unknown',
      financeiro: {
        transacoes: transacoesCount,
        status: 'operational'
      },
      memoryUsage: process.memoryUsage(),
      activeRoutes: [
        '/api/jogadores',
        '/api/planilhas',
        '/api/financeiro',
        '/api/sorteio-times',
        '/api/agenda'
      ]
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      database: statusMap[dbStatus] || 'unknown',
      financeiro: {
        status: 'degraded',
        error: error.message
      }
    });
  }
});

// Servir arquivos estáticos com cache control
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.json')) {
      res.set('Cache-Control', 'no-store');
    }
  }
}));

// ==================== TRATAMENTO DE ERROS ====================
// Rota não encontrada
app.use((req, res) => {
  console.error(`❌ Rota não encontrada: ${req.method} ${req.path}`);
  res.status(404).json({ 
    success: false, 
    message: 'Rota não encontrada',
    path: req.path,
    method: req.method,
    suggestedRoutes: [
      '/api/jogadores',
      '/api/financeiro',
      '/api/sorteio-times',
      '/api/planilhas'
    ],
    timestamp: new Date().toISOString()
  });
});

// Adicione antes do tratamento de erros
app.get('/api/financeiro/quick-stats', async (req, res) => {
  try {
    const [receitas, despesas, jogadores] = await Promise.all([
      Transacao.aggregate([
        { $match: { tipo: 'receita' } },
        { $group: { _id: null, total: { $sum: '$valor' } } }
      ]),
      Transacao.aggregate([
        { $match: { tipo: 'despesa' } },
        { $group: { _id: null, total: { $sum: '$valor' } } }
      ]),
      Jogador.countDocuments()
    ]);

    res.json({
      success: true,
      receitas: receitas[0]?.total || 0,
      despesas: despesas[0]?.total || 0,
      saldo: (receitas[0]?.total || 0) - (despesas[0]?.total || 0),
      totalJogadores: jogadores
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao calcular estatísticas'
    });
  }
});

// Manipulador de erros global aprimorado
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] Erro:`, err.stack);
  
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Tratamento especial para erros de transação
  if (err.message.includes('Transacao') || err.message.includes('financeiro')) {
    console.error('💸 Erro financeiro detectado:', err.message);
  }
  
  const errorResponse = {
    success: false,
    message: statusCode === 500 && isProduction 
      ? 'Erro interno no servidor' 
      : err.message,
    timestamp,
    path: req.path,
    method: req.method,
    // Adiciona tipo de erro para frontend identificar
    errorType: err.errorType || 'general_error'
  };
  
  if (!isProduction) {
    errorResponse.stack = err.stack;
    if (err.errors) errorResponse.errors = err.errors;
  }
  
  res.status(statusCode).json(errorResponse);
});

// ==================== INICIALIZAÇÃO DO SERVIDOR ====================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
 console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log('📊 Rotas disponíveis:');
  console.log('   - /api/jogadores');
  console.log('   - /api/financeiro');
  console.log('   - /api/financeiro/quick-stats');
  console.log('   - /api/sorteio-times');
  console.log('   - /api/planilhas');
  console.log('   - /api/agenda');
  console.log(`🔍 Teste DELETE disponível em: http://localhost:${PORT}/api/planilhas/teste-delete`);
});

// Configuração do Socket.IO
const io = new Server(server, {
  cors: {
    origin: [
      'https://sorttimes-frontend.vercel.app',
      'http://localhost:5173'
    ],
    methods: ['GET', 'POST'],
    allowedHeaders: ['my-custom-header']
  }
});

// Encerramento gracioso do servidor
const shutdown = (signal) => {
  console.log(`🛑 Recebido sinal ${signal}...`);

  server.close(async () => {
    console.log('⏳ Fechando conexão com o MongoDB...');
    try {
      await mongoose.connection.close();
      console.log('✅ Conexão com MongoDB fechada');
    } catch (err) {
      console.error('❌ Erro ao fechar conexão com MongoDB:', err.message);
    }

    console.log('👋 Servidor encerrado com sucesso');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⏰ Forçando encerramento por timeout...');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Tratamento de rejeições não capturadas de Promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Rejeição não tratada:', reason);
  console.error('📌 Promise:', promise);
});

// Tratamento de exceções não capturadas
process.on('uncaughtException', (err) => {
  console.error('💥 Exceção não capturada:', err);
  shutdown('uncaughtException');
});
