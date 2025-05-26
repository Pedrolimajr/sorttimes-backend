const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  senha: {
    type: String,
    required: true,
    select: false
  }
}, {
  timestamps: true,
  collection: 'usuarios' // Define explicitamente o nome da collection
});

// Corrige a exportação do modelo
module.exports = mongoose.model('User', userSchema);