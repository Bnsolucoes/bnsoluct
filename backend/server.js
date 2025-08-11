const express = require('express');
const OpenAI = require('openai');
const dotenv = require('dotenv');
const cors = require('cors');
const { enviarNotificacaoLead, enviarConfirmacaoCliente, initializeTransporter } = require('./emailService');

dotenv.config();
const app = express();

// ===== CORS CORRIGIDO =====
const allowedOrigins = [
  'http://localhost:3000',
  'https://site-project-eight.vercel.app' // seu domínio principal
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permite sem origin (chamadas do servidor), domínios autorizados, ou qualquer subdomínio .vercel.app
    if (!origin || allowedOrigins.includes(origin) || 
        (origin && origin.includes('.vercel.app'))) {
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

// ===== Simulação de BD =====
let leads = [];
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
initializeTransporter();

/* ---------------- ROTAS ---------------- */

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

    Promise.all([
      enviarNotificacaoLead(lead).catch(() => false),
      enviarConfirmacaoCliente(lead).catch(() => false)
    ]);

    res.status(200).json({
      success: true,
      message: 'Mensagem recebida com sucesso!',
      lead_id: lead.id
    });
  } catch {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Listar leads
app.get('/api/leads', (req, res) => {
  try {
    const leadsOrdenados = leads.sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao));
    res.json({ success: true, total: leads.length, leads: leadsOrdenados });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar leads' });
  }
});

// Atualizar lead
app.put('/api/leads/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, observacoes } = req.body;
    const idx = leads.findIndex(l => l.id === parseInt(id));
    if (idx === -1) return res.status(404).json({ error: 'Lead não encontrado' });

    leads[idx] = {
      ...leads[idx],
      status: status || leads[idx].status,
      observacoes: observacoes || leads[idx].observacoes,
      data_atualizacao: new Date().toISOString()
    };

    res.json({ success: true, message: 'Lead atualizado', lead: leads[idx] });
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar lead' });
  }
});

// Estatísticas
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const leadsHoje = leads.filter(l => new Date(l.data_criacao).toDateString() === hoje.toDateString()).length;
    const leadsMes = leads.filter(l => new Date(l.data_criacao) >= inicioMes).length;
    const statusCount = leads.reduce((acc, l) => ({ ...acc, [l.status]: (acc[l.status] || 0) + 1 }), {});
    res.json({ success: true, stats: { total: leads.length, hoje: leadsHoje, mes: leadsMes, porStatus: statusCount } });
  } catch {
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
      `Olá! Vi que recebemos um lead de ${lead.nome} (${lead.email}). ${mensagem || ''}`
    )}`;

    res.json({ success: true, whatsapp_url: whatsappUrl });
  } catch {
    res.status(500).json({ error: 'Erro ao gerar URL' });
  }
});

// Chat
const chatHandler = async (req, res) => {
  const userMessage = req.body.message || req.body.prompt;
  if (!userMessage) {
    return res.status(400).json({ error: 'Campo "message" é obrigatório.' });
  }
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 100,
      temperature: 0.7
    });
    res.json({ answer: response.choices[0].message.content.trim() });
  } catch (error) {
    res.status(500).json({ error: `Erro ao processar a requisição: ${error.message}` });
  }
};
app.post('/api/chat', chatHandler);

// Calculadora ROI - CORRIGIDA
app.post('/api/roi-calculator', (req, res) => {
  try {
    const { faturamento_mensal, margem_lucro, investimento_marketing, plano_escolhido } = req.body;
    const faturamento = parseFloat(faturamento_mensal);
    const margem = parseFloat(margem_lucro) / 100;
    const investimento = parseFloat(investimento_marketing);
    
    if (isNaN(faturamento) || isNaN(margem) || isNaN(investimento)) {
      return res.status(400).json({ error: 'Valores numéricos inválidos.' });
    }

    // Percentuais de crescimento mais realistas baseados no faturamento atual
    const crescimento_percent = { 
      'essencial': 0.25,     // 25% de crescimento do faturamento
      'estrategico': 0.40,   // 40% de crescimento do faturamento
      'premium': 0.60        // 60% de crescimento do faturamento
    }[plano_escolhido] || 0.25;

    const lucro_atual = faturamento * margem;
    const aumento_estimado = faturamento * crescimento_percent; // Baseado no faturamento atual
    const novo_faturamento = faturamento + aumento_estimado;
    const novo_lucro = novo_faturamento * margem;
    
    // ROI = (Ganho - Investimento) / Investimento * 100
    const ganho_liquido = novo_lucro - lucro_atual; // Lucro adicional gerado
    const roi_estimado = ((ganho_liquido - investimento) / investimento) * 100;
    
    res.json({
      roi_estimado: Math.round(roi_estimado),
      aumento_faturamento_estimado: Math.round(aumento_estimado),
      novo_faturamento_estimado: Math.round(novo_faturamento)
    });
  } catch (error) {
    res.status(500).json({ error: `Erro ao calcular ROI: ${error.message}` });
  }
});

// Início do servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
