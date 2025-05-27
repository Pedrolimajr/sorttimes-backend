const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Carrega as variáveis de ambiente
dotenv.config();

// Debug para verificar as variáveis de ambiente
console.log('Variáveis de ambiente carregadas:', {
  mongoUri: process.env.MONGO_URI ? 'Presente' : 'Ausente',
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV || 'development'
});

// Conexão com MongoDB
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI não está definida nas variáveis de ambiente');
    }

    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
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
const partidasRoutes = require('./routes/partidas');
const planilhasRoutes = require('./routes/planilhas');
const authRoutes = require('./routes/authRoutes');
const Transacao = require('./models/Transacao');
const Jogador = require('./models/Jogador');

const app = express();

// ==================== CONFIGURAÇÕES DE SEGURANÇA ====================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://sorttimes-backend.onrender.com", "ws://localhost:5000"]
    }
  }
}));
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
    'Origin'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Middleware para log de requisições
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', req.body);
  }
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

// ==================== ROTAS PRINCIPAIS ====================
console.log('📡 Inicializando rotas...');

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'SortTimes API',
    status: 'online',
    version: '1.0.0',
    socket: 'active',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Carregar rotas
app.use('/api/jogadores', jogadorRoutes);
app.use('/api/sorteio-times', sorteioTimesRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/agenda', partidasRoutes);
app.use('/api/planilhas', planilhasRoutes);
app.use('/api/auth', authRoutes);

// ==================== ROTAS DE PRESENÇA ====================
const linksPresenca = new Map();

// Middleware para rotas de presença
app.use('/api/presenca*', (req, res, next) => {
  console.log(`[PRESENCA] ${req.method} ${req.originalUrl}`);
  next();
});

// Gerar link de presença
app.post('/api/gerar-link-presenca', (req, res) => {
  try {
    const { jogadores, dataJogo } = req.body;
    
    if (!jogadores || !Array.isArray(jogadores)) {
      return res.status(400).json({
        success: false,
        message: 'Lista de jogadores inválida'
      });
    }

    const linkId = uuidv4();
    const dadosLink = {
      jogadores: jogadores.map(j => ({
        id: j.id,
        nome: j.nome,
        presente: false
      })),
      dataJogo,
      criadoEm: new Date(),
      atualizadoEm: new Date()
    };
    
    linksPresenca.set(linkId, dadosLink);
    
    console.log(`🔗 Link gerado: ${linkId} para ${jogadores.length} jogadores`);
    
    res.json({ 
      success: true,
      linkId,
      dataJogo
    });
  } catch (error) {
    console.error('❌ Erro ao gerar link:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno ao gerar link de presença',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Obter dados de presença
app.get('/api/presenca/:linkId', (req, res) => {
  try {
    const dados = linksPresenca.get(req.params.linkId);
    
    if (!dados) {
      console.log(`⚠️ Link não encontrado: ${req.params.linkId}`);
      return res.status(404).json({ 
        success: false,
        message: 'Link não encontrado ou expirado',
        code: 'LINK_NOT_FOUND'
      });
    }
    
    console.log(`📋 Dados recuperados para link: ${req.params.linkId}`);
    
    res.json({ 
      success: true,
      data: {
        jogadores: dados.jogadores,
        dataJogo: dados.dataJogo
      }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar presença:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno ao buscar dados de presença',
      code: 'SERVER_ERROR'
    });
  }
});

// Confirmar presença
// Atualize a rota de confirmação para:
app.post('/api/presenca/:linkId/confirmar', async (req, res) => {
  try {
    const { jogadorId, presente } = req.body;
    const linkId = req.params.linkId;
    
    console.log(`📝 Tentativa de confirmação: link=${linkId}, jogador=${jogadorId}, presente=${presente}`);
    
    const dados = linksPresenca.get(linkId);
    
    if (!dados) {
      console.log(`🔍 Link não encontrado: ${linkId}`);
      return res.status(404).json({ 
        success: false,
        message: 'Link não encontrado ou expirado',
        code: 'LINK_NOT_FOUND'
      });
    }

    const jogador = dados.jogadores.find(j => j.id === jogadorId);
    
    if (!jogador) {
      console.log(`👤 Jogador não encontrado no link: ${jogadorId}`);
      return res.status(404).json({ 
        success: false,
        message: 'Jogador não encontrado neste link',
        code: 'PLAYER_NOT_FOUND'
      });
    }

    // Atualiza o status
    jogador.presente = presente;
    dados.atualizadoEm = new Date();
    
    // Notifica via Socket.IO
    io.emit('presencaAtualizada', {
      linkId,
      jogadorId,
      presente,
      nome: jogador.nome
    });
    
    console.log(`✅ Presença atualizada: ${jogador.nome} -> ${presente ? 'Presente' : 'Ausente'}`);
    
    res.json({ 
      success: true,
      message: 'Presença atualizada com sucesso',
      data: {
        jogadorId,
        presente
      }
    });
  } catch (error) {
    console.error('❌ Erro ao confirmar presença:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno ao confirmar presença',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== INICIALIZAÇÃO DO SERVIDOR ====================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log('📊 Rotas disponíveis:');
  console.log('   - /api/jogadores');
  console.log('   - /api/financeiro');
  console.log('   - /api/sorteio-times');
  console.log('   - /api/planilhas');
  console.log('   - /api/agenda');
  console.log('   - /api/auth');
  console.log('   - /api/presenca');
});

// ==================== CONFIGURAÇÃO DO SOCKET.IO ====================
const io = new Server(server, {
  cors: corsOptions,
  path: "/socket.io",
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
  serveClient: false
});

// Disponibiliza o io para as rotas via res.locals
app.use((req, res, next) => {
  res.locals.io = io;
  next();
});

// Configuração dos eventos do Socket.IO
io.on('connection', (socket) => {
  console.log(`⚡ Nova conexão Socket.IO: ${socket.id}`);

  // Entrar em uma sala específica (para links de presença)
  socket.on('entrarSala', (linkId) => {
    socket.join(linkId);
    console.log(`👥 Socket ${socket.id} entrou na sala ${linkId}`);
  });

// Ouvir atualizações de presença do frontend
  socket.on('atualizarPresenca', async (data) => {
    try {
      const { jogadorId, presente } = data;
      
      const jogador = await Jogador.findByIdAndUpdate(
        jogadorId,
        { presente },
        { new: true }
      );

      if (jogador) {
        // Broadcast para todos os clientes
        io.emit('presencaAtualizada', {
          jogadorId: jogador._id,
          presente: jogador.presente,
          nome: jogador.nome
        });
      }
    } catch (error) {
      console.error('Erro ao processar atualização de presença:', error);
    }
  });


  // Sair de uma sala
  socket.on('sairSala', (linkId) => {
    socket.leave(linkId);
    console.log(`🚪 Socket ${socket.id} saiu da sala ${linkId}`);
  });

  // Lidar com atualizações de presença
  socket.on('atualizarPresenca', (data) => {
    const { linkId, jogadorId, presente } = data;
    console.log(`🔄 Atualizando presença: ${jogadorId} -> ${presente}`);
    
    // Emite apenas para a sala específica
    io.to(linkId).emit('presencaAtualizada', data);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Socket desconectado: ${socket.id}`);
  });

  // Middleware para verificar autenticação
  socket.use((packet, next) => {
    console.log(`📦 Pacote Socket.IO: ${packet[0]}`, packet[1]);
    next();
  });

  // Tratamento de erros
  socket.on('error', (err) => {
    console.error(`❌ Erro no Socket ${socket.id}:`, err);
  });
});

// Monitoramento de conexões
setInterval(() => {
  const socketsCount = io.of("/").sockets.size;
  const roomsCount = io.of("/").adapter.rooms.size;
  console.log(`📊 Estatísticas: ${socketsCount} sockets, ${roomsCount} salas`);
}, 60000);

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
      '/api/planilhas',
      '/api/presenca'
    ],
    timestamp: new Date().toISOString()
  });
});

// Manipulador de erros global
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] Erro:`, err.stack);
  
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  
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

module.exports = { app, server, io };