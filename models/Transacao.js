const mongoose = require('mongoose');

// Helper simples para "agora" no fuso America/Sao_Paulo (robusto)
const getNowInSaoPaulo = () => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const get = (type) => {
    const part = parts.find(p => p.type === type);
    const value = part && part.value ? String(part.value) : '';
    return value ? value.padStart(2, '0') : '00';
  };

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
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

// Antes de validar, garante que datas sejam válidas (corrige strings inválidas como "Invalid Date")
transacaoSchema.pre('validate', function(next) {
  try {
    if (!this.data || isNaN(new Date(this.data).getTime())) {
      this.data = getNowInSaoPaulo();
    } else {
      this.data = new Date(this.data);
    }

    if (!this.createdAt || isNaN(new Date(this.createdAt).getTime())) {
      this.createdAt = getNowInSaoPaulo();
    } else {
      this.createdAt = new Date(this.createdAt);
    }
  } catch (e) {
    // Em caso de qualquer problema, garante valores padrão
    this.data = getNowInSaoPaulo();
    this.createdAt = getNowInSaoPaulo();
  }
  next();
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