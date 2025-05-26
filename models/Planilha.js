const mongoose = require('mongoose');

const PlanilhaSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: [true, 'O título é obrigatório'],
    trim: true,
    maxlength: [100, 'O título não pode ter mais que 100 caracteres'],
    index: true
  },
  subtitulo: {
    type: String,
    trim: true,
    maxlength: [200, 'O subtítulo não pode ter mais que 200 caracteres']
  },
  tabela: {
    type: [[String]],
    required: [true, 'A tabela é obrigatória'],
    validate: {
      validator: function(v) {
        return Array.isArray(v) && 
               v.length > 0 && 
               v.every(row => Array.isArray(row)) &&
               v.every(row => row.every(cell => typeof cell === 'string'));
      },
      message: 'A tabela deve ser um array bidimensional de strings com pelo menos uma linha'
    }
  },
  dataCriacao: {
    type: Date,
    default: Date.now
  },
  dataAtualizacao: {
    type: Date,
    default: Date.now
  }
});

// Atualiza dataAtualizacao automaticamente antes de salvar
PlanilhaSchema.pre('save', function(next) {
  this.dataAtualizacao = Date.now();
  next();
});

// Método estático para busca por título
PlanilhaSchema.statics.findByTitle = function(title) {
  return this.find({ titulo: new RegExp(title, 'i') });
};

module.exports = mongoose.model('Planilha', PlanilhaSchema);