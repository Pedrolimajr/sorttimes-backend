const presencaSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('👤 Novo cliente conectado:', socket.id);

    // Entrar em uma sala específica para um link de presença
    socket.on('entrarSala', (linkId) => {
      socket.join(linkId);
      console.log(`👥 Cliente ${socket.id} entrou na sala: ${linkId}`);
    });

    // Atualizar presença de jogador
    socket.on('atualizarPresenca', (data) => {
      const { linkId, jogadorId, presente, jogadorNome } = data;
      
      // Emite para todos na sala exceto o emissor
      socket.to(linkId).emit('presencaAtualizada', {
        jogadorId,
        presente,
        jogadorNome,
        atualizadoEm: new Date().toISOString()
      });
      
      console.log(`🔄 Presença atualizada: ${jogadorNome} - ${presente ? '✅' : '❌'}`);
    });

    // Sair da sala
    socket.on('sairSala', (linkId) => {
      socket.leave(linkId);
      console.log(`👋 Cliente ${socket.id} saiu da sala: ${linkId}`);
    });

    socket.on('disconnect', () => {
      console.log('👋 Cliente desconectado:', socket.id);
    });
  });
};

module.exports = presencaSocket;