const express = require('express');
const OpenAI = require('openai');
const dotenv = require('dotenv');
const cors = require('cors');
const { enviarNotificacaoLead, enviarConfirmacaoCliente, initializeTransporter } = require('./emailService');

// Carregar variáveis de ambiente
dotenv.config();

const app = express();

// Lista de domínios que podem acessar o backend
const allowedOrigins = [
  'http://localhost:3000', // desenvolvimento local
  'https://site-project-xxxx.vercel.app', // substitua pelo seu domínio real no Vercel
  'https://bnsoluct.vercel.app' // caso tenha domínio final customizado
];

// Configuração do CORS
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Não permitido pelo CORS: ${origin}`));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json());

// Array para armazenar leads
let leads = [];

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Inicializar transporter de e-mail
initializeTransporter();

/* -------- ROTAS -------- */

// Receber lead
app.post('/api/leads', async (req, res) => {
  const { nome, email, telefone, empresa, mensagem, origem } = req.body;
  
  try {
    if (!nome || !email || !mensagem) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios não preenchidos',
        required: ['nome', 'email', 'mensagem']
      });
    }

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

    leads.push(lead);

    console.log('🎯 Novo lead recebido:', lead);

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
    });

    res.status(200).json({ 
      success: true,
      message: 'Mensagem recebida com sucesso! Entraremos em contato em breve.',
      lead_id: lead.id
    });

  } catch (error) {
    console.error('❌ Erro ao processar lead:', error.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Listar leads
app.get('/api/leads', (req, res) => {
  try {
    const leadsOrdenados = leads.sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao));
    res.json({ success: true, total: leads.length, leads: leadsOrdenados });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar leads' });
  }
});

// Atualizar lead
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
    res.json({ success: true, message: 'Lead atualizado com sucesso', lead: leads[leadIndex] });
    
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar lead' });
  }
});

// Estatísticas do Dashboard
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    
    const leadsHoje = leads.filter(l => new Date(l.data_criacao).toDateString() === hoje.toDateString()).length;
    const leadsMes = leads.filter(l => new Date(l.data_criacao) >= inicioMes).length;

    const statusCount = leads.reduce((acc, lead) => { acc[lead.status] = (acc[lead.status] || 0) + 1; return acc; }, {});
    const origemCount = leads.reduce((acc, lead) => { acc[lead.origem] = (acc[lead.origem] || 0) + 1; return acc; }, {});

    res.json({
      success: true,
      stats: { total: leads.length, hoje: leadsHoje, mes: leadsMes, porStatus: statusCount, porOrigem: origemCount }
    });

  } catch (error) {
    res.status(500).json({ error: 'Erro ao gerar estatísticas' });
  }
});

// WhatsApp notify
app.post('/api/whatsapp/notify', (req, res) => {
  try {
    const { leadId, mensagem } = req.body;
    const lead = leads.find(l => l.id === parseInt(leadId));
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

    const whatsappUrl = `https://wa.me/5511940663895?text=${encodeURIComponent(
      `Olá! Vi que recebemos um lead de ${lead.nome} (${lead.email}). ${mensagem || 'Posso ajudar com o atendimento?'}`
    )}`;

    res.json({ success: true, whatsapp_url: whatsappUrl, message: 'URL do WhatsApp gerada com sucesso' });

  } catch (error) {
    res.status(500).json({ error: 'Erro ao gerar URL do WhatsApp' });
  }
});

// Chat
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
    res.status(500).json({ error: `Erro ao processar: ${error.message}` });
  }
});

// Calculadora ROI
app.post('/api/roi-calculator', (req, res) => {
  try {
    const { faturamento_mensal, margem_lucro, investimento_marketing, plano_escolhido, email } = req.body;
    const faturamento = parseFloat(faturamento_mensal);
    const margem = parseFloat(margem_lucro) / 100;
    const investimento = parseFloat(investimento_marketing);
    const multiplicadores = { 'essencial': 1.2, 'estrategico': 1.5, 'premium': 2.0 };
    const multiplicador = multiplicadores[plano_escolhido] || 1.2;

    const lucro_atual = faturamento * margem;
    const aumento_estimado = investimento * multiplicador;
    const novo_faturamento = faturamento + aumento_estimado;
    const novo_lucro = novo_faturamento * margem;
    const roi_estimado = ((novo_lucro - lucro_atual - investimento) / investimento) * 100;

    res.json({
      roi_estimado: Math.round(roi_estimado),
      aumento_faturamento_estimado: Math.round(aumento_estimado),
      novo_faturamento_estimado: Math.round(novo_faturamento),
      plano_recomendado: plano_escolhido,
      economia_anual: Math.round((novo_lucro - lucro_atual) * 12)
    });

  } catch (error) {
    res.status(500).json({ error: `Erro ao calcular ROI: ${error.message}` });
  }
});

// Porta
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
