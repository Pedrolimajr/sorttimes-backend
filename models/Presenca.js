const mongoose = require('mongoose');

const presencaSchema = new mongoose.Schema({
  linkId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  dataJogo: {
    type: Date,
    required: true
  },
  jogadores: [{
    id: {
      type: String,
      required: true
    },
    nome: {
      type: String,
      required: true
    },
    presente: {
      type: Boolean,
      default: false
    }
  }],
  dataCriacao: {
    type: Date,
    default: Date.now,
    expires: 86400 // Expira em 24h
  }
});

module.exports = mongoose.model('Presenca', presencaSchema);