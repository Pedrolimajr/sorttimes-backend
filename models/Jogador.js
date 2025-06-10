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
      pago: { type: Boolean, default: false },
      isento: { type: Boolean, default: false },
      dataPagamento: { type: Date },
      dataLimite: { type: Date }
    }],
    default: () => Array(12).fill().map(() => ({
      pago: false,
      isento: false,
      dataPagamento: null,
      dataLimite: null
    }))
  },
  statusFinanceiro: {
    type: String,
    enum: ['Adimplente', 'Inadimplente'],
    default: 'Inadimplente'
  }
}, {
  timestamps: true
});

// Middleware pre-save para garantir valores padrão
jogadorSchema.pre('save', function(next) {
  // Garante que pagamentos sempre tenha 12 posições com a estrutura correta
  if (!this.pagamentos || this.pagamentos.length !== 12) {
    const anoAtual = new Date().getFullYear();
    this.pagamentos = Array(12).fill().map((_, index) => ({
      pago: false,
      isento: false,
      dataPagamento: null,
      dataLimite: new Date(anoAtual, index, 20)
    }));
  }

  // Converte pagamentos booleanos para objetos se necessário
  this.pagamentos = this.pagamentos.map((pagamento, index) => {
    if (typeof pagamento === 'boolean') {
      return {
        pago: pagamento,
        isento: false,
        dataPagamento: pagamento ? new Date() : null,
        dataLimite: new Date(new Date().getFullYear(), index, 20)
      };
    }
    return pagamento;
  });

  next();
});

// Atualiza o status financeiro antes de salvar
jogadorSchema.pre('save', function(next) {
  const mesAtual = new Date().getMonth();
  const dataAtual = new Date();

  // Verifica se o jogador possui pagamentos pendentes até o mês atual
  const inadimplente = this.pagamentos.some((pagamento, index) => {
    if (index > mesAtual) return false; // Ignora meses futuros
    
    // Se estiver isento, não considera inadimplente
    if (pagamento.isento) return false;
    
    // Se não estiver pago e a data atual for maior que a data limite, considera inadimplente
    if (!pagamento.pago && dataAtual > pagamento.dataLimite) return true;
    
    return false;
  });

  this.statusFinanceiro = inadimplente ? 'Inadimplente' : 'Adimplente';
  next();
});

module.exports = mongoose.model('Jogador', jogadorSchema);

