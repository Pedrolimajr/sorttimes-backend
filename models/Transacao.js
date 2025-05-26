const mongoose = require('mongoose');

const transacaoSchema = new mongoose.Schema({
  descricao: { type: String, required: true },
  valor: { type: Number, required: true, min: 0 },
  tipo: { type: String, required: true, enum: ['receita', 'despesa'] },
  categoria: { type: String },
  data: { type: Date, required: true, default: Date.now },
  jogadorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Jogador' },
  jogadorNome: { type: String },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Indexes para melhor performance
transacaoSchema.index({ data: 1 });
transacaoSchema.index({ tipo: 1 });
transacaoSchema.index({ jogadorId: 1 });

module.exports = mongoose.model('Transacao', transacaoSchema);