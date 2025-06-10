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
    required: false // Não obrigatório
  },
  endereco: { 
    type: String,
    required: false, // Não obrigatório
    trim: true
  },
  telefone: { 
    type: String,
    required: false // Não obrigatório
  },
  email: {
    type: String,
    required: false, // Não obrigatório
    lowercase: true,
    sparse: true, // Permite múltiplos documentos sem email
    unique: false // Remove a restrição de único
  },
  dataIngresso: {
    type: Date,
    required: false, // Não obrigatório
    default: Date.now
  },
  posicao: {
    type: String,
    required: [true, 'Posição é obrigatória'], // Mantém obrigatório
    enum: ['Goleiro', 'Defensor', 'Lateral-Esquerdo', 'Lateral-Direito', 
           'Volante', 'Meia-Direita', 'Meia-Esquerda', 'Centroavante']
  },
  numeroCamisa: {
    type: Number,
    required: false // Não obrigatório
  },
  nivel: {
    type: String,
    required: [true, 'Nível é obrigatório'], // Mantém obrigatório
    enum: ['Associado', 'Convidado', 'Visitante'],
    default: 'Associado'
  },
  foto: {
    type: String,
    required: false // Não obrigatório
  },
  pagamentos: {
  type: [{
    pago: Boolean,
    isento: Boolean,
    dataPagamento: Date
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

jogadorSchema.methods.atualizarStatusFinanceiro = function() {
  const mesAtual = new Date().getMonth();
  const pagamentosDoAno = this.pagamentos;
  
  const inadimplente = pagamentosDoAno.some((pagamento, index) => {
    return index <= mesAtual && !pagamento.pago && !pagamento.isento;
  });

  this.statusFinanceiro = inadimplente ? 'Inadimplente' : 'Adimplente';
  return this.statusFinanceiro;
};

jogadorSchema.pre('save', function(next) {
  if (!this.pagamentos || this.pagamentos.length !== 12) {
    this.pagamentos = Array(12).fill({ pago: false, isento: false });
  }
  this.atualizarStatusFinanceiro();
  next();
});

module.exports = mongoose.model('Jogador', jogadorSchema);