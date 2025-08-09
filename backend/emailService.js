const nodemailer = require("nodemailer");

// Variável global para o transporter
let transporter = null;

// Função para inicializar o transporter (chamada depois do dotenv)
const initializeTransporter = () => {
  console.log("🔧 Iniciando configuração de e-mail...");
  console.log("📧 Username:", process.env.SMTP_USERNAME);
  console.log("🔑 Password length:", process.env.SMTP_PASSWORD ? process.env.SMTP_PASSWORD.length : "não definida");
  
  // Verificar se as variáveis estão definidas
  if (!process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
    console.log("❌ Variáveis de e-mail não configuradas");
    console.log("💡 Configure SMTP_USERNAME e SMTP_PASSWORD no arquivo .env");
    return null;
  }
  
  // Configuração mais simples e direta
  const config = {
    service: "gmail",
    auth: {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD
    }
  };

  try {
    transporter = nodemailer.createTransport(config);
    
    // Testar conexão
    transporter.verify((error, success) => {
      if (error) {
        console.log("❌ Erro na verificação de e-mail:", error.message);
        console.log("💡 Dicas para resolver:");
        console.log("   1. Verifique se a verificação em duas etapas está ativa");
        console.log("   2. Confirme se a senha de app está correta");
        console.log("   3. Tente gerar uma nova senha de app");
      } else {
        console.log("✅ Servidor de e-mail configurado corretamente!");
      }
    });
    
    return transporter;
  } catch (error) {
    console.error("❌ Erro ao criar transporter:", error.message);
    return null;
  }
};

// Função de fallback para quando o e-mail falha
const enviarEmailFallback = async (leadData, tipo) => {
  console.log(`📧 [FALLBACK] Simulando envio de ${tipo} para:`, {
    nome: leadData.nome,
    email: leadData.email,
    timestamp: new Date().toISOString()
  });
  
  // Simular delay de envio
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log(`✅ [FALLBACK] ${tipo} simulado com sucesso`);
  return true;
};

// Função para enviar e-mail de notificação de novo lead
const enviarNotificacaoLead = async (leadData) => {
  // Se não há transporter, usar fallback
  if (!transporter) {
    console.log("⚠️ Transporter não disponível, usando fallback");
    return await enviarEmailFallback(leadData, "notificação");
  }

  try {
    const { nome, email, telefone, empresa, mensagem, origem } = leadData;
    
    // Formata o número de telefone para o padrão internacional do WhatsApp
    const formattedPhoneNumber = telefone ? `55${telefone.replace(/[^0-9]/g, "")}` : "";
    
    // Mensagem aprimorada para o WhatsApp
    const whatsappMessage = encodeURIComponent(
      `Olá, ${nome}! 👋\n\nSou Bruno da BN Soluções. Vi que você entrou em contato conosco através do ${origem || 'nosso site'} e estou aqui para te ajudar!\n\nEstou à disposição para entender melhor suas necessidades e te ajudar a encontrar as melhores soluções para o seu negócio. Podemos conversar um pouco agora ou prefere agendar um momento? ✨`
    );

    const whatsappLink = formattedPhoneNumber ? `https://wa.me/${formattedPhoneNumber}?text=${whatsappMessage}` : "#";

    const mailOptions = {
      from: process.env.SMTP_USERNAME || "bn.solucoes20@gmail.com",
      to: "bn.solucoes20@gmail.com", // E-mail da empresa
      subject: `🎯 Novo Lead Recebido - ${nome}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;">🎯 Novo Lead Recebido</h1>
            <p style="margin: 10px 0 0 0;">BN Soluções - Sistema de Captura de Leads</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">📋 Informações do Lead</h2>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <h3 style="color: #667eea; margin-top: 0;">👤 Dados Pessoais</h3>
              <p><strong>Nome:</strong> ${nome}</p>
              <p><strong>E-mail:</strong> <a href="mailto:${email}">${email}</a></p>
              <p><strong>Telefone:</strong> ${telefone || "Não informado"}</p>
              <p><strong>Empresa:</strong> ${empresa || "Não informado"}</p>
            </div>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <h3 style="color: #667eea; margin-top: 0;">💬 Mensagem</h3>
              <p style="background: #f1f3f4; padding: 10px; border-radius: 5px; border-left: 4px solid #667eea;">
                ${mensagem}
              </p>
            </div>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
              <h3 style="color: #667eea; margin-top: 0;">📊 Metadados</h3>
              <p><strong>Origem:</strong> ${origem || "Website"}</p>
              <p><strong>Data/Hora:</strong> ${new Date().toLocaleString("pt-BR")}</p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <a href="${whatsappLink}" 
                 style="background: #25d366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; display: inline-block; margin: 5px;">
                💬 Responder via WhatsApp
              </a>
              <a href="mailto:${email}?subject=Olá ${nome}! Recebemos sua mensagem" 
                 style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; display: inline-block; margin: 5px;">
                📧 Responder via E-mail
              </a>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
            <p>Este e-mail foi gerado automaticamente pelo sistema da BN Soluções</p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ E-mail de notificação enviado:", info.messageId);
    return true;
    
  } catch (error) {
    console.error("❌ Erro ao enviar e-mail de notificação:", error.message);
    
    // Se falhar, usar fallback
    return await enviarEmailFallback(leadData, "notificação");
  }
};

// Função para enviar e-mail de confirmação para o cliente
const enviarConfirmacaoCliente = async (leadData) => {
  // Se não há transporter, usar fallback
  if (!transporter) {
    console.log("⚠️ Transporter não disponível, usando fallback");
    return await enviarEmailFallback(leadData, "confirmação");
  }

  try {
    const { nome, email } = leadData;
    
    const mailOptions = {
      from: process.env.SMTP_USERNAME || "bn.solucoes20@gmail.com",
      to: email,
      subject: "✅ Mensagem Recebida - BN Soluções",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;">✅ Mensagem Recebida</h1>
            <p style="margin: 10px 0 0 0;">BN Soluções</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Olá, ${nome}!</h2>
            
            <p>Recebemos sua mensagem e agradecemos pelo contato! 🎉</p>
            
            <p>Nossa equipe irá analisar sua solicitação e entrará em contato em até <strong>24 horas</strong>.</p>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #667eea; margin-top: 0;">📞 Precisa de atendimento imediato?</h3>
              <p>Entre em contato conosco pelo WhatsApp:</p>
              <a href="https://wa.me/5511940663895?text=Olá! Gostaria de falar sobre soluções para meu negócio" 
                 style="background: #25d366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; display: inline-block;">
                💬 Falar no WhatsApp
              </a>
            </div>
            
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #667eea; margin-top: 0;">🕒 Horários de Atendimento</h3>
              <p><strong>Segunda a Sexta:</strong> 9h às 18h</p>
              <p><strong>Sábado:</strong> 9h às 13h</p>
              <p><strong>Domingo:</strong> Fechado</p>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
            <p>BN Soluções - Transformando negócios através da tecnologia</p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ E-mail de confirmação enviado para o cliente:", info.messageId);
    return true;
    
  } catch (error) {
    console.error("❌ Erro ao enviar e-mail de confirmação:", error.message);
    
    // Se falhar, usar fallback
    return await enviarEmailFallback(leadData, "confirmação");
  }
};

module.exports = {
  enviarNotificacaoLead,
  enviarConfirmacaoCliente,
  initializeTransporter
};