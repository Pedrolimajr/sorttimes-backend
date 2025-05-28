const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

// Carrega as variáveis de ambiente
dotenv.config();

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

// Importe todas as rotas UMA ÚNICA VEZ
const partidasRoutes = require('./routes/partidas');
const planilhasRoutes = require('./routes/planilhas');
const authRoutes = require('./routes/authRoutes');
const financeiroRoutes = require('./routes/financeiro');
const jogadorRoutes = require('./routes/jogadores');
const sorteioTimesRoutes = require('./routes/sorteioTimes');
const Transacao = require('./models/Transacao');

const app = express();

// ==================== CONFIGURAÇÕES DE SEGURANÇA ====================
app.use(helmet());
app.use(mongoSanitize());
app.use(hpp());

// ==================== CONFIGURAÇÃO DO CORS ====================
app.use(cors({
  origin: [
    'https://sorttimes-frontend.vercel.app',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true
}));

// ==================== MIDDLEWARES ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==================== ROTAS PRINCIPAIS ====================
app.get('/', (req, res) => {
  res.json({
    message: 'SortTimes API',
    status: 'online',
    version: '1.0.0'
  });
});

// Registre todas as rotas UMA ÚNICA VEZ
app.use('/api/jogadores', jogadorRoutes);
app.use('/api/sorteio-times', sorteioTimesRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/agenda', partidasRoutes);
app.use('/api/planilhas', planilhasRoutes);
app.use('/api/auth', authRoutes);

// ==================== MANIPULADORES DE ERRO ====================
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Rota não encontrada' 
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false,
    message: 'Erro interno no servidor' 
  });
});

// ==================== INICIALIZAÇÃO DO SERVIDOR ====================
const startServer = async () => {
  await connectDB();
  
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
  });

  // Configuração do Socket.IO
  const io = new Server(server, {
    cors: {
      origin: [
        'https://sorttimes-frontend.vercel.app',
        'http://localhost:5173'
      ],
      methods: ["GET", "POST", "PUT", "DELETE"]
    }
  });

  app.set('io', io);

  io.on('connection', (socket) => {
    console.log('👤 Usuário conectado:', socket.id);
    socket.on('disconnect', () => {
      console.log('👋 Usuário desconectado:', socket.id);
    });
  });
};

startServer();
