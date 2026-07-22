const mongoose = require('mongoose');

const TokenPresencaSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  linkPresencaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LinkPresenca',
    required: true,
  },
  jogadorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Jogador',
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

// Índice TTL para expiração automática dos tokens do banco de dados
TokenPresencaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TokenPresenca', TokenPresencaSchema);