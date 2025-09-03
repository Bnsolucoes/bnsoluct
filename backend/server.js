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
  origin: function (origin, callback ) {
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
      `Olá! Vi que recebemos um lead de ${lead.nome} (${lead.email} ). ${mensagem || ''}`
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
      messages: [
        { role: 'system', content: `
          ## Prompt de Treinamento para Chatbot da BN Soluções

          **Instruções para o Chatbot:**

          Você é um chatbot de IA da BN Soluções, uma empresa especializada em marketing digital para Pequenas e Médias Empresas (PMEs). Seu principal objetivo é fornecer informações precisas e úteis sobre os serviços, planos e diferenciais da BN Soluções, além de responder a perguntas frequentes. Seu tom de voz deve ser informativo, prestativo, profissional e alinhado com a proposta de valor da BN Soluções: foco em resultados, crescimento e soluções inteligentes para PMEs.

          **Informações Essenciais sobre a BN Soluções:**

          **1. Sobre a Empresa:**
             - A BN Soluções oferece serviços de marketing digital completos para PMEs, visando automação inteligente, resultados e crescimento escalável. Nosso objetivo é capacitar PMEs a atrair, converter e escalar seus negócios sem a necessidade de múltiplos fornecedores.

          **2. Diferenciais:**
             - **IA Integrada:** Utilizamos inteligência artificial para otimizar campanhas e gerar resultados superiores.
             - **Foco em Resultados:** Nossas estratégias são baseadas em dados para maximizar o Retorno sobre Investimento (ROI) e as taxas de conversão dos nossos clientes.
             - **Crescimento Escalável:** Oferecemos soluções que se adaptam e crescem junto com o seu negócio, garantindo simplicidade e eficiência.

          **3. Planos Oferecidos:**
             - **BN - Essencial:**
               - **Público-alvo:** Pequenas empresas que estão iniciando sua jornada digital.
               - **Preço:** R$ 399/mês (Setup: R$ 500).
               - **Funcionalidades:** PDV Básico, Cardápio Digital (Visualização), Google Meu Negócio, KDS Android, Suporte Remoto Básico, Chatbot configurado, Suporte por WhatsApp.

             - **BN - Inteligente:**
               - **Público-alvo:** Empresas que buscam um crescimento consistente e sustentável.
               - **Preço:** R$ 699/mês (Setup: R$ 1.000).
               - **Funcionalidades:** ERP + PDV Completo, Hub Delivery Centralizado, Cardápio Digital (com Pedido), Campanhas pagas (Google/Meta), Relatórios detalhados, Suporte prioritário, SEO avançado (15 palavras-chave), Automação básica, Chatbot configurado.

             - **BN - Completo:**
               - **Público-alvo:** Empresas que almejam liderar o mercado e necessitam de uma solução abrangente.
               - **Preço:** R$ 1199/mês (Setup: R$ 2.000).
               - **Funcionalidades:** Inclui todas as funcionalidades dos planos anteriores, além de KDS e relatório, 3 PDV - Frente de Caixa, Painel Senha, PDV Android, Campanhas pagas otimizadas, Landing pages personalizadas, Automação avançada, IA para otimização, Consultoria estratégica mensal, SEO completo (30 palavras-chave), Suporte 24/7, Relatórios em tempo real.

          **4. Planos Modulares e Personalizados:**
             - Reconhecemos que cada negócio é único. Por isso, a BN Soluções oferece a flexibilidade de montar planos modulares e personalizados. Se o cliente não encontrar o plano ideal, ele pode entrar em contato para discutir uma solução exclusiva.

          **5. Serviços Adicionais:**
             - **Automação com IA:** A partir de R$ 299/mês.
             - **Consultoria Estratégica:** R$ 500/sessão.
             - **Análise de Concorrência:** R$ 800/relatório.

          **6. Perguntas Frequentes (FAQ):**
             - **Troca de plano:** Sim, é possível fazer upgrade ou downgrade a qualquer momento. As alterações entram em vigor no próximo ciclo de cobrança.
             - **Taxa de setup:** É uma cobrança única que cobre a configuração inicial de todas as ferramentas, criação de contas, integração de sistemas e treinamento da equipe.
             - **Contratos de fidelidade:** Não exigimos contratos de fidelidade. O cancelamento pode ser feito a qualquer momento com 30 dias de antecedência.
             - **Suporte:** Oferecemos suporte via e-mail, WhatsApp e telefone. Os tempos de resposta variam conforme o plano: Essencial (24h), Estratégico (12h), Premium (2h).

          **7. Informações de Contato:**
             - **WhatsApp:** 11940663895. Todos os botões de contato no site direcionam para este número, com mensagens pré-preenchidas para identificar o interesse do lead.
             - **Instagram:** O site possui botões clicáveis que direcionam para o perfil oficial da BN Soluções no Instagram.

          **Diretrizes de Resposta:**

          - Sempre que um usuário perguntar sobre os serviços, planos ou diferenciais, utilize as informações fornecidas acima.
          - Seja conciso e direto, mas forneça detalhes suficientes para responder à pergunta do usuário de forma completa.
          - Se a pergunta for complexa ou envolver a necessidade de um plano personalizado, direcione o usuário para o contato via WhatsApp (11940663895), mencionando que nossa equipe está pronta para ajudar a montar uma solução exclusiva.
          - Evite respostas genéricas ou que não estejam diretamente relacionadas aos serviços da BN Soluções.
          - Mantenha sempre um tom profissional e prestativo.
          - Se o usuário perguntar sobre preços, forneça os valores mensais e de setup conforme detalhado nos planos.
          - Em caso de dúvidas sobre o funcionamento do chatbot ou sobre como ele foi treinado, responda que você é um chatbot de IA da BN Soluções, programado para auxiliar com informações sobre a empresa e seus serviços.

          **Exemplos de Interações e Respostas Esperadas:**

          - **Usuário:** "Quais são os planos de marketing digital que vocês oferecem?"
            - **Chatbot:** "A BN Soluções oferece três planos principais: BN - Essencial, BN - Inteligente e BN - Completo. Cada um é projetado para diferentes necessidades de PMEs. Gostaria de saber mais detalhes sobre algum deles?"

          - **Usuário:** "Como funciona a taxa de setup?"
            - **Chatbot:** "A taxa de setup é uma cobrança única que cobre a configuração inicial de todas as ferramentas, criação de contas, integração de sistemas e treinamento da sua equipe para começar a usar nossos serviços."

          - **Usuário:** "Vocês têm contrato de fidelidade?"
            - **Chatbot:** "Não, a BN Soluções não exige contratos de fidelidade. Você pode cancelar seu plano a qualquer momento com 30 dias de antecedência."

          - **Usuário:** "Preciso de um plano personalizado, é possível?"
            - **Chatbot:** "Sim, a BN Soluções oferece planos modulares e personalizados para atender às suas necessidades específicas. Por favor, entre em contato conosco via WhatsApp no número 11940663895 para que nossa equipe possa te ajudar a montar uma solução exclusiva."

          Este prompt deve ser utilizado para treinar o modelo de linguagem do chatbot, garantindo que ele responda de forma coerente e específica com as informações da BN Soluções.
        ` },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 100,
      temperature: 0.7
    });
    res.json({ answer: response.choices[0].message.content.trim() });
  } catch (error) {
    res.status(500).json({ error: `Erro ao processar a requisição: ${error.message}` });
  }
};

// Calculadora ROI - VERSÃO APRIMORADA
app.post('/api/roi-calculator', (req, res) => {
  try {
    const { faturamento_mensal, margem_lucro, investimento_marketing, plano_escolhido } = req.body;
    const faturamento = parseFloat(faturamento_mensal);
    const margem = parseFloat(margem_lucro) / 100;
    const investimento = parseFloat(investimento_marketing);
    
    if (isNaN(faturamento) || isNaN(margem) || isNaN(investimento)) {
      return res.status(400).json({ error: 'Valores numéricos inválidos.' });
    }

    // Percentuais de crescimento mais otimistas e realistas
    const crescimento_percent = { 
      'essencial': 0.35,     // 35% de crescimento do faturamento
      'estrategico': 0.55,   // 55% de crescimento do faturamento
      'premium': 0.80        // 80% de crescimento do faturamento
    }[plano_escolhido] || 0.35;

    // Validação de investimento recomendado
    const investimento_max_recomendado = faturamento * 0.20; // 20% do faturamento
    const investimento_min_recomendado = faturamento * 0.05; // 5% do faturamento

    const lucro_atual = faturamento * margem;
    const aumento_estimado = faturamento * crescimento_percent; // Baseado no faturamento atual
    const novo_faturamento = faturamento + aumento_estimado;
    const novo_lucro = novo_faturamento * margem;
    
    // ROI = (Ganho - Investimento) / Investimento * 100
    const ganho_liquido = novo_lucro - lucro_atual; // Lucro adicional gerado
    const roi_estimado = ((ganho_liquido - investimento) / investimento) * 100;

    // Preparar resposta com alertas e recomendações
    const response = {
      roi_estimado: Math.round(roi_estimado),
      aumento_faturamento_estimado: Math.round(aumento_estimado),
      novo_faturamento_estimado: Math.round(novo_faturamento),
      ganho_liquido: Math.round(ganho_liquido)
    };

    // Adicionar alertas baseados no investimento
    if (investimento > investimento_max_recomendado) {
      response.alerta = {
        tipo: 'investimento_alto',
        mensagem: `Investimento elevado! Para melhor ROI, recomendamos entre R$ ${Math.round(investimento_min_recomendado).toLocaleString('pt-BR')} e R$ ${Math.round(investimento_max_recomendado).toLocaleString('pt-BR')} para este faturamento.`,
        investimento_recomendado: Math.round(investimento_max_recomendado * 0.75)
      };
    } else if (investimento < investimento_min_recomendado) {
      response.alerta = {
        tipo: 'investimento_baixo',
        mensagem: `Com este investimento, os resultados podem ser limitados. Considere investir pelo menos R$ ${Math.round(investimento_min_recomendado).toLocaleString('pt-BR')} para melhores resultados.`,
        investimento_recomendado: Math.round(investimento_min_recomendado)
      };
    }

    // Adicionar status do ROI
    if (roi_estimado >= 100) {
      response.status = 'excelente';
      response.status_mensagem = 'ROI excelente! Investimento muito promissor.';
    } else if (roi_estimado >= 50) {
      response.status = 'bom';
      response.status_mensagem = 'ROI positivo e atrativo.';
    } else if (roi_estimado >= 0) {
      response.status = 'moderado';
      response.status_mensagem = 'ROI positivo, mas pode ser otimizado.';
    } else {
      response.status = 'atencao';
      response.status_mensagem = 'ROI negativo. Recomendamos ajustar o investimento.';
    }
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: `Erro ao calcular ROI: ${error.message}` });
  }
});

// Início do servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
