const mongoose = require('mongoose');

const LinkPartidaSchema = new mongoose.Schema({
  linkId: { type: String, required: true, unique: true },
  partidaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partida', required: true },
  expireAt: { type: Date, required: true }
});

// O índice TTL será configurado no server.js para garantir consistência
module.exports = mongoose.model('LinkPartida', LinkPartidaSchema);