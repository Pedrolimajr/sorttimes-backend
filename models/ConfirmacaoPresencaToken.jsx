import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaUser, FaCheckCircle, FaTimesCircle, FaSpinner } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { toast, ToastContainer } from 'react-toastify';
import api from '../services/api';

export default function ConfirmacaoPresencaToken() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [jogador, setJogador] = useState(null);
  const [linkId, setLinkId] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const validarToken = async () => {
      if (!token) {
        setErro('Token de convite não encontrado.');
        setCarregando(false);
        return;
      }

      try {
        const response = await api.get(`/validar-convite/${token}`);
        if (response.data.success) {
          setJogador(response.data.data.jogador);
          setLinkId(response.data.data.linkId);
        } else {
          throw new Error(response.data.message);
        }
      } catch (error) {
        setErro(error.response?.data?.message || 'Convite inválido ou expirado.');
      } finally {
        setCarregando(false);
      }
    };

    validarToken();
  }, [token]);

  const handleConfirmarPresenca = async (presente) => {
    if (!linkId || !token) return;

    setProcessando(true);
    try {
      await api.post(`/presenca/${linkId}/confirmar`, {
        presente,
        token, // Envia o token para autenticação no backend
      });
      setJogador({ ...jogador, presente });
      toast.success(`Presença ${presente ? 'confirmada' : 'desmarcada'} com sucesso!`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erro ao registrar presença.');
    } finally {
      setProcessando(false);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <FaSpinner className="animate-spin text-4xl text-blue-500" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white p-4 text-center">
        <FaTimesCircle className="text-5xl text-red-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Acesso Negado</h1>
        <p className="text-gray-400">{erro}</p>
        <button onClick={() => navigate('/')} className="mt-6 bg-blue-600 px-4 py-2 rounded-lg">Voltar ao Início</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <ToastContainer theme="dark" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-gray-800/50 backdrop-blur-lg rounded-2xl shadow-2xl p-8 text-center border border-gray-700"
      >
        {jogador.foto ? (
          <img src={jogador.foto} alt={jogador.nome} className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-blue-500 object-cover" />
        ) : (
          <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-4 border-4 border-blue-500">
            <FaUser className="text-4xl text-gray-400" />
          </div>
        )}

        <h1 className="text-2xl font-bold text-white">Olá, {jogador.nome}!</h1>
        <p className="text-gray-400 mt-2 mb-6">Confirme sua presença para o próximo baba.</p>

        {jogador.presente ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="bg-green-500/10 text-green-400 p-4 rounded-lg mb-6 border border-green-500/20">
              <p className="font-bold">Sua presença está confirmada!</p>
            </div>
            <button
              onClick={() => handleConfirmarPresenca(false)}
              disabled={processando}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {processando ? <FaSpinner className="animate-spin" /> : <FaTimesCircle />}
              Desmarcar Presença
            </button>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="bg-yellow-500/10 text-yellow-400 p-4 rounded-lg mb-6 border border-yellow-500/20">
              <p className="font-bold">Aguardando sua confirmação.</p>
            </div>
            <button
              onClick={() => handleConfirmarPresenca(true)}
              disabled={processando}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {processando ? <FaSpinner className="animate-spin" /> : <FaCheckCircle />}
              Confirmar Presença
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}