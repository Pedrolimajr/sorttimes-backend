const mongoose = require('mongoose');

const jogadorSchema = new mongoose.Schema({
  nome: { 
    type: String, 
    required: [true, 'Nome é obrigatório'],
    trim: true,
    maxlength: [100, 'Nome não pode ter mais que 100 caracteres']
  },
  dataNascimento: { 
    type: Date,
    required: false
  },
  endereco: { 
    type: String,
    required: false,
    trim: true
  },
  telefone: { 
    type: String,
    required: false
  },
  email: {
    type: String,
    required: false,
    lowercase: true,
    sparse: true,
    unique: false
  },
  dataIngresso: {
    type: Date,
    required: false,
    default: Date.now
  },
  posicao: {
    type: String,
    required: [true, 'Posição é obrigatória'],
    enum: ['Goleiro', 'Defensor', 'Lateral-Esquerdo', 'Lateral-Direito', 
           'Volante', 'Meia-Direita', 'Meia-Esquerda', 'Centroavante']
  },
  numeroCamisa: {
    type: Number,
    required: false
  },
  nivel: {
    type: String,
    required: [true, 'Nível é obrigatório'],
    enum: ['Associado', 'Convidado', 'Visitante'],
    default: 'Associado'
  },
  foto: {
    type: String,
    required: false
  },
  pagamentos: {
    type: [{
      pago: { type: Boolean, default: false },
      isento: { type: Boolean, default: false }
    }],
    default: () => Array(12).fill({ pago: false, isento: false })
  },
  statusFinanceiro: {
    type: String,
    enum: ['Adimplente', 'Inadimplente'],
    default: 'Inadimplente'
  }
}, {
  timestamps: true
});

// Middleware para garantir que pagamentos tenha 12 meses
jogadorSchema.pre('save', function(next) {
  if (!this.pagamentos || this.pagamentos.length !== 12) {
    this.pagamentos = Array(12).fill().map(() => ({ pago: false, isento: false }));
  }
  next();
});

// Middleware para atualizar o status financeiro com base nos pagamentos
jogadorSchema.pre('save', function(next) {
  const mesAtual = new Date().getMonth(); // 0 = Jan, 11 = Dez
  const inadimplente = this.pagamentos.some((pagamento, index) => {
    return index <= mesAtual && !pagamento.pago && !pagamento.isento;
  });

  this.statusFinanceiro = inadimplente ? 'Inadimplente' : 'Adimplente';
  next();
});

module.exports = mongoose.model('Jogador', jogadorSchema);


