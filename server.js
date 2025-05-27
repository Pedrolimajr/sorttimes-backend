const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configuração do CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origem não permitida pelo CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Configuração do Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Configuração do Socket.IO para presença
io.on('connection', (socket) => {
  console.log('👤 Novo cliente conectado:', socket.id);

  socket.on('entrarSala', (linkId) => {
    socket.join(linkId);
    console.log(`👥 Cliente ${socket.id} entrou na sala: ${linkId}`);
  });

  socket.on('atualizarPresenca', (data) => {
    socket.to(data.linkId).emit('presencaAtualizada', {
      jogadorId: data.jogadorId,
      presente: data.presente,
      atualizadoEm: new Date()
    });
    console.log(`🔄 Presença atualizada: ${data.jogadorNome} - ${data.presente ? '✅' : '❌'}`);
  });

  socket.on('disconnect', () => {
    console.log('👋 Cliente desconectado:', socket.id);
  });
});

// Middleware para parsing do JSON
app.use(express.json());

// Rotas
app.use('/api/jogadores', require('./routes/jogadores'));
app.use('/api/presenca', require('./routes/presenca'));
app.use('/api/sorteio', require('./routes/sorteioTimes'));
app.use('/api/financeiro', require('./routes/financeiro'));

// Rota de teste
app.get('/api/teste', (req, res) => {
  res.json({ message: 'API funcionando!' });
});

// Inicialização do servidor
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('📊 MongoDB conectado');
    server.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
    });
  })
  .catch(err => {
    console.error('❌ Erro ao conectar ao MongoDB:', err);
    process.exit(1);
  });
