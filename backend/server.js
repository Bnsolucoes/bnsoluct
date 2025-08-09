const express = require('express');
const OpenAI = require('openai');
const dotenv = require('dotenv');
const cors = require('cors');
const { enviarNotificacaoLead, enviarConfirmacaoCliente, initializeTransporter } = require('./emailService');

// Carregar variáveis de ambiente PRIMEIRO
dotenv.config();

const app = express();

// Configuração do CORS para permitir requisições do frontend
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.vercel.app', 'https://*.vercel.app']
    : 'http://localhost:3000',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
};

// Aplica o middleware do CORS com as opções definidas
app.use(cors(corsOptions));

// Middleware para interpretar o corpo das requisições como JSON
app.use(express.json());

// Array para armazenar leads (simulando banco de dados)
let leads = [];

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Inicializar transporter de e-mail DEPOIS do dotenv
initializeTransporter();

// Endpoint para envio de leads/mensagens do formulário de contato
app.post('/api/leads', async (req, res) => {
  const { nome, email, telefone, empresa, mensagem, origem } = req.body;
  
  try {
    // Validação básica
    if (!nome || !email || !mensagem) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios não preenchidos',
        required: ['nome', 'email', 'mensagem']
      });
    }

    // Criar objeto do lead
    const lead = {
      id: Date.now(),
      nome,
      email,
      telefone: telefone || 'Não informado',
      empresa: empresa || 'Não informado',
      mensagem,
      origem: origem || 'website',
      status: 'novo',
      data_criacao: new Date().toISOString(),
      data_atualizacao: new Date().toISOString()
    };

    // Adicionar ao array de leads
    leads.push(lead);

    // Log da mensagem recebida
    console.log('🎯 Novo lead recebido:', {
      id: lead.id,
      nome,
      email,
      telefone: telefone || 'não informado',
      empresa: empresa || 'não informado',
      origem: origem || 'website',
      timestamp: new Date().toISOString()
    });

    // Enviar e-mails (assíncrono - não bloqueia a resposta)
    Promise.all([
      enviarNotificacaoLead(lead).catch(error => {
        console.log('❌ Erro ao enviar notificação:', error.message);
        return false;
      }),
      enviarConfirmacaoCliente(lead).catch(error => {
        console.log('❌ Erro ao enviar confirmação:', error.message);
        return false;
      })
    ]).then(([notificacaoEnviada, confirmacaoEnviada]) => {
      console.log('📧 Status dos e-mails:', {
        notificacao: notificacaoEnviada ? '✅ Enviado' : '❌ Erro',
        confirmacao: confirmacaoEnviada ? '✅ Enviado' : '❌ Erro'
      });
      
      // Se os e-mails falharam, logar para debug
      if (!notificacaoEnviada || !confirmacaoEnviada) {
        console.log('🔍 Debug - Configurações de e-mail:');
        console.log('  Username:', process.env.SMTP_USERNAME);
        console.log('  Password length:', process.env.SMTP_PASSWORD ? process.env.SMTP_PASSWORD.length : 'não definida');
      }
    }).catch(error => {
      console.error('❌ Erro geral ao enviar e-mails:', error.message);
    });

    // Retornar sucesso
    res.status(200).json({ 
      success: true,
      message: 'Mensagem recebida com sucesso! Entraremos em contato em breve.',
      lead_id: lead.id
    });

  } catch (error) {
    console.error('❌ Erro ao processar lead:', error.message);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: 'Tente novamente ou entre em contato pelo WhatsApp.'
    });
  }
});

// Endpoint para listar todos os leads (Dashboard Admin)
app.get('/api/leads', (req, res) => {
  try {
    const leadsOrdenados = leads.sort((a, b) => 
      new Date(b.data_criacao) - new Date(a.data_criacao)
    );
    
    res.json({
      success: true,
      total: leads.length,
      leads: leadsOrdenados
    });
  } catch (error) {
    console.error('❌ Erro ao listar leads:', error.message);
    res.status(500).json({ error: 'Erro ao buscar leads' });
  }
});

// Endpoint para atualizar status do lead
app.put('/api/leads/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, observacoes } = req.body;
    
    const leadIndex = leads.findIndex(lead => lead.id === parseInt(id));
    
    if (leadIndex === -1) {
      return res.status(404).json({ error: 'Lead não encontrado' });
    }
    
    leads[leadIndex] = {
      ...leads[leadIndex],
      status: status || leads[leadIndex].status,
      observacoes: observacoes || leads[leadIndex].observacoes,
      data_atualizacao: new Date().toISOString()
    };
    
    res.json({
      success: true,
      message: 'Lead atualizado com sucesso',
      lead: leads[leadIndex]
    });
    
  } catch (error) {
    console.error('❌ Erro ao atualizar lead:', error.message);
    res.status(500).json({ error: 'Erro ao atualizar lead' });
  }
});

// Endpoint para estatísticas do dashboard
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    
    const leadsHoje = leads.filter(lead => 
      new Date(lead.data_criacao).toDateString() === hoje.toDateString()
    ).length;
    
    const leadsMes = leads.filter(lead => 
      new Date(lead.data_criacao) >= inicioMes
    ).length;
    
    const statusCount = leads.reduce((acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    }, {});
    
    const origemCount = leads.reduce((acc, lead) => {
      acc[lead.origem] = (acc[lead.origem] || 0) + 1;
      return acc;
    }, {});
    
    res.json({
      success: true,
      stats: {
        total: leads.length,
        hoje: leadsHoje,
        mes: leadsMes,
        porStatus: statusCount,
        porOrigem: origemCount
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar estatísticas:', error.message);
    res.status(500).json({ error: 'Erro ao gerar estatísticas' });
  }
});

// Endpoint para integração com WhatsApp
app.post('/api/whatsapp/notify', async (req, res) => {
  try {
    const { leadId, mensagem } = req.body;
    
    const lead = leads.find(l => l.id === parseInt(leadId));
    if (!lead) {
      return res.status(404).json({ error: 'Lead não encontrado' });
    }
    
    // URL do WhatsApp com mensagem personalizada
    const whatsappUrl = `https://wa.me/5511940663895?text=${encodeURIComponent(
      `Olá! Vi que recebemos um lead de ${lead.nome} (${lead.email} ). ${mensagem || 'Posso ajudar com o atendimento?'}`
    )}`;
    
    res.json({
      success: true,
      whatsapp_url: whatsappUrl,
      message: 'URL do WhatsApp gerada com sucesso'
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar URL do WhatsApp:', error.message);
    res.status(500).json({ error: 'Erro ao gerar URL do WhatsApp' });
  }
});

// Endpoint do Chat
app.post('/chat', async (req, res) => {
  const { prompt } = req.body;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.7,
    });
    res.json({ answer: response.choices[0].message.content.trim() });
  } catch (error) {
    console.error('Erro detalhado:', error.message);
    res.status(500).json({ error: `Erro ao processar a requisição: ${error.message}` });
  }
});

// Endpoint da Calculadora de ROI
app.post('/api/roi-calculator', async (req, res) => {
  const { faturamento_mensal, margem_lucro, investimento_marketing, plano_escolhido, email } = req.body;
  
  try {
    // Lógica de cálculo de ROI
    const faturamento = parseFloat(faturamento_mensal);
    const margem = parseFloat(margem_lucro) / 100;
    const investimento = parseFloat(investimento_marketing);
    
    // Multiplicadores baseados no plano
    const multiplicadores = {
      'essencial': 1.2,
      'estrategico': 1.5,
      'premium': 2.0
    };
    
    const multiplicador = multiplicadores[plano_escolhido] || 1.2;
    
    // Cálculo do ROI estimado
    const lucro_atual = faturamento * margem;
    const aumento_estimado = investimento * multiplicador;
    const novo_faturamento = faturamento + aumento_estimado;
    const novo_lucro = novo_faturamento * margem;
    const roi_estimado = ((novo_lucro - lucro_atual - investimento) / investimento) * 100;
    
    const resultado = {
      roi_estimado: Math.round(roi_estimado),
      aumento_faturamento_estimado: Math.round(aumento_estimado),
      novo_faturamento_estimado: Math.round(novo_faturamento),
      plano_recomendado: plano_escolhido,
      economia_anual: Math.round((novo_lucro - lucro_atual) * 12)
    };
    
    // Log para monitoramento
    console.log('Cálculo ROI realizado:', {
      plano: plano_escolhido,
      roi: resultado.roi_estimado,
      email: email || 'não informado'
    });
    
    res.json(resultado);
    
  } catch (error) {
    console.error('Erro no cálculo de ROI:', error.message);
    res.status(500).json({ error: `Erro ao calcular ROI: ${error.message}` });
  }
});

const PORT = process.env.PORT || 3001;

// Para desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
}

// Export para Vercel serverless functions
module.exports = app;