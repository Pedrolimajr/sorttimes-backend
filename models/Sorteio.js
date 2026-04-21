const mongoose = require('mongoose');

const sorteioSchema = new mongoose.Schema({
  times: [{
    nome: String,
    jogadores: [{
      id: String,
      nome: String,
      posicao: String,
      nivel: Number
    }],
    nivelMedio: String,
    quantidade: Number
  }],
  data: { type: Date, default: Date.now },
  jogadoresPresentes: Number,
  balanceamento: { type: String, default: 'posicao' },
  posicaoUnica: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Sorteio', sorteioSchema);