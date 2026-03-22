/**
 * support.js
 * Bundle i18n (mesmo padrão do profile.js)
 * - Base com 17 locales
 * - Expande para 26 locales (fallback por idioma)
 *
 * Observação:
 * - O email de suporte NÃO é traduzido (pedido do Eduardo).
 */

function expandTo26Locales(base) {
  // 17 base (iguais aos seus bundles)
  const wanted = [
    "pt-BR",
    "pt-PT",
    "en-US",
    "en-GB",
    "en-SG",
    "es-ES",
    "fr-FR",
    "de-DE",
    "it-IT",
    "ar-AE",
    "hi-IN",
    "id-ID",
    "fil-PH",
    "ms-MY",
    "th-TH",
    "vi-VN",
    "zh-HK",
    // +9 para fechar 26 (fallback por família)
    "es-MX",
    "fr-CA",
    "de-AT",
    "it-CH",
    "ar-SA",
    "hi",
    "id",
    "ms",
    "pt",
  ];

  const out = { ...base };

  const pickFallback = (lng) => {
    const key = String(lng || "").trim();
    if (out[key]) return key;
    const family = key.split("-")[0];
    if (family === "pt") return out["pt-BR"] ? "pt-BR" : Object.keys(out)[0];
    if (family === "en") return out["en-US"] ? "en-US" : Object.keys(out)[0];
    if (family === "es") return out["es-ES"] ? "es-ES" : Object.keys(out)[0];
    if (family === "fr") return out["fr-FR"] ? "fr-FR" : Object.keys(out)[0];
    if (family === "de") return out["de-DE"] ? "de-DE" : Object.keys(out)[0];
    if (family === "it") return out["it-IT"] ? "it-IT" : Object.keys(out)[0];
    if (family === "ar") return out["ar-AE"] ? "ar-AE" : Object.keys(out)[0];
    if (family === "hi") return out["hi-IN"] ? "hi-IN" : Object.keys(out)[0];
    if (family === "id") return out["id-ID"] ? "id-ID" : Object.keys(out)[0];
    if (family === "fil") return out["fil-PH"] ? "fil-PH" : Object.keys(out)[0];
    if (family === "ms") return out["ms-MY"] ? "ms-MY" : Object.keys(out)[0];
    if (family === "th") return out["th-TH"] ? "th-TH" : Object.keys(out)[0];
    if (family === "vi") return out["vi-VN"] ? "vi-VN" : Object.keys(out)[0];
    if (family === "zh") return out["zh-HK"] ? "zh-HK" : Object.keys(out)[0];
    return Object.keys(out)[0];
  };

  for (const lng of wanted) {
    if (out[lng]) continue;
    const fb = pickFallback(lng);
    out[lng] = out[fb];
  }

  return out;
}

const base = {
  "pt-BR": {
    support: {
      aria: { label: "Suporte" },
      common: { close: "Fechar" },
      title: { prefix: "Suporte" },
      subtitle: "Ajude-nos a melhorar!",
      text: {
        p1:
          "Valorizamos sua experiência em nossa plataforma e agradecemos qualquer feedback que possa nos ajudar a nos tornar a melhor corretora do mercado.",
        p2:
          "Se você encontrar algum bug ou erro, por favor, entre em contato conosco imediatamente.",
        p3a:
          "Além disso, estamos sempre abertos a receber sugestões e críticas construtivas sobre nossos serviços.",
        p3b:
          "Sua opinião é fundamental para aprimorar a experiência de nossos usuários.",
        contact_prefix: "Para entrar em contato, envie um email para",
        p4:
          "Muito obrigado por sua ajuda e, mais uma vez, seja bem-vindo à revolução.",
      },
    },
  },

  "pt-PT": {
    support: {
      aria: { label: "Suporte" },
      common: { close: "Fechar" },
      title: { prefix: "Suporte" },
      subtitle: "Ajude-nos a melhorar!",
      text: {
        p1:
          "Valorizamos a sua experiência na nossa plataforma e agradecemos qualquer feedback que nos ajude a tornar-nos a melhor corretora do mercado.",
        p2:
          "Se encontrar algum bug ou erro, por favor, contacte-nos imediatamente.",
        p3a:
          "Além disso, estamos sempre abertos a receber sugestões e críticas construtivas sobre os nossos serviços.",
        p3b:
          "A sua opinião é fundamental para melhorar a experiência dos nossos utilizadores.",
        contact_prefix: "Para entrar em contacto, envie um email para",
        p4:
          "Muito obrigado pela sua ajuda e, mais uma vez, seja bem-vindo à revolução.",
      },
    },
  },

  "en-US": {
    support: {
      aria: { label: "Support" },
      common: { close: "Close" },
      title: { prefix: "Support" },
      subtitle: "Help us improve!",
      text: {
        p1:
          "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
        p2:
          "If you find any bug or error, please contact us immediately.",
        p3a:
          "In addition, we are always open to suggestions and constructive feedback about our services.",
        p3b:
          "Your opinion is essential to improve the experience of our users.",
        contact_prefix: "To get in touch, send an email to",
        p4:
          "Thank you very much for your help — and once again, welcome to the revolution.",
      },
    },
  },

  "en-GB": {
    support: {
      aria: { label: "Support" },
      common: { close: "Close" },
      title: { prefix: "Support" },
      subtitle: "Help us improve!",
      text: {
        p1:
          "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
        p2:
          "If you find any bug or error, please contact us immediately.",
        p3a:
          "In addition, we are always open to suggestions and constructive feedback about our services.",
        p3b:
          "Your opinion is essential to improve the experience of our users.",
        contact_prefix: "To get in touch, send an email to",
        p4:
          "Thank you very much for your help — and once again, welcome to the revolution.",
      },
    },
  },

  "en-SG": {
    support: {
      aria: { label: "Support" },
      common: { close: "Close" },
      title: { prefix: "Support" },
      subtitle: "Help us improve!",
      text: {
        p1:
          "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
        p2:
          "If you find any bug or error, please contact us immediately.",
        p3a:
          "In addition, we are always open to suggestions and constructive feedback about our services.",
        p3b:
          "Your opinion is essential to improve the experience of our users.",
        contact_prefix: "To get in touch, send an email to",
        p4:
          "Thank you very much for your help — and once again, welcome to the revolution.",
      },
    },
  },

  "es-ES": {
    support: {
      aria: { label: "Soporte" },
      common: { close: "Cerrar" },
      title: { prefix: "Soporte" },
      subtitle: "¡Ayúdanos a mejorar!",
      text: {
        p1:
          "Valoramos tu experiencia en nuestra plataforma y agradecemos cualquier comentario que nos ayude a convertirnos en el mejor bróker del mercado.",
        p2:
          "Si encuentras algún bug o error, por favor, contáctanos inmediatamente.",
        p3a:
          "Además, siempre estamos abiertos a sugerencias y críticas constructivas sobre nuestros servicios.",
        p3b:
          "Tu opinión es fundamental para mejorar la experiencia de nuestros usuarios.",
        contact_prefix: "Para ponerte en contacto, envía un correo a",
        p4:
          "Muchas gracias por tu ayuda y, una vez más, bienvenido a la revolución.",
      },
    },
  },

  // ✅ Demais locais base: fallback seguro para EN
  "fr-FR": { support: { aria: { label: "Support" }, common: { close: "Close" }, title: { prefix: "Support" }, subtitle: "Help us improve!", text: {
    p1: "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
    p2: "If you find any bug or error, please contact us immediately.",
    p3a: "In addition, we are always open to suggestions and constructive feedback about our services.",
    p3b: "Your opinion is essential to improve the experience of our users.",
    contact_prefix: "To get in touch, send an email to",
    p4: "Thank you very much for your help — and once again, welcome to the revolution.",
  } } },
  "de-DE": { support: { aria: { label: "Support" }, common: { close: "Close" }, title: { prefix: "Support" }, subtitle: "Help us improve!", text: {
    p1: "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
    p2: "If you find any bug or error, please contact us immediately.",
    p3a: "In addition, we are always open to suggestions and constructive feedback about our services.",
    p3b: "Your opinion is essential to improve the experience of our users.",
    contact_prefix: "To get in touch, send an email to",
    p4: "Thank you very much for your help — and once again, welcome to the revolution.",
  } } },
  "it-IT": { support: { aria: { label: "Support" }, common: { close: "Close" }, title: { prefix: "Support" }, subtitle: "Help us improve!", text: {
    p1: "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
    p2: "If you find any bug or error, please contact us immediately.",
    p3a: "In addition, we are always open to suggestions and constructive feedback about our services.",
    p3b: "Your opinion is essential to improve the experience of our users.",
    contact_prefix: "To get in touch, send an email to",
    p4: "Thank you very much for your help — and once again, welcome to the revolution.",
  } } },
  "ar-AE": { support: { aria: { label: "Support" }, common: { close: "Close" }, title: { prefix: "Support" }, subtitle: "Help us improve!", text: {
    p1: "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
    p2: "If you find any bug or error, please contact us immediately.",
    p3a: "In addition, we are always open to suggestions and constructive feedback about our services.",
    p3b: "Your opinion is essential to improve the experience of our users.",
    contact_prefix: "To get in touch, send an email to",
    p4: "Thank you very much for your help — and once again, welcome to the revolution.",
  } } },
  "hi-IN": { support: { aria: { label: "Support" }, common: { close: "Close" }, title: { prefix: "Support" }, subtitle: "Help us improve!", text: {
    p1: "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
    p2: "If you find any bug or error, please contact us immediately.",
    p3a: "In addition, we are always open to suggestions and constructive feedback about our services.",
    p3b: "Your opinion is essential to improve the experience of our users.",
    contact_prefix: "To get in touch, send an email to",
    p4: "Thank you very much for your help — and once again, welcome to the revolution.",
  } } },
  "id-ID": { support: { aria: { label: "Support" }, common: { close: "Close" }, title: { prefix: "Support" }, subtitle: "Help us improve!", text: {
    p1: "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
    p2: "If you find any bug or error, please contact us immediately.",
    p3a: "In addition, we are always open to suggestions and constructive feedback about our services.",
    p3b: "Your opinion is essential to improve the experience of our users.",
    contact_prefix: "To get in touch, send an email to",
    p4: "Thank you very much for your help — and once again, welcome to the revolution.",
  } } },
  "fil-PH": { support: { aria: { label: "Support" }, common: { close: "Close" }, title: { prefix: "Support" }, subtitle: "Help us improve!", text: {
    p1: "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
    p2: "If you find any bug or error, please contact us immediately.",
    p3a: "In addition, we are always open to suggestions and constructive feedback about our services.",
    p3b: "Your opinion is essential to improve the experience of our users.",
    contact_prefix: "To get in touch, send an email to",
    p4: "Thank you very much for your help — and once again, welcome to the revolution.",
  } } },
  "ms-MY": { support: { aria: { label: "Support" }, common: { close: "Close" }, title: { prefix: "Support" }, subtitle: "Help us improve!", text: {
    p1: "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
    p2: "If you find any bug or error, please contact us immediately.",
    p3a: "In addition, we are always open to suggestions and constructive feedback about our services.",
    p3b: "Your opinion is essential to improve the experience of our users.",
    contact_prefix: "To get in touch, send an email to",
    p4: "Thank you very much for your help — and once again, welcome to the revolution.",
  } } },
  "th-TH": { support: { aria: { label: "Support" }, common: { close: "Close" }, title: { prefix: "Support" }, subtitle: "Help us improve!", text: {
    p1: "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
    p2: "If you find any bug or error, please contact us immediately.",
    p3a: "In addition, we are always open to suggestions and constructive feedback about our services.",
    p3b: "Your opinion is essential to improve the experience of our users.",
    contact_prefix: "To get in touch, send an email to",
    p4: "Thank you very much for your help — and once again, welcome to the revolution.",
  } } },
  "vi-VN": { support: { aria: { label: "Support" }, common: { close: "Close" }, title: { prefix: "Support" }, subtitle: "Help us improve!", text: {
    p1: "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
    p2: "If you find any bug or error, please contact us immediately.",
    p3a: "In addition, we are always open to suggestions and constructive feedback about our services.",
    p3b: "Your opinion is essential to improve the experience of our users.",
    contact_prefix: "To get in touch, send an email to",
    p4: "Thank you very much for your help — and once again, welcome to the revolution.",
  } } },
  "zh-HK": { support: { aria: { label: "Support" }, common: { close: "Close" }, title: { prefix: "Support" }, subtitle: "Help us improve!", text: {
    p1: "We value your experience on our platform and appreciate any feedback that can help us become the best broker in the market.",
    p2: "If you find any bug or error, please contact us immediately.",
    p3a: "In addition, we are always open to suggestions and constructive feedback about our services.",
    p3b: "Your opinion is essential to improve the experience of our users.",
    contact_prefix: "To get in touch, send an email to",
    p4: "Thank you very much for your help — and once again, welcome to the revolution.",
  } } },
};

export const supportBundle = expandTo26Locales(base);
