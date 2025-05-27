const mongoose = require('mongoose');

const presencaSchema = new mongoose.Schema({
  linkId: {
    type: String,
    required: true,
    unique: true
  },
  dataJogo: {
    type: Date,
    required: true
  },
  jogadores: [{
    id: String,
    nome: String,
    presente: Boolean
  }],
  dataCriacao: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Presenca', presencaSchema);