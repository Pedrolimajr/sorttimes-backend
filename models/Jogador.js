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
    type: [Boolean],
    default: () => Array(12).fill(false)
  },
  statusFinanceiro: {
    type: String,
    enum: ['Adimplente', 'Inadimplente'],
    default: 'Inadimplente'
  },
  presente: {
    type: Boolean,
    default: false,
    index: true
  },
}, {
  timestamps: true
});

// Middleware pre-save para garantir valores padrão
jogadorSchema.pre('save', function(next) {
  // Garante que pagamentos sempre tenha 12 posições
  if (!this.pagamentos || this.pagamentos.length !== 12) {
    this.pagamentos = Array(12).fill(false);
  }
  next();
});

module.exports = mongoose.model('Jogador', jogadorSchema);

