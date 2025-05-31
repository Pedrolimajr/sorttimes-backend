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
const authRoutes = require('./routes/authRoutes');
const Transacao = require('./models/Transacao');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const auth = require('./middleware/auth');
const protectedRoutes = require('./routes/protectedRoutes');
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
app.options('*', cors(corsOptions));

// Middleware para log de requisições
app.use((req, res, next) => {
  const isProtected = req.path.startsWith('/api') && !req.path.startsWith('/api/auth');
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    protected: isProtected,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
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

// Verificação do middleware de autenticação
console.log('🔐 Verificando configuração de autenticação...');
if (typeof auth !== 'function') {
  console.error('❌ Middleware de autenticação não está configurado corretamente');
  process.exit(1);
} else {
  console.log('✅ Middleware de autenticação configurado com sucesso');
}

// ==================== ROTAS PRINCIPAIS ====================
console.log('📡 Inicializando rotas...');

// Rota raiz
app.get('/', (req, res) => {
    res.json({
        message: 'SortTimes API',
        status: 'online',
        version: '1.0.0'
    });
});

// Rotas públicas
app.use('/api/auth', authRoutes);

// Rotas de confirmação de presença (públicas)
const linksPresenca = new Map();

app.post('/api/gerar-link-presenca', (req, res) => {
  try {
    const linkId = uuidv4();
    const dadosLink = {
      jogadores: req.body.jogadores,
      criadoEm: Date.now(),
      dataJogo: req.body.dataJogo
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
      data: {
        jogadores: dados.jogadores,
        dataJogo: dados.dataJogo || null
      }
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

// Rota de saúde (pública)
app.get('/api/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const statusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  try {
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

// Rotas protegidas
app.use('/api', auth, protectedRoutes);

// Rotas específicas que podem ser públicas ou protegidas
app.use('/api/planilhas', planilhasRoutes);
app.use('/api/agenda', partidasRoutes);

// Rota de teste para DELETE (protegida)
app.delete('/api/planilhas/teste-delete', auth, (req, res) => {
  console.log('✅ Rota DELETE de teste funcionando');
  res.json({ 
    success: true, 
    message: 'Rota DELETE de planilhas está funcionando',
    timestamp: new Date().toISOString()
  });
});

// Rota para servir o arquivo financeiro.json quando necessário
app.get('/api/financeiro/backup', auth, async (req, res) => {
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

// Manipulador de erros global aprimorado
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] Erro:`, err.stack);
  
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Tratamento especial para erros de autenticação
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ 
      success: false,
      message: 'Token inválido ou expirado',
      errorType: 'authentication_error'
    });
  }
  
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
  console.log('   - /api/jogadores (protegido)');
  console.log('   - /api/financeiro (protegido)');
  console.log('   - /api/sorteio-times (protegido)');
  console.log('   - /api/planilhas');
  console.log('   - /api/agenda');
  console.log('   - /api/auth (público)');
  console.log(`🔍 Teste DELETE disponível em: http://localhost:${PORT}/api/planilhas/teste-delete (protegido)`);
});

// Configuração do Socket.IO
const io = new Server(server, {
  cors: {
    origin: [
      'https://sorttimes-frontend.vercel.app',
      'http://localhost:5173'
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Tratamento de erros do Socket.IO
io.engine.on("connection_error", (err) => {
  console.log("Erro de conexão Socket.IO:", {
    code: err.code,
    message: err.message,
    context: err.context
  });
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
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Rejeição não tratada:', reason);
  console.error('📌 Promise:', promise);
});
process.on('uncaughtException', (err) => {
  console.error('💥 Exceção não capturada:', err);
  shutdown('uncaughtException');
});



