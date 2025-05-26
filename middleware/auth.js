const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ message: 'Token não fornecido' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_PRIVATE_KEY);
    
    if (!decoded.id) {
      return res.status(401).json({ message: 'Token inválido' });
    }

    req.user = { id: decoded.id };
    next();
  } catch (error) {
    console.error('Erro de autenticação:', error);
    return res.status(401).json({ 
      message: 'Token inválido ou expirado',
      error: error.message 
    });
  }
};

module.exports = auth;