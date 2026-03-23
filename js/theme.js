/* ==========================================================================
   MÓDULO: GERENCIAMENTO DE TEMA (LIGHT / DARK)
   Responsabilidade única: toggle, persistência e detecção do sistema
   ========================================================================== */

// Chave de persistência no localStorage
const THEME_STORAGE_KEY = "marketListTheme";

// Ícone do botão de alternância no header
const THEME_TOGGLE_BUTTON_ID = "button-theme-toggle";

/**
 * Retorna o tema preferido pelo sistema operacional do usuário
 * Usado como fallback inicial quando não há preferência salva
 *
 * @returns {string} - 'dark' ou 'light'
 */
function getSystemPreferredTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Retorna o tema atualmente salvo no localStorage
 * Se não houver preferência salva, retorna o tema do sistema
 *
 * @returns {string} - 'dark' ou 'light'
 */
function getSavedTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) || getSystemPreferredTheme();
}

/**
 * Aplica o tema ao documento via atributo data-theme no <body>
 * Atualiza o ícone do botão de alternância de forma instantânea (sem flicker)
 *
 * @param {string} themeName - 'dark' ou 'light'
 */
function applyTheme(themeName) {
  // Aplica o atributo de tema no body para ativar as CSS variables corretas
  document.body.setAttribute("data-theme", themeName);

  // Atualiza o ícone do botão de alternância
  updateThemeToggleIcon(themeName);

  // Atualiza os gráficos do dashboard se estiverem visíveis,
  // pois as cores dos gráficos são definidas em JS e não reagem às CSS variables
  updateChartsTheme(themeName);
}

/**
 * Atualiza o ícone do botão de tema no header da home
 * sunny-outline = modo claro está ativo (clique para escurecer)
 * moon-outline  = modo escuro está ativo (clique para clarear)
 *
 * @param {string} themeName - 'dark' ou 'light'
 */
function updateThemeToggleIcon(themeName) {
  const toggleButton = document.getElementById(THEME_TOGGLE_BUTTON_ID);
  if (!toggleButton) return;

  const iconElement = toggleButton.querySelector("ion-icon");
  if (!iconElement) return;

  // No tema dark: exibe ícone de sol (para voltar ao light)
  // No tema light: exibe ícone de lua (para ir para o dark)
  iconElement.setAttribute(
    "name",
    themeName === "dark" ? "sunny-outline" : "moon-outline",
  );
}

/**
 * Alterna entre os temas light e dark
 * Persiste a escolha no localStorage para manter entre sessões
 */
function toggleTheme() {
  const currentTheme = document.body.getAttribute("data-theme") || "light";
  const newTheme = currentTheme === "dark" ? "light" : "dark";

  // Persiste a preferência do usuário
  localStorage.setItem(THEME_STORAGE_KEY, newTheme);

  // Aplica o novo tema
  applyTheme(newTheme);
}

/**
 * Atualiza as cores dos gráficos Chart.js quando o tema muda
 * Necessário pois as cores dos gráficos são definidas via JS, não CSS
 *
 * @param {string} themeName - 'dark' ou 'light'
 */
function updateChartsTheme(themeName) {
  const isDark = themeName === "dark";

  // Cor dos textos dos eixos e legendas dos gráficos
  const tickColor = isDark ? "rgba(255,255,255,0.6)" : "rgba(20, 24, 27, 0.6)";
  const legendColor = isDark
    ? "rgba(255,255,255,0.7)"
    : "rgba(20, 24, 27, 0.7)";
  const gridColor = isDark
    ? "rgba(76, 51, 230, 0.08)"
    : "rgba(76, 51, 230, 0.1)";

  // Atualiza chartShareWallet (doughnut - gasto por categoria)
  if (window.chartShareWallet) {
    window.chartShareWallet.options.plugins.legend.labels.color = legendColor;
    window.chartShareWallet.update();
  }

  // Atualiza chartVolumeItens (bar - volume de itens)
  if (window.chartVolumeItens) {
    window.chartVolumeItens.options.scales.y.ticks.color = tickColor;
    window.chartVolumeItens.options.scales.x.ticks.color = tickColor;
    window.chartVolumeItens.options.scales.y.grid.color = gridColor;
    window.chartVolumeItens.update();
  }

  // Atualiza chartHealthProfile (pie - perfil de saúde)
  if (window.chartHealthProfile) {
    window.chartHealthProfile.options.plugins.legend.labels.color = legendColor;
    window.chartHealthProfile.update();
  }
}

/**
 * Inicializa o sistema de tema
 * Chamado no DOMContentLoaded para aplicar o tema antes da primeira renderização
 */
function initTheme() {
  const savedTheme = getSavedTheme();
  applyTheme(savedTheme);

  // Escuta mudanças de preferência do sistema em tempo real
  // Só aplica se o usuário não tiver feito uma escolha manual
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (event) => {
      const hasManualPreference = localStorage.getItem(THEME_STORAGE_KEY);
      if (!hasManualPreference) {
        applyTheme(event.matches ? "dark" : "light");
      }
    });
}

// Expõe as funções necessárias globalmente
window.toggleTheme = toggleTheme;
window.applyTheme = applyTheme;
window.updateChartsTheme = updateChartsTheme;

// Inicializa o tema assim que o DOM estiver pronto
document.addEventListener("DOMContentLoaded", initTheme);
