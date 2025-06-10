const mongoose = require('mongoose');

const pagamentoSchema = new mongoose.Schema({
  pago: {
    type: Boolean,
    default: false
  },
  isento: {
    type: Boolean,
    default: false
  },
  dataPagamento: {
    type: Date,
    default: null
  },
  dataLimite: {
    type: Date,
    required: true
  }
}, { _id: false });

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
    type: [pagamentoSchema],
    default: () => {
      const anoAtual = new Date().getFullYear();
      return Array(12).fill().map((_, index) => ({
        pago: false,
        isento: false,
        dataPagamento: null,
        dataLimite: new Date(anoAtual, index, 20)
      }));
    }
  },
  statusFinanceiro: {
    type: String,
    enum: ['Adimplente', 'Inadimplente'],
    default: 'Inadimplente'
  }
}, {
  timestamps: true
});

// Middleware para garantir que pagamentos seja sempre um array de objetos
jogadorSchema.pre('validate', function(next) {
  if (this.pagamentos) {
    const anoAtual = new Date().getFullYear();
    this.pagamentos = this.pagamentos.map((pagamento, index) => {
      // Se for booleano ou não existir, cria novo objeto
      if (typeof pagamento === 'boolean' || !pagamento) {
        return {
          pago: typeof pagamento === 'boolean' ? pagamento : false,
          isento: false,
          dataPagamento: typeof pagamento === 'boolean' && pagamento ? new Date() : null,
          dataLimite: new Date(anoAtual, index, 20)
        };
      }
      // Se já for objeto, mantém os valores existentes
      return {
        pago: pagamento.pago || false,
        isento: pagamento.isento || false,
        dataPagamento: pagamento.dataPagamento || null,
        dataLimite: pagamento.dataLimite || new Date(anoAtual, index, 20)
      };
    });
  }
  next();
});

// Atualiza o status financeiro antes de salvar
jogadorSchema.pre('save', function(next) {
  const mesAtual = new Date().getMonth();
  const dataAtual = new Date();

  // Verifica se o jogador possui pagamentos pendentes até o mês atual
  const inadimplente = this.pagamentos.some((pagamento, index) => {
    if (index > mesAtual) return false; // Ignora meses futuros
    if (pagamento.isento) return false; // Ignora meses isentos
    return !pagamento.pago && dataAtual > pagamento.dataLimite;
  });

  this.statusFinanceiro = inadimplente ? 'Inadimplente' : 'Adimplente';
  next();
});

module.exports = mongoose.model('Jogador', jogadorSchema);

