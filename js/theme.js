/* ==========================================================================
   MÓDULO: GERENCIAMENTO DE TEMA (LIGHT / DARK)
   Responsabilidads: toggle, persistência, detecção do sistema e 
   sincronização de ícones em todos os botões de tema do app
   ========================================================================== */

// Chave de persistência no localStorage
const THEME_STORAGE_KEY = "marketListTheme";

const THEME_TOGGLE_BUTTON_SELECTOR = ".theme-toggle-button";

/**
 * Retorna o tema atualmente salvo no localStorage.
 * Se não houver preferência salva, retorna o tema light.
 *
 * @returns {string} - 'dark' ou 'light'
 */
function getSavedTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) || "light";
}

/**
 * Aplica o tema ao documento via atributo data-theme no <body>.
 * Atualiza todos os ícones de tema (lua/sol) em todos os botões do app.
 *
 * @param {string} themeName - 'dark' ou 'light'
 */
function applyTheme(themeName) {
  // Aplica o atributo de tema no body para ativar as CSS variables corretas
  document.body.setAttribute("data-theme", themeName);

  updateAllThemeToggleIcons(themeName);

  // Atualiza os gráficos do dashboard se estiverem visíveis,
  // pois as cores dos gráficos são definidas em JS e não reagem às CSS variables
  updateChartsTheme(themeName);
}

/**
 * 
 * Atualiza os ícones (lua/sol) em TODOS os botões de tema do app.

 * @param {string} themeName - 'dark' ou 'light'
 */
function updateAllThemeToggleIcons(themeName) {
  const themeToggleButtons = document.querySelectorAll(
    THEME_TOGGLE_BUTTON_SELECTOR,
  );

  themeToggleButtons.forEach(function (button) {
    const iconLight = button.querySelector(".theme-icon-light");
    const iconDark = button.querySelector(".theme-icon-dark");

    if (iconLight && iconDark) {
      if (themeName === "dark") {
        // Tema escuro ativo: mostra sol (para clarear), esconde lua
        iconLight.classList.add("screen-hidden");
        iconDark.classList.remove("screen-hidden");
      } else {
        // Tema claro ativo: mostra lua (para escurecer), esconde sol
        iconLight.classList.remove("screen-hidden");
        iconDark.classList.add("screen-hidden");
      }
    }
  });
}

/**
 * Alterna entre os temas light e dark.
 * Persiste a escolha no localStorage para manter entre sessões.
 * Sincroniza todos os botões de tema do app.
 */
function toggleTheme() {
  const currentTheme = document.body.getAttribute("data-theme") || "light";
  const newTheme = currentTheme === "dark" ? "light" : "dark";

  // Persiste a preferência do usuário
  localStorage.setItem(THEME_STORAGE_KEY, newTheme);

  // Aplica o novo tema (atualiza body, ícones e gráficos)
  applyTheme(newTheme);
}

/**
 * 
 * Atualiza as cores dos gráficos Chart.js quando o tema muda.
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
 *
 * Chamado no DOMContentLoaded para aplicar o tema antes da primeira renderização.
 */
function initTheme() {
  const savedTheme = getSavedTheme();
  applyTheme(savedTheme);

  // Escuta mudanças de preferência do sistema em tempo real.
  // Só aplica se o usuário não tiver feito uma escolha manual.
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", function (event) {
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
