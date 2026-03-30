const mongoose = require('mongoose');

const partidaSchema = new mongoose.Schema({
  data: { type: Date, required: true },
  horario: { type: String, required: true },
  local: { type: String, required: true },
  observacoes: { type: String, default: '' },
  gols: [{ 
    jogador: String, 
    horario: { type: Date, default: Date.now } 
  }],
  cartoesAmarelos: [String],
  cartoesVermelhos: [String],
  cartoesAzuis: [String],
  destaques: {
    melhorPartida: { type: String, default: '' },
    perebaPartida: { type: String, default: '' },
    golMaisBonito: { type: String, default: '' }
  },
  encerrada: { type: Boolean, default: false },
  criadoEm: { type: Date, default: Date.now },
  atualizadoEm: { type: Date, default: Date.now }
}, { timestamps: true });

// Atualizar a data de atualização antes de salvar
partidaSchema.pre('save', function(next) {
  this.atualizadoEm = Date.now();
  next();
});

module.exports = mongoose.model('Partida', partidaSchema);