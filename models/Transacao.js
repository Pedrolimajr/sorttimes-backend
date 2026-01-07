const mongoose = require('mongoose');

// Helper simples para "agora" no fuso America/Sao_Paulo
const getNowInSaoPaulo = () => {
  const now = new Date();
  const spString = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return new Date(spString);
};

const transacaoSchema = new mongoose.Schema({
  descricao: { type: String, required: true },
  valor: { type: Number, required: true, min: 0 },
  tipo: { type: String, required: true, enum: ['receita', 'despesa'] },
  categoria: { type: String },
  data: { type: Date, required: true, default: getNowInSaoPaulo },
  dataLimite: { type: Date }, // Data limite para pagamento
  jogadorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Jogador' },
  jogadorNome: { type: String },
  isento: { type: Boolean, default: false }, // Adicionando o campo isento
  status: { 
    type: String, 
    enum: ['pendente', 'pago', 'atrasado', 'isento'],
    default: 'pendente'
  },
  createdAt: { type: Date, default: getNowInSaoPaulo }
}, {
  timestamps: true
});

// Middleware para atualizar o status da transação
transacaoSchema.pre('save', function(next) {
  if (this.tipo === 'receita' && this.categoria === 'mensalidade') {
    const dataAtual = getNowInSaoPaulo();
    
    if (this.isento) {
      this.status = 'isento';
    } else if (this.dataLimite && dataAtual > this.dataLimite && !this.valor) {
      this.status = 'atrasado';
    } else if (this.valor > 0) {
      this.status = 'pago';
    } else {
      this.status = 'pendente';
    }
  }
  next();
});

// Indexes para melhor performance
transacaoSchema.index({ data: 1 });
transacaoSchema.index({ dataLimite: 1 });
transacaoSchema.index({ status: 1 });
transacaoSchema.index({ tipo: 1 });
transacaoSchema.index({ jogadorId: 1 });

module.exports = mongoose.model('Transacao', transacaoSchema);