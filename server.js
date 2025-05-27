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
const Transacao = require('./models/Transacao'); // Adicione esta linha
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Carrega as variáveis de ambiente
dotenv.config();

// Debug para verificar as variáveis de ambiente
console.log('Variáveis de ambiente carregadas:', {
  mongoUri: process.env.MONGO_URI ? 'Presente' : 'Ausente',
  port: process.env.PORT
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

const app = express();

// ==================== CONFIGURAÇÕES DE SEGURANÇA ====================
app.use(helmet());
app.use(mongoSanitize());
app.use(hpp());

// ==================== CONFIGURAÇÃO DO CORS ====================
app.use(cors({
  origin: [
    'https://sorttimes-frontend.vercel.app',
    'https://sorttimes.vercel.app',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
app.use('/api/auth', authRoutes); // Rota de autenticação

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

// Armazenamento temporário dos links
const linksPresenca = new Map();

// Rotas para confirmação de presença
app.post('/api/gerar-link-presenca', (req, res) => {
  try {
    const linkId = uuidv4();
    const dadosLink = {
      jogadores: req.body.jogadores,
      criadoEm: Date.now()
    };
    
    linksPresenca.set(linkId, dadosLink);
    
    res.json({ 
      success: true,
      linkId 
    });
  } catch (error) {
    console.error('Erro ao gerar link:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro ao gerar link de presença' 
    });
  }
});

app.get('/api/presenca/:linkId', (req, res) => {
  try {
    const dados = linksPresenca.get(req.params.linkId);
    if (!dados) {
      return res.status(404).json({ 
        success: false,
        message: 'Link não encontrado ou expirado' 
      });
    }
    res.json({ 
      success: true,
      jogadores: dados.jogadores 
    });
  } catch (error) {
    console.error('Erro ao buscar presença:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro ao buscar dados de presença' 
    });
  }
});

app.post('/api/presenca/:linkId/confirmar', (req, res) => {
  try {
    const { jogadorId, presente } = req.body;
    const dados = linksPresenca.get(req.params.linkId);
    
    if (!dados) {
      return res.status(404).json({ 
        success: false,
        message: 'Link não encontrado ou expirado' 
      });
    }

    const jogadorIndex = dados.jogadores.findIndex(j => j.id === jogadorId);
    if (jogadorIndex >= 0) {
      dados.jogadores[jogadorIndex].presente = presente;
      io.emit('presencaAtualizada', { jogadorId, presente });
      
      res.json({ success: true });
    } else {
      res.status(404).json({ 
        success: false,
        message: 'Jogador não encontrado' 
      });
    }
  } catch (error) {
    console.error('Erro ao confirmar presença:', error);
    res.status(500).json({ 
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
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Disponibiliza o io para as rotas
app.set('io', io);

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('👤 Usuário conectado:', socket.id);

  socket.on('disconnect', () => {
    console.log('👋 Usuário desconectado:', socket.id);
  });
});

// ==================== ENCERRAMENTO SEGURO ====================
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

// Registro das rotas
app.use('/jogadores', require('./routes/jogadores'));
app.use('/financeiro', require('./routes/financeiro'));

module.exports = app;
