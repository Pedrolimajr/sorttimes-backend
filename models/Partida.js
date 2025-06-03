const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const partidaSchema = new mongoose.Schema({
  data: {
    type: Date,
    required: true
  },
  horario: {
    type: String,
    required: true
  },
  local: {
    type: String,
    required: true
  },
  observacoes: {
    type: String,
    default: ''
  },
  criadoEm: {
    type: Date,
    default: Date.now
  },
  atualizadoEm: {
    type: Date,
    default: Date.now
  },
  // Novos campos adicionados
  linkId: {
    type: String,
    default: uuidv4,
    unique: true
  },
  status: {
    type: String,
    enum: ['ativa', 'encerrada', 'cancelada'],
    default: 'ativa'
  },
  jogadores: [{
    _id: false,
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Jogador'
    },
    nome: String,
    presente: {
      type: Boolean,
      default: false
    },
    confirmadoEm: Date
  }],
  // Campo para armazenar configurações de compartilhamento
  compartilhamento: {
    linkAtivo: {
      type: Boolean,
      default: true
    },
    expiraEm: {
      type: Date,
      default: null // Null significa que não expira
    }
  }
});

// Middleware para atualizar a data de modificação
partidaSchema.pre('save', function(next) {
  this.atualizadoEm = Date.now();
  
  // Se está marcando como encerrada, desativa o link
  if (this.isModified('status') && this.status !== 'ativa') {
    this.compartilhamento.linkAtivo = false;
  }
  
  next();
});

// Método para confirmar presença
partidaSchema.methods.confirmarPresenca = async function(jogadorId, presente) {
  const jogador = this.jogadores.find(j => j.id.equals(jogadorId));
  
  if (!jogador) {
    throw new Error('Jogador não encontrado na partida');
  }

  jogador.presente = presente;
  jogador.confirmadoEm = new Date();
  return this.save();
};

// Método estático para obter partida ativa
partidaSchema.statics.obterPartidaAtiva = async function() {
  return this.findOne({ 
    status: 'ativa',
    'compartilhamento.linkAtivo': true
  });
};

module.exports = mongoose.model('Partida', partidaSchema);