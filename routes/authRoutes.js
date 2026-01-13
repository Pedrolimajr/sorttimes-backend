const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const User = require('../models/User');

// Rota de cadastro
router.post('/cadastro', async (req, res) => {
  try {
    // Adicione logs para debug
    console.log('Requisição de cadastro recebida:', req.body);

    const { nome, email, senha } = req.body;

    // Verifica se usuário já existe
    const usuarioExiste = await User.findOne({ email });
    if (usuarioExiste) {
      return res.status(400).json({ message: 'Email já cadastrado' });
    }

    // Criptografa a senha
    const salt = await bcrypt.genSalt(10);
    const senhaCriptografada = await bcrypt.hash(senha, salt);

    // Cria o usuário
    const usuario = await User.create({
      nome,
      email,
      senha: senhaCriptografada
    });

    // Gera o token
    const token = jwt.sign(
      { id: usuario._id },
      process.env.JWT_PRIVATE_KEY,
      { expiresIn: '24h' }
    );

    // Remove a senha do objeto de resposta
    const usuarioResponse = {
      id: usuario._id,
      nome: usuario.nome,
      email: usuario.email
    };

    res.status(201).json({
      user: usuarioResponse,
      token
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota de login
router.post('/login', async (req, res) => {
  try {
    console.log('Tentativa de login:', req.body);
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ 
        message: 'Email e senha são obrigatórios' 
      });
    }

    // Busca o usuário e inclui o campo senha
    const usuario = await User.findOne({ email }).select('+senha');
    
    if (!usuario) {
      return res.status(401).json({ message: 'Email ou senha inválidos' });
    }

    // Verifica a senha
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ message: 'Email ou senha inválidos' });
    }

    // Gera o token
    const token = jwt.sign(
      { id: usuario._id },
      process.env.JWT_PRIVATE_KEY,
      { expiresIn: '24h' }
    );

    // Remove a senha antes de enviar
    usuario.senha = undefined;

    res.json({
      user: usuario,
      token
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: process.env.NODE_ENV === 'production' ? 'Erro ao fazer login' : (error.message || 'Erro ao fazer login'), ...(process.env.NODE_ENV !== 'production' ? { stack: error.stack } : {}) });
  }
});

// Rota para atualizar email
router.put('/atualizar-email', auth, async (req, res) => {
  try {
    console.log('[Atualização Email] Iniciando processo...');
    const { novoEmail, senha } = req.body;
    const userId = req.user.id;

    // Valida o formato do ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log('[Atualização Email] ID inválido:', userId);
      return res.status(400).json({ message: 'ID de usuário inválido' });
    }

    console.log('[Atualização Email] Buscando usuário:', userId);
    const usuario = await User.findById(userId).select('+senha');
    
    // Log do resultado da busca
    console.log('[Atualização Email] Resultado da busca:', usuario ? 'Usuário encontrado' : 'Usuário não encontrado');

    if (!usuario) {
      console.log('[Atualização Email] Usuário não encontrado:', userId);
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    console.log('[Atualização Email] Verificando senha...');
    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      console.log('[Atualização Email] Senha inválida');
      return res.status(401).json({ message: 'Senha incorreta' });
    }

    // Verifica se o novo email já está em uso
    console.log('[Atualização Email] Verificando disponibilidade do email');
    const emailExiste = await User.findOne({ email: novoEmail });
    if (emailExiste && emailExiste._id.toString() !== userId) {
      console.log('[Atualização Email] Email já em uso');
      return res.status(400).json({ message: 'Este email já está em uso' });
    }

    console.log('[Atualização Email] Atualizando email...');
    const emailAntigo = usuario.email;
    usuario.email = novoEmail;
    await usuario.save();

    console.log('[Atualização Email] Email atualizado com sucesso:', {
      de: emailAntigo,
      para: novoEmail
    });

    res.json({ 
      success: true,
      message: 'Email atualizado com sucesso',
      user: {
        id: usuario._id,
        nome: usuario.nome,
        email: usuario.email
      }
    });
  } catch (error) {
    console.error('[Atualização Email] Erro:', error);
    res.status(500).json({ 
      message: 'Erro ao atualizar email',
      error: error.message 
    });
  }
});

// Rota para atualizar senha
router.put('/atualizar-senha', auth, async (req, res) => {
  try {
    console.log('[Atualização Senha] Iniciando processo...');
    const { senhaAtual, novaSenha } = req.body;
    const userId = req.user.id;

    console.log('[Atualização Senha] Buscando usuário:', userId);
    const usuario = await User.findById(userId).select('+senha');
    
    if (!usuario) {
      console.log('[Atualização Senha] Usuário não encontrado');
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    console.log('[Atualização Senha] Verificando senha atual...');
    const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha);
    if (!senhaValida) {
      console.log('[Atualização Senha] Senha atual incorreta');
      return res.status(401).json({ message: 'Senha atual incorreta' });
    }

    console.log('[Atualização Senha] Criptografando nova senha...');
    const salt = await bcrypt.genSalt(10);
    usuario.senha = await bcrypt.hash(novaSenha, salt);
    await usuario.save();

    console.log('[Atualização Senha] Senha atualizada com sucesso');
    res.json({ 
      success: true,
      message: 'Senha atualizada com sucesso' 
    });
  } catch (error) {
    console.error('[Atualização Senha] Erro:', error);
    res.status(500).json({ message: 'Erro ao atualizar senha' });
  }
});

// Rota temporária para debug (REMOVER EM PRODUÇÃO)
router.get('/debug/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('+senha');
    console.log('Usuário encontrado:', user);
    res.json({
      found: !!user,
      user: user || null,
      collections: await mongoose.connection.db.listCollections().toArray()
    });
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para verificar token
router.get('/verificar-token', auth, (req, res) => {
  try {
    res.json({ 
      valid: true, 
      userId: req.user.id,
      message: 'Token válido' 
    });
  } catch (error) {
    res.status(401).json({ message: 'Token inválido' });
  }
});

module.exports = router;