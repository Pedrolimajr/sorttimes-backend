const mongoose = require('mongoose');

const linkPresencaSchema = new mongoose.Schema({
  linkId: {
    type: String,
    required: true,
    unique: true
  },
  jogadores: {
    type: Array,
    required: true
  },
  dataJogo: {
    type: Date,
    required: true
  },
  criadoEm: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('LinkPresenca', linkPresencaSchema);
